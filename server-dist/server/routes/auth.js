import express from "express";
import rateLimit from "express-rate-limit";
import { signup, login, getMe, verifyOtp, resendOtp, setPassword, forgotPassword, resetPassword, getAdminUsers } from "../controllers/authController.js";
import { googleAuthUrl, googleCallback, exchangeAuthCode } from "../controllers/googleAuthController.js";
import { authenticateToken, isAdmin } from "../middleware/authMiddleware.js";
const router = express.Router();
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many attempts. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { error: "Too many OTP requests. Please wait before trying again." },
    standardHeaders: true,
    legacyHeaders: false,
});
router.post("/signup", authLimiter, signup);
router.post("/verify-otp", otpLimiter, verifyOtp);
router.post("/resend-otp", otpLimiter, resendOtp);
router.post("/login", authLimiter, login);
router.get("/me", authenticateToken, getMe);
router.post("/set-password", authenticateToken, setPassword);
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", otpLimiter, resetPassword);
// Google OAuth
router.get("/google", googleAuthUrl);
router.get("/google/callback", googleCallback);
router.post("/google/exchange", exchangeAuthCode); // No CSRF — validated by single-use DB code
// Admin
router.get("/admin/users", authenticateToken, isAdmin, getAdminUsers);
export default router;
