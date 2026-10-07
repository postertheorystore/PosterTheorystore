import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET environment variable is required");
    return secret;
};
const getOAuth2Client = () => {
    return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${process.env.APP_URL}/api/auth/google/callback`);
};
// Exchange short-lived auth code for JWT token
export const exchangeAuthCode = async (req, res) => {
    const { code } = req.body;
    if (!code)
        return res.status(400).json({ error: "Code is required" });
    try {
        const otpResult = await pool.query("SELECT * FROM otp_codes WHERE code = $1 AND type = 'oauth_code' AND used = false ORDER BY created_at DESC LIMIT 1", [code]);
        const record = otpResult.rows[0];
        if (!record)
            return res.status(400).json({ error: "Invalid or expired code" });
        // Mark as used immediately
        await pool.query("UPDATE otp_codes SET used = true WHERE id = $1", [record.id]);
        // Check expiry
        if (new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ error: "Code expired" });
        }
        // Fetch user
        const userResult = await pool.query("SELECT id, name, email, phone, password, is_admin FROM users WHERE email = $1", [record.email]);
        const user = userResult.rows[0];
        if (!user)
            return res.status(400).json({ error: "User not found" });
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name, is_admin: Boolean(user.is_admin) }, getJwtSecret(), { expiresIn: "24h" });
        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone || '', is_admin: Boolean(user.is_admin) },
            needsPassword: user.password === "GOOGLE_OAUTH_USER",
        });
    }
    catch (err) {
        console.error("Exchange auth code error:", err);
        res.status(500).json({ error: "Failed to exchange code" });
    }
};
// Generate Google OAuth URL
export const googleAuthUrl = async (req, res) => {
    const client = getOAuth2Client();
    const url = client.generateAuthUrl({
        access_type: "offline",
        scope: ["openid", "email", "profile"],
        prompt: "consent",
    });
    res.json({ url });
};
// Handle Google OAuth callback
export const googleCallback = async (req, res) => {
    const { code } = req.query;
    if (!code)
        return res.status(400).json({ error: "No authorization code" });
    try {
        const client = getOAuth2Client();
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        // Verify the ID token
        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            return res.status(400).json({ error: "Invalid Google token" });
        }
        const { email, name, email_verified } = payload;
        if (!email_verified) {
            return res.status(400).json({ error: "Google email not verified" });
        }
        // Check if user exists
        let userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        let user = userResult.rows[0];
        if (!user) {
            // Create new user (no password needed for OAuth users)
            const result = await pool.query("INSERT INTO users (name, email, password, email_verified) VALUES ($1, $2, $3, true) RETURNING *", [name || email.split("@")[0], email, "GOOGLE_OAUTH_USER"]);
            user = result.rows[0];
        }
        else if (!user.email_verified) {
            // If they signed up with email but didn't verify, mark as verified via Google
            await pool.query("UPDATE users SET email_verified = true, name = COALESCE(NULLIF(name, ''), $1) WHERE id = $2", [name || user.name, user.id]);
            user.email_verified = true;
            user.name = name || user.name;
        }
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name, is_admin: Boolean(user.is_admin) }, getJwtSecret(), { expiresIn: "24h" });
        const needsPassword = user.password === "GOOGLE_OAUTH_USER";
        // Validate APP_URL to prevent open redirect / SSRF
        const appUrl = process.env.APP_URL || '';
        const allowedOrigins = [appUrl].filter(Boolean);
        if (!allowedOrigins.length || !appUrl.startsWith('http')) {
            return res.status(500).json({ error: "Server misconfigured" });
        }
        // Store a short-lived auth code in DB instead of passing token/user in URL
        const authCode = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 1000); // 1 minute expiry
        await pool.query("INSERT INTO otp_codes (email, code, type, expires_at) VALUES ($1, $2, 'oauth_code', $3)", [user.email, authCode, expiresAt]);
        // Only pass the short-lived code in the URL (not token or user data)
        res.redirect(`${appUrl}/auth/callback?code=${encodeURIComponent(authCode)}&needsPassword=${needsPassword}`);
    }
    catch (err) {
        console.error("Google OAuth error");
        const appUrl = process.env.APP_URL || '';
        // Validate appUrl before redirecting
        if (!appUrl || !appUrl.startsWith('http')) {
            return res.status(500).json({ error: "OAuth configuration error" });
        }
        res.redirect(`${appUrl}/login?error=oauth_failed`);
    }
};
