import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);
export const sendOtpEmail = async (email, otp, name, type = "signup") => {
    const isReset = type === "reset";
    const subject = isReset
        ? "Reset your Poster Theory password"
        : "Verify your Poster Theory account";
    const heading = isReset
        ? "RESET YOUR PASSWORD"
        : "VERIFY YOUR EMAIL";
    const message = isReset
        ? "Use the verification code below to reset your Poster Theory password."
        : "Use the verification code below to verify your Poster Theory account.";
    const { data, error } = await resend.emails.send({
        from: "Poster Theory <no-reply@postertheorystore.in>",
        to: [email],
        subject,
        html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 500px;
        margin: 0 auto;
        padding: 30px;
        color: #111;
      ">

        <h2 style="
          margin-bottom: 8px;
          font-size: 24px;
        ">
          POSTER THEORY
        </h2>

        ${name
            ? `<p style="font-size: 14px;">Hi ${name},</p>`
            : ""}

        <h3 style="
          font-size: 18px;
          margin-top: 25px;
        ">
          ${heading}
        </h3>

        <p style="
          font-size: 14px;
          line-height: 1.6;
        ">
          ${message}
        </p>

        <div style="
          background: #f4f4f4;
          padding: 20px;
          text-align: center;
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          margin: 25px 0;
          border: 1px solid #ddd;
        ">
          ${otp}
        </div>

        <p style="
          font-size: 14px;
          line-height: 1.6;
        ">
          This code will expire in <strong>10 minutes</strong>.
        </p>

        <p style="
          color: #777;
          font-size: 13px;
          line-height: 1.5;
          margin-top: 30px;
        ">
          If you didn't request this code, you can safely ignore this email.
        </p>

        <hr style="
          border: none;
          border-top: 1px solid #ddd;
          margin: 30px 0;
        ">

        <p style="
          color: #999;
          font-size: 11px;
        ">
          © Poster Theory
        </p>

      </div>
    `,
    });
    if (error) {
        console.error("Resend email error:", error);
        throw new Error("Failed to send OTP email");
    }
    return data;
};
