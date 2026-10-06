import crypto from "crypto";

/**
 * Thin server-side wrapper around the Cashfree Payment Gateway REST API.
 * Uses Node's built-in fetch (Node 18+), so no extra dependency is needed.
 *
 * Env is read lazily (inside functions) so it works regardless of when
 * dotenv.config() runs relative to ES module imports.
 */

export class CashfreeConfigError extends Error {}
export class CashfreeApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type CashfreeEnvironment = "sandbox" | "production";

export interface CashfreeOrder {
  cf_order_id: number | string;
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED" | string;
  payment_session_id: string;
}

export interface CashfreePayment {
  cf_payment_id: number | string;
  payment_status: "SUCCESS" | "NOT_ATTEMPTED" | "FAILED" | "USER_DROPPED" | "VOID" | "CANCELLED" | "PENDING" | string;
  payment_amount?: number;
  payment_message?: string;
  payment_time?: string;
  error_details?: { error_description?: string } | null;
}

export const getCashfreeEnvironment = (): CashfreeEnvironment =>
  (process.env.CASHFREE_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";

const baseUrl = () =>
  getCashfreeEnvironment() === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";

const authHeaders = () => {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new CashfreeConfigError("CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET are not set");
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-version": process.env.CASHFREE_API_VERSION || "2023-08-01",
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
  };
};

async function cfFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method || "GET",
    headers: authHeaders(),
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    throw new CashfreeApiError(res.status, json?.message || text || "Cashfree request failed", json?.code);
  }
  return json as T;
}

export interface CreateCashfreeOrderInput {
  cfOrderId: string; // our unique id sent to Cashfree
  amount: number; // INR, decided by the server
  customer: { id: string; name: string; email: string; phone: string };
  note?: string;
}

export const createCashfreeOrder = async (input: CreateCashfreeOrderInput): Promise<CashfreeOrder> => {
  const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  if (!frontendUrl) throw new CashfreeConfigError("FRONTEND_URL is not set");

  const publicBackend = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");

  const orderMeta: Record<string, string> = {
    // Cashfree substitutes {order_id} with the real order id on redirect.
    return_url: `${frontendUrl}/payment?cf_order_id={order_id}`,
  };
  // Cashfree only accepts https webhooks. Skipped on plain-http local dev.
  if (publicBackend.startsWith("https://")) {
    orderMeta.notify_url = `${publicBackend}/api/payments/webhook`;
  }

  return cfFetch<CashfreeOrder>("/orders", {
    method: "POST",
    body: {
      order_id: input.cfOrderId,
      order_amount: Number(input.amount.toFixed(2)),
      order_currency: "INR",
      customer_details: {
        customer_id: input.customer.id,
        customer_name: input.customer.name,
        customer_email: input.customer.email,
        customer_phone: input.customer.phone,
      },
      order_meta: orderMeta,
      order_expiry_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      order_note: input.note,
    },
  });
};

export const getCashfreeOrder = (cfOrderId: string) =>
  cfFetch<CashfreeOrder>(`/orders/${encodeURIComponent(cfOrderId)}`);

export const getCashfreeOrderPayments = async (cfOrderId: string): Promise<CashfreePayment[]> => {
  const data = await cfFetch<CashfreePayment[]>(`/orders/${encodeURIComponent(cfOrderId)}/payments`);
  return Array.isArray(data) ? data : [];
};

/**
 * Cashfree webhook signature:
 *   base64( HMAC-SHA256( timestamp + rawBody, clientSecret ) )
 * `rawBody` must be the exact bytes received, NOT re-serialised JSON.
 */
export const verifyWebhookSignature = (
  rawBody: Buffer,
  timestamp: string | undefined,
  signature: string | undefined
): boolean => {
  const secret = process.env.CASHFREE_CLIENT_SECRET;
  if (!secret || !timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(timestamp + rawBody.toString("utf8"))
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};