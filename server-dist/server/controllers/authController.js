import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { signupSchema, loginSchema, verifyOtpSchema, setPasswordSchema } from "../validators/schemas.js";
import { sendOtpEmail } from "../config/mailer.js";
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET environment variable is required");
    return secret;
};
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 3;
const OTP_EXPIRY_MINUTES = 10;
// Step 1: Signup - sends OTP to email
export const signup = async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { name, email, password } = parsed.data;
    try {
        // Check if email already exists and is verified
        const existing = await pool.query("SELECT id, email_verified FROM users WHERE email = $1", [email]);
        if (existing.rows[0]?.email_verified) {
            return res.status(400).json({ error: "Email already registered" });
        }
        // Delete unverified user if exists (allow re-signup)
        if (existing.rows[0] && !existing.rows[0].email_verified) {
            await pool.query("DELETE FROM users WHERE id = $1", [existing.rows[0].id]);
        }
        // Create unverified user
        const hashedPassword = await bcrypt.hash(password, 12);
        await pool.query("INSERT INTO users (name, email, password, email_verified) VALUES ($1, $2, $3, false)", [name, email, hashedPassword]);
        // Generate and send OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        // Invalidate old OTPs for this email
        await pool.query("UPDATE otp_codes SET used = true WHERE email = $1 AND type = 'signup'", [email]);
        await pool.query("INSERT INTO otp_codes (email, code, type, expires_at) VALUES ($1, $2, 'signup', $3)", [email, otp, expiresAt]);
        await sendOtpEmail(email, otp, name);
        res.status(200).json({ message: "OTP sent to your email. Please verify to complete signup.", email });
    }
    catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ error: "Signup failed" });
    }
};
// Step 2: Verify OTP to complete signup
export const verifyOtp = async (req, res) => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { email, code } = parsed.data;
    try {
        const otpResult = await pool.query("SELECT * FROM otp_codes WHERE email = $1 AND type = 'signup' AND used = false ORDER BY created_at DESC LIMIT 1", [email]);
        const otpRecord = otpResult.rows[0];
        if (!otpRecord) {
            return res.status(400).json({ error: "No pending OTP found. Please sign up again." });
        }
        // Check expiry
        if (new Date() > new Date(otpRecord.expires_at)) {
            await pool.query("UPDATE otp_codes SET used = true WHERE id = $1", [otpRecord.id]);
            return res.status(400).json({ error: "OTP expired. Please sign up again." });
        }
        // Check attempts
        if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
            await pool.query("UPDATE otp_codes SET used = true WHERE id = $1", [otpRecord.id]);
            return res.status(429).json({ error: "No attempts remaining. Please resend OTP.", exhausted: true });
        }
        // Increment attempts
        await pool.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [otpRecord.id]);
        // Verify code
        if (otpRecord.code !== code) {
            const remaining = MAX_OTP_ATTEMPTS - otpRecord.attempts - 1;
            if (remaining <= 0) {
                await pool.query("UPDATE otp_codes SET used = true WHERE id = $1", [otpRecord.id]);
                return res.status(400).json({ error: "Invalid OTP. No attempts remaining. Please resend OTP.", exhausted: true });
            }
            return res.status(400).json({ error: `Invalid OTP. ${remaining} attempt(s) remaining.` });
        }
        // Mark OTP as used and verify user
        await pool.query("UPDATE otp_codes SET used = true WHERE id = $1", [otpRecord.id]);
        await pool.query("UPDATE users SET email_verified = true WHERE email = $1", [email]);
        // Get user and issue token
        const userResult = await pool.query("SELECT id, name, email, phone, is_admin FROM users WHERE email = $1", [email]);
        const user = userResult.rows[0];
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name, is_admin: user.is_admin }, getJwtSecret(), { expiresIn: '24h' });
        res.json({ message: "Email verified successfully!", token, user });
    }
    catch (err) {
        console.error("OTP verify error:", err);
        res.status(500).json({ error: "Verification failed" });
    }
};
// Resend OTP
export const resendOtp = async (req, res) => {
    const { email } = req.body;
    if (!email)
        return res.status(400).json({ error: "Email required" });
    try {
        const user = await pool.query("SELECT name, email_verified FROM users WHERE email = $1", [email]);
        if (!user.rows[0])
            return res.status(400).json({ error: "No signup found for this email" });
        if (user.rows[0].email_verified)
            return res.status(400).json({ error: "Email already verified" });
        // Rate limit: max 5 OTPs in 10 minutes
        const recentOtps = await pool.query("SELECT COUNT(*) as count FROM otp_codes WHERE email = $1 AND type = 'signup' AND created_at > NOW() - INTERVAL '10 minutes'", [email]);
        if (parseInt(recentOtps.rows[0].count) >= 5) {
            return res.status(429).json({ error: "Too many OTP requests. Try again in a few minutes." });
        }
        // Invalidate old and create new
        await pool.query("UPDATE otp_codes SET used = true WHERE email = $1 AND type = 'signup'", [email]);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        await pool.query("INSERT INTO otp_codes (email, code, type, expires_at) VALUES ($1, $2, 'signup', $3)", [email, otp, expiresAt]);
        await sendOtpEmail(email, otp, user.rows[0].name);
        res.json({ message: "New OTP sent to your email." });
    }
    catch (err) {
        console.error("Resend OTP error:", err);
        res.status(500).json({ error: "Failed to resend OTP" });
    }
};
// Login with brute-force protection
export const login = async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { email, password } = parsed.data;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    try {
        // Check if locked out (too many failed attempts from this IP or for this email)
        const recentFailed = await pool.query("SELECT COUNT(*) as count FROM login_attempts WHERE (email = $1 OR ip = $2) AND success = false AND created_at > NOW() - make_interval(mins => $3)", [email, ip, LOCKOUT_MINUTES]);
        if (parseInt(recentFailed.rows[0].count) >= MAX_LOGIN_ATTEMPTS) {
            return res.status(429).json({ error: `Too many failed attempts. Try again after ${LOCKOUT_MINUTES} minutes.` });
        }
        const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = rows[0];
        if (!user || !user.email_verified) {
            await pool.query("INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, false)", [email, ip]);
            return res.status(400).json({ error: "Invalid email or password" });
        }
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            await pool.query("INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, false)", [email, ip]);
            return res.status(400).json({ error: "Invalid email or password" });
        }
        // Successful login - record it and clear failed attempts for this email
        await pool.query("INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, true)", [email, ip]);
        const isAdmin = Boolean(user.is_admin);
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name, is_admin: isAdmin }, getJwtSecret(), { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, is_admin: isAdmin } });
    }
    catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Login failed" });
    }
};
export const getMe = async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id, name, email, phone, is_admin FROM users WHERE id = $1", [req.user.id]);
        if (!rows[0])
            return res.status(404).json({ error: "User not found" });
        res.json({ user: rows[0] });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch user" });
    }
};
export const setPassword = async (req, res) => {
    const parsed = setPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    try {
        const user = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
        if (!user.rows[0])
            return res.status(404).json({ error: "User not found" });
        if (user.rows[0].password !== "GOOGLE_OAUTH_USER") {
            return res.status(400).json({ error: "Password already set" });
        }
        const hashed = await bcrypt.hash(parsed.data.password, 12);
        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, req.user.id]);
        res.json({ message: "Password set successfully" });
    }
    catch (err) {
        console.error("Set password error:", err);
        res.status(500).json({ error: "Failed to set password" });
    }
};
// Forgot password - send reset OTP
export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email)
        return res.status(400).json({ error: "Email is required" });
    try {
        // Always respond the same way regardless of whether email exists
        const genericMessage = "If this email is registered in our system, you will receive a reset code shortly.";
        const userResult = await pool.query("SELECT name, email_verified FROM users WHERE email = $1", [email]);
        const user = userResult.rows[0];
        if (!user || !user.email_verified) {
            // Don't reveal that email doesn't exist — respond identically
            return res.json({ message: genericMessage });
        }
        // Rate limit
        const recentOtps = await pool.query("SELECT COUNT(*) as count FROM otp_codes WHERE email = $1 AND type = 'reset' AND created_at > NOW() - INTERVAL '10 minutes'", [email]);
        if (parseInt(recentOtps.rows[0].count) >= 3) {
            // Still respond generically to not leak info
            return res.json({ message: genericMessage });
        }
        await pool.query("UPDATE otp_codes SET used = true WHERE email = $1 AND type = 'reset'", [email]);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        await pool.query("INSERT INTO otp_codes (email, code, type, expires_at) VALUES ($1, $2, 'reset', $3)", [email, otp, expiresAt]);
        await sendOtpEmail(email, otp, user.name, 'reset');
        res.json({ message: genericMessage });
    }
    catch (err) {
        console.error("Forgot password error:", err);
        res.status(500).json({ error: "Something went wrong. Please try again." });
    }
};
// Reset password with OTP
// Admin: get all users
export const getAdminUsers = async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id, name, email, phone, email_verified, is_admin, created_at FROM users ORDER BY created_at DESC");
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
};
export const resetPassword = async (req, res) => {
    const { email, code, password } = req.body;
    const parsed = setPasswordSchema.safeParse({ password });
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    if (!email || !code)
        return res.status(400).json({ error: "Email and code are required" });
    try {
        const otpResult = await pool.query("SELECT * FROM otp_codes WHERE email = $1 AND type = 'reset' AND used = false ORDER BY created_at DESC LIMIT 1", [email]);
        const otpRecord = otpResult.rows[0];
        if (!otpRecord)
            return res.status(400).json({ error: "No pending reset code found." });
        if (new Date() > new Date(otpRecord.expires_at)) {
            await pool.query("UPDATE otp_codes SET used = true WHERE id = $1", [otpRecord.id]);
            return res.status(400).json({ error: "Code expired. Please request a new one." });
        }
        if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
            await pool.query("UPDATE otp_codes SET used = true WHERE id = $1", [otpRecord.id]);
            return res.status(429).json({ error: "Too many attempts. Request a new code." });
        }
        await pool.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [otpRecord.id]);
        if (otpRecord.code !== code) {
            const remaining = MAX_OTP_ATTEMPTS - otpRecord.attempts - 1;
            return res.status(400).json({ error: `Invalid code. ${remaining} attempt(s) remaining.` });
        }
        await pool.query("UPDATE otp_codes SET used = true WHERE id = $1", [otpRecord.id]);
        const hashed = await bcrypt.hash(parsed.data.password, 12);
        await pool.query("UPDATE users SET password = $1 WHERE email = $2", [hashed, email]);
        res.json({ message: "Password reset successfully. You can now sign in." });
    }
    catch (err) {
        console.error("Reset password error:", err);
        res.status(500).json({ error: "Failed to reset password" });
    }
};
