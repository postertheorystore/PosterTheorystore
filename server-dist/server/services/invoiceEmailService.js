import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);
export const sendInvoiceEmail = async (invoiceNumber, orderId, customerName, pdfBuffer) => {
    const recipient = process.env.INVOICE_ADMIN_EMAIL;
    if (!recipient) {
        throw new Error("INVOICE_ADMIN_EMAIL is not configured.");
    }
    if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured.");
    }
    const { data, error } = await resend.emails.send({
        from: "Poster Theory <no-reply@postertheorystore.in>",
        to: [recipient],
        subject: `Invoice ${invoiceNumber} - Order #${orderId}`,
        html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 550px;
        margin: 0 auto;
        padding: 30px;
        color: #111;
      ">
        <h2>POSTER THEORY</h2>

        <h3>New Order Invoice Generated</h3>

        <p>Hello,</p>

        <p>
          The invoice for order <strong>#${orderId}</strong>
          has been generated successfully.
        </p>

        <p>
          <strong>Invoice Number:</strong> ${invoiceNumber}<br/>
          <strong>Customer:</strong> ${customerName}
        </p>

        <p>
          Please find the invoice PDF attached to this email.
        </p>

        <hr style="border: none; border-top: 1px solid #ddd;" />

        <p style="color: #888; font-size: 12px;">
          © Poster Theory
        </p>
      </div>
    `,
        attachments: [
            {
                filename: `${invoiceNumber.replace(/\//g, "-")}.pdf`,
                content: pdfBuffer.toString("base64"),
            },
        ],
    });
    if (error) {
        console.error("[Invoice Email] Resend error:", error);
        throw new Error(error.message || "Failed to send invoice email.");
    }
    return data;
};
