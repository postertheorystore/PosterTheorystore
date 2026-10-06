import { Response } from "express";
import crypto from "crypto";
import pool from "../config/db.ts";
import { createOrderSchema } from "../validators/schemas.ts";
import { prepareOrder, recordProductOrderEvents } from "./orderController.ts";
import { evaluateCoupon, normalizeCouponCode, PublicCoupon } from "./couponController.ts";
import {
  CashfreeApiError,
  CashfreeConfigError,
  CashfreeOrder,
  CashfreePayment,
  createCashfreeOrder,
  getCashfreeEnvironment,
  getCashfreeOrder,
  getCashfreeOrderPayments,
  verifyWebhookSignature,
} from "../services/cashfree.ts";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Deterministic JSON so the same cart always hashes to the same fingerprint. */
const stable = (v: any): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
};

/**
 * Identifies "this exact cart going to this exact address". Client prices and
 * images are deliberately excluded (prices are server-decided, images are huge).
 */
const fingerprintOf = (items: any[], addressId: number) => {
  const slim = items.map((i) => ({
    cartItemId: i.cartItemId ?? null,
    id: i.id ?? null,
    title: i.title ?? null,
    quantity: Math.max(1, Math.min(100, parseInt(i.quantity) || 1)),
    size: i.size ?? null,
    customSpecs: i.customSpecs ?? null,
  }));
  return crypto.createHash("sha256").update(stable({ items: slim, addressId })).digest("hex");
};

const sameAmount = (a: unknown, b: unknown) => Math.abs(Number(a) - Number(b)) < 0.005;

/** Cashfree requires a 10 digit Indian mobile number. */
const normalisePhone = (raw: string | null | undefined) => {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};

const findOpenOrder = async (userId: number, fingerprint: string) => {
  const { rows } = await pool.query(
    `SELECT * FROM orders
     WHERE user_id = $1 AND checkout_fingerprint = $2 AND payment_status IN ('pending', 'failed')
     ORDER BY id DESC LIMIT 1`,
    [userId, fingerprint]
  );
  return rows[0] || null;
};

const gatewayErrorResponse = (err: unknown, res: Response, label: string) => {
  console.error(`${label}:`, err);
  if (err instanceof CashfreeConfigError) {
    return res.status(500).json({ error: "Payment gateway is not configured. Please contact support." });
  }
  if (err instanceof CashfreeApiError) {
    return res.status(502).json({ error: "Payment gateway is unavailable right now. Please try again in a moment." });
  }
  return res.status(500).json({ error: "Something went wrong with the payment. Please try again." });
};

/* ------------------------------------------------------------------ */
/* payment state machine (single source of truth for paid / failed)    */
/* ------------------------------------------------------------------ */

