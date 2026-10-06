import { Response } from "express";
import pool from "../config/db.ts";
import type { AuthRequest } from "../middleware/authMiddleware.ts"; // adjust path
import { prepareOrder } from "./orderController.ts";

export interface PublicCoupon {
  id: number;
  code: string;
  type: "percent" | "flat";
  value: number;
  free_shipping: boolean;
}

export type CouponCheck =
  | { ok: true; coupon: PublicCoupon; discount: number; finalAmount: number }
  | { ok: false; status: number; error: string };

/** Same character rules the admin createCoupon uses when storing codes. */
export const normalizeCouponCode = (raw: unknown): string =>
  typeof raw === "string" ? raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30) : "";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pure validation + discount math against a SERVER-computed subtotal.
 * Never writes to the DB (validation must not consume the coupon).
 */
export const evaluateCoupon = async (code: string, subtotal: number): Promise<CouponCheck> => {
  const fail = (status: number, error: string): CouponCheck => ({ ok: false, status, error });

  if (!code || code.length < 3) return fail(400, "Please enter a valid coupon code.");

  const { rows } = await pool.query(
    `SELECT id, code, type, value, min_order, max_uses, used_count, free_shipping, is_active,
            (expires_at IS NOT NULL AND expires_at <= NOW()) AS expired
     FROM coupons WHERE UPPER(code) = $1 LIMIT 1`,
    [code]
  );
  const c = rows[0];

  if (!c) return fail(404, "This coupon code is not valid.");
  if (!c.is_active) return fail(400, "This coupon is no longer active.");
  if (c.expired) return fail(400, "This coupon has expired.");
  if (c.max_uses > 0 && c.used_count >= c.max_uses) return fail(400, "This coupon has been fully redeemed.");
  if (subtotal < (c.min_order || 0)) {
    return fail(400, `This coupon needs a minimum order of ₹${c.min_order}.`);
  }

  const raw = c.type === "percent" ? Math.floor((subtotal * c.value) / 100) : c.value;
  // Never exceed the order, and always leave at least ₹1 (Cashfree rejects a ₹0 order).
  const discount = Math.max(0, Math.min(raw, Math.floor(subtotal) - 1));
  if (discount <= 0) return fail(400, "This coupon doesn't apply to your order.");

  return {
    ok: true,
    discount,
    finalAmount: round2(subtotal - discount),
    coupon: {
      id: c.id,
      code: c.code,
      type: c.type,
      value: c.value,
      free_shipping: !!c.free_shipping,
    },
  };
};

/** POST /api/coupons/validate */
export const validateCoupon = async (req: AuthRequest, res: Response) => {
  const code = normalizeCouponCode(req.body?.code);
  const addressId = parseInt(req.body?.address_id, 10);
  const items = req.body?.items;

  if (!code) return res.status(400).json({ valid: false, error: "Please enter a coupon code." });
  if (!Number.isInteger(addressId) || addressId <= 0) {
    return res.status(400).json({ valid: false, error: "Please select a delivery address first." });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({ valid: false, error: "Your bag is empty." });
  }

  try {
    // Subtotal comes from the server's own pricing. `order_amount` from the client is ignored.
    const quote = await prepareOrder(req.user!.id, items, addressId, { uploadImages: false });
    if (!quote.ok) return res.status(quote.status).json({ valid: false, error: quote.error });

    const check = await evaluateCoupon(code, quote.serverTotal);
    if (!check.ok) return res.status(check.status).json({ valid: false, error: check.error });

    return res.json({
      valid: true,
      coupon: check.coupon,
      subtotal: quote.serverTotal,
      discount: check.discount,
      final_amount: check.finalAmount,
    });
  } catch (err) {
    console.error("Validate coupon error:", err);
    return res.status(500).json({ valid: false, error: "Could not validate the coupon. Please try again." });
  }
};