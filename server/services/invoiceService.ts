
import pool from "../config/db.ts";

const getFinancialYear = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;

  return `${startYear}-${String(endYear).slice(-2)}`;
};

export const createInvoiceRecord = async (orderId: number) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Reuse an existing invoice if this order was already invoiced.
    const existing = await client.query(
      `SELECT * FROM invoices WHERE order_id = $1`,
      [orderId]
    );

    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    const orderResult = await client.query(
      `SELECT
         o.id,
         o.user_id,
         o.total,
         o.items,
         o.status,
         o.payment_status,
         o.payment_gateway,
         o.cashfree_order_id,
         o.cashfree_payment_id,
         o.coupon_code,
         o.coupon_discount,
         o.delivery_charge,
         o.created_at,
         o.paid_at,
         u.name AS customer_name,
         u.email AS customer_email,
         u.phone AS customer_phone,
         a.line1,
         a.line2,
         a.city,
         a.state,
         a.pincode,
         a.label AS address_label
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [orderId]
    );

    const order = orderResult.rows[0];

    if (!order || order.payment_status !== "paid") {
      throw new Error("Cannot generate invoice for an unpaid order.");
    }

    const now = new Date();
    const financialYear = getFinancialYear(now);

    // Lock and increment the financial-year invoice counter.
    const counterResult = await client.query(
      `INSERT INTO invoice_counters (financial_year, last_number)
       VALUES ($1, 1)
       ON CONFLICT (financial_year)
       DO UPDATE SET last_number = invoice_counters.last_number + 1
       RETURNING last_number`,
      [financialYear]
    );

    const invoiceNumber =
      `PT/${financialYear}/${String(counterResult.rows[0].last_number).padStart(4, "0")}`;

    const items =
      typeof order.items === "string"
        ? JSON.parse(order.items)
        : order.items || [];

    const invoiceData = {
      seller: {
        businessName: "POSTER THEORY",
        email: process.env.INVOICE_ADMIN_EMAIL || "postertheory.store@gmail.com",
        addressLine1: process.env.INVOICE_SELLER_ADDRESS || "[Business Street Address]",
        addressLine2: process.env.INVOICE_SELLER_AREA || "[Area / Locality]",
        city: process.env.INVOICE_SELLER_CITY || "Chennai",
        state: process.env.INVOICE_SELLER_STATE || "Tamil Nadu",
        pincode: process.env.INVOICE_SELLER_PINCODE || "[PIN CODE]",
      },
      customer: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
        address: {
          label: order.address_label,
          line1: order.line1,
          line2: order.line2,
          city: order.city,
          state: order.state,
          pincode: order.pincode,
        },
      },
      order: {
        id: order.id,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        paymentGateway: order.payment_gateway,
        paymentReference: order.cashfree_payment_id || order.cashfree_order_id,
        status: order.payment_status,
      },
      items,
      couponCode: order.coupon_code,
      couponDiscount: Number(order.coupon_discount || 0),
      deliveryCharge: Number(order.delivery_charge || 0),
      total: Number(order.total),
      gstRegistered: false,
    };

    const invoiceResult = await client.query(
      `INSERT INTO invoices (
         order_id,
         invoice_number,
         financial_year,
         invoice_date,
         invoice_data
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        order.id,
        invoiceNumber,
        financialYear,
        now,
        JSON.stringify(invoiceData),
      ]
    );

    await client.query("COMMIT");

    return invoiceResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

import { generateInvoicePdf } from "./invoicePdfService.ts";
import { sendInvoiceEmail } from "./invoiceEmailService.ts";

export const generateAndEmailInvoice = async (orderId: number) => {
  try {
    const invoice = await createInvoiceRecord(orderId);

    if (invoice.email_status === "sent") {
      return invoice;
    }

    const invoiceData =
      typeof invoice.invoice_data === "string"
        ? JSON.parse(invoice.invoice_data)
        : invoice.invoice_data;

    const pdfBuffer = await generateInvoicePdf(invoice);

    await sendInvoiceEmail(
      invoice.invoice_number,
      orderId,
      invoiceData.customer.name,
      pdfBuffer
    );

    await pool.query(
      `UPDATE invoices
       SET email_status = 'sent',
           email_sent_at = NOW(),
           email_error = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [invoice.id]
    );

    console.log(
      `[Invoice] Sent ${invoice.invoice_number} for order #${orderId}`
    );

    return invoice;
  } catch (error: any) {
    console.error(
      `[Invoice] Failed for order #${orderId}:`,
      error
    );

    // Do not allow invoice errors to affect payment confirmation.
    try {
      await pool.query(
        `UPDATE invoices
         SET email_status = 'failed',
             email_error = $2,
             updated_at = NOW()
         WHERE order_id = $1`,
        [orderId, String(error?.message || error).slice(0, 2000)]
      );
    } catch (dbError) {
      console.error("[Invoice] Failed to update invoice status:", dbError);
    }

    return null;
  }
};