const markOrderPaid = async (order: any, payment: CashfreePayment | undefined) => {
  const client = await pool.connect();
  let updated: any = null;
  try {
    await client.query("BEGIN");
    // Conditional update => only ONE caller (verify vs webhook) ever "wins".
    const r = await client.query(
      `UPDATE orders
       SET payment_status = 'paid', status = 'order_placed', paid_at = NOW(),
           cashfree_payment_id = $2, payment_failure_reason = NULL, updated_at = NOW()
       WHERE id = $1 AND payment_status <> 'paid'
       RETURNING *`,
      [order.id, payment?.cf_payment_id != null ? String(payment.cf_payment_id) : null]
    );
    updated = r.rows[0] || null;
    if (updated) {
      await client.query(
        "INSERT INTO order_status_history (order_id, status, note) VALUES ($1, 'order_placed', 'Payment confirmed via Cashfree')",
        [order.id]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

        if (updated.coupon_id) {
        // Atomic cap: two simultaneous payments can never both take the last use.
        const used = await client.query(
          `UPDATE coupons SET used_count = used_count + 1
           WHERE id = $1 AND (max_uses = 0 OR used_count < max_uses)
           RETURNING id`,
          [updated.coupon_id]
        );
        if (used.rowCount === 0) {
          // Coupon ran out between checkout and payment. The customer already paid the
          // price we showed them, so we honour the order and just flag it.
          console.warn(`[coupon] limit reached at payment time order=${updated.id} coupon=${updated.coupon_id}`);
        }
      }

  // Side effects run once, by whoever flipped the order to paid.
  if (updated) {
    try {
      const items = typeof updated.items === "string" ? JSON.parse(updated.items) : updated.items || [];
      await recordProductOrderEvents(updated.id, updated.user_id, items);
    } catch (err) {
      console.error("Failed to record product order events:", err);
    }
  }
  return updated;
};

const markOrderFailed = (orderId: number, reason: string) =>
  pool.query(
    `UPDATE orders SET payment_status = 'failed', payment_failure_reason = $2, updated_at = NOW()
     WHERE id = $1 AND payment_status <> 'paid'`,
    [orderId, reason]
  );

export type SyncState = "paid" | "failed" | "cancelled" | "processing";
interface SyncResult {
  state: SyncState;
  reason?: string;
  cfOrder?: CashfreeOrder;
}

/**
 * Asks Cashfree (server to server, with the secret) what really happened and
 * updates our DB accordingly. Used by BOTH the verify endpoint and the webhook,
 * so neither ever trusts a browser redirect or an unverified payload.
 */
const syncPaymentStatus = async (order: any): Promise<SyncResult> => {
  if (order.payment_status === "paid") return { state: "paid" };
  if (!order.cashfree_order_id) return { state: "cancelled" };

  const cfId: string = order.cashfree_order_id;
  const [cfOrder, payments] = await Promise.all([getCashfreeOrder(cfId), getCashfreeOrderPayments(cfId)]);

  const success = payments.find((p) => p.payment_status === "SUCCESS");
  if (cfOrder.order_status === "PAID" || success) {
    if (!sameAmount(cfOrder.order_amount, order.total)) {
      // Money moved but the amount is not what we asked for. Do NOT auto-confirm.
      console.error(
        `[payments] AMOUNT MISMATCH order=${order.id} cf=${cfId} expected=${order.total} got=${cfOrder.order_amount}`
      );
      return { state: "processing", reason: "Your payment is under review. Please contact support.", cfOrder };
    }
    await markOrderPaid(order, success);
    return { state: "paid", cfOrder };
  }

  if (payments.some((p) => p.payment_status === "PENDING")) {
    return { state: "processing", cfOrder };
  }

  if (["EXPIRED", "TERMINATED", "TERMINATION_REQUESTED"].includes(cfOrder.order_status)) {
    const reason = "The payment session expired.";
    await markOrderFailed(order.id, reason);
    return { state: "failed", reason, cfOrder };
  }

  const attempts = payments
    .filter((p) => p.payment_status !== "NOT_ATTEMPTED")
    .sort((a, b) => new Date(b.payment_time || 0).getTime() - new Date(a.payment_time || 0).getTime());

  // Nothing attempted, or the customer closed the window: not a failure.
  if (attempts.length === 0 || attempts[0].payment_status === "USER_DROPPED") {
    return { state: "cancelled", cfOrder };
  }

  const reason = attempts[0].error_details?.error_description || attempts[0].payment_message || "Payment failed.";
  await markOrderFailed(order.id, reason);
  return { state: "failed", reason, cfOrder };
};

/* ------------------------------------------------------------------ */
/* POST /api/payments/create                                           */
/* ------------------------------------------------------------------ */

export const createPayment = async (req: any, res: Response) => {
  // Same body + validation as the old POST /api/orders.
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { items, address_id } = parsed.data as { items: any; address_id: number };
  const userId: number = req.user.id;

  try {
    const rawItems = Array.isArray(items) ? items : JSON.parse(items);

    // 1) Validate + price on the server. The amount below is the ONLY amount ever charged.
    const quote = await prepareOrder(userId, rawItems, address_id, { uploadImages: false });
    if (!quote.ok) return res.status(quote.status).json({ error: quote.error });

    const fingerprint = fingerprintOf(rawItems, address_id);

        // 1b) Optional coupon, checked against the SERVER subtotal.
    const couponCode = normalizeCouponCode(req.body?.coupon_code);
    let coupon: PublicCoupon | null = null;
    let discount = 0;
    let payable = quote.serverTotal;
    if (couponCode) {
      const check = await evaluateCoupon(couponCode, quote.serverTotal);
      if (!check.ok) {
        return res.status(check.status).json({ error: check.error, coupon_invalid: true });
      }
      coupon = check.coupon;
      discount = check.discount;
      payable = check.finalAmount;
    }

    // 2) This exact cart was already paid moments ago (double submit / back button).
    const paidDup = await pool.query(
      `SELECT id, cashfree_order_id FROM orders
       WHERE user_id = $1 AND checkout_fingerprint = $2 AND payment_status = 'paid'
         AND paid_at > NOW() - INTERVAL '30 minutes'
       ORDER BY id DESC LIMIT 1`,
      [userId, fingerprint]
    );
    if (paidDup.rows[0]) {
      return res.json({
        already_paid: true,
        order_id: paidDup.rows[0].id,
        cashfree_order_id: paidDup.rows[0].cashfree_order_id,
      });
    }

    // 3) Reuse the open (unpaid) order for this cart if there is one.
    let order = await findOpenOrder(userId, fingerprint);
    let liveCfOrder: CashfreeOrder | undefined;

    if (order?.cashfree_order_id) {
      // Never open a second payment for something that may already be paid.
      const synced = await syncPaymentStatus(order);
      if (synced.state === "paid") {
        return res.json({ already_paid: true, order_id: order.id, cashfree_order_id: order.cashfree_order_id });
      }
      liveCfOrder = synced.cfOrder;
      order = await findOpenOrder(userId, fingerprint); // refresh (sync may have changed it)
    }

    // Prices changed since that order was created -> retire it and start clean.
       if (order && (!sameAmount(order.total, payable) || (order.coupon_id ?? null) !== (coupon?.id ?? null))) {
      await pool.query(
        `UPDATE orders
         SET checkout_fingerprint = NULL, payment_status = 'failed', status = 'cancelled',
             payment_failure_reason = 'Superseded: prices changed', updated_at = NOW()
         WHERE id = $1 AND payment_status <> 'paid'`,
        [order.id]
      );
      order = null;
      liveCfOrder = undefined;
    }

    // 4) No open order: create it (this is where custom images go to Cloudinary).
    if (!order) {
      const full = await prepareOrder(userId, rawItems, address_id, { uploadImages: true });
      if (!full.ok) return res.status(full.status).json({ error: full.error });

      try {
          const ins = await pool.query(
          `INSERT INTO orders (user_id, total, status, items, address_id, payment_status, payment_gateway,
                               checkout_fingerprint, coupon_id, coupon_code, coupon_discount)
           VALUES ($1, $2, 'pending_payment', $3, $4, 'pending', 'cashfree', $5, $6, $7, $8)
           RETURNING *`,
          [userId, payable, JSON.stringify(full.processedItems), address_id, fingerprint,
           coupon?.id ?? null, coupon?.code ?? null, discount]
        );
        order = ins.rows[0];
      } catch (err: any) {
        // Two simultaneous requests: the unique index let only one insert through.
        if (err?.code === "23505") {
          order = await findOpenOrder(userId, fingerprint);
        }
        if (!order) throw err;
      }
    }

    // 5) Reuse a still-active Cashfree session, otherwise create a fresh one.
    let cashfreeOrderId: string = order.cashfree_order_id;
    let paymentSessionId: string | undefined;

    if (liveCfOrder && liveCfOrder.order_status === "ACTIVE" && liveCfOrder.payment_session_id) {
      paymentSessionId = liveCfOrder.payment_session_id;
      await pool.query(
        `UPDATE orders SET payment_status = 'pending', payment_failure_reason = NULL, updated_at = NOW()
         WHERE id = $1 AND payment_status <> 'paid'`,
        [order.id]
      );
    } else {
      const u = await pool.query("SELECT id, name, email, phone FROM users WHERE id = $1", [userId]);
      const customer = u.rows[0];
      const phone = normalisePhone(customer?.phone);
      if (!phone) {
        return res
          .status(400)
          .json({ error: "Please add a valid 10 digit mobile number to your profile before paying." });
      }

      cashfreeOrderId = `PT-${order.id}-${Date.now().toString(36)}`;
      const created = await createCashfreeOrder({
        cfOrderId: cashfreeOrderId,
        amount: Number(order.total),
        customer: {
          id: `user_${customer.id}`,
          name: customer.name,
          email: customer.email,
          phone,
        },
        note: `Poster Theory order #${order.id}`,
      });
      paymentSessionId = created.payment_session_id;

      await pool.query(
        `UPDATE orders
         SET cashfree_order_id = $2, payment_gateway = 'cashfree', payment_status = 'pending',
             payment_failure_reason = NULL, updated_at = NOW()
         WHERE id = $1 AND payment_status <> 'paid'`,
        [order.id, cashfreeOrderId]
      );
    }

    // Only what the browser needs to launch Cashfree checkout. No secrets.
    return res.json({
      order_id: order.id,
      cashfree_order_id: cashfreeOrderId,
      payment_session_id: paymentSessionId,
      amount: Number(order.total),
      environment: getCashfreeEnvironment(),
    });
  } catch (err) {
    return gatewayErrorResponse(err, res, "Create payment error");
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/payments/verify/:cashfreeOrderId                           */
/* ------------------------------------------------------------------ */

export const verifyPayment = async (req: any, res: Response) => {
  const cfOrderId = String(req.params.cashfreeOrderId || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cfOrderId)) {
    return res.status(400).json({ error: "Invalid payment reference." });
  }

  try {
    // Scoped to the authenticated user: nobody can poll someone else's order.
    const { rows } = await pool.query("SELECT * FROM orders WHERE cashfree_order_id = $1 AND user_id = $2", [
      cfOrderId,
      req.user.id,
    ]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "Payment not found." });

    const result = await syncPaymentStatus(order);
    return res.json({ state: result.state, reason: result.reason, order_id: order.id });
  } catch (err) {
    return gatewayErrorResponse(err, res, "Verify payment error");
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/payments/webhook   (public, signature-verified, raw body) */
/* ------------------------------------------------------------------ */

export const cashfreeWebhook = async (req: any, res: Response) => {
  const raw: Buffer | undefined = Buffer.isBuffer(req.body) ? req.body : undefined;
  if (!raw) {
    console.error("[webhook] body is not raw. Mount this route with express.raw() BEFORE express.json().");
    return res.status(400).json({ error: "Bad request" });
  }

  const valid = verifyWebhookSignature(
    raw,
    req.header("x-webhook-timestamp"),
    req.header("x-webhook-signature")
  );
  if (!valid) return res.status(401).json({ error: "Invalid signature" });

  try {
    const payload = JSON.parse(raw.toString("utf8"));
    const cfOrderId: string | undefined = payload?.data?.order?.order_id;

    // Dashboard "test" pings and unrelated events: acknowledge and ignore.
    if (!cfOrderId) return res.status(200).json({ received: true });

    const { rows } = await pool.query("SELECT * FROM orders WHERE cashfree_order_id = $1", [cfOrderId]);
    if (!rows[0]) return res.status(200).json({ received: true });

    // The payload is only a trigger. The truth is fetched from Cashfree.
    await syncPaymentStatus(rows[0]);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[webhook] processing error:", err);
    // Non-2xx makes Cashfree retry later.
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};