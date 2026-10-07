import dotenv from "dotenv";
dotenv.config();
import express from "express";
import path from "path";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
// Middleware
import { csrfProtection, getCsrfToken } from "./server/middleware/csrf.js";
import { ssrfProtection } from "./server/middleware/ssrf.js";
// API Routes
import authRoutes from "./server/routes/auth.js";
import productRoutes from "./server/routes/products.js";
import orderRoutes from "./server/routes/orders.js";
import designRoutes from "./server/routes/designs.js";
import profileRoutes from "./server/routes/profile.js";
import uploadRoutes from "./server/routes/upload.js";
import exportRoutes from "./server/routes/export.js";
import adminRoutes from "./server/routes/admin.js";
import { trackVisit } from "./server/controllers/analyticsController.js";
import { initStorage } from "./server/config/initStorage.js";
import { authenticateToken } from "./server/middleware/authMiddleware.js";
import favourites from "./server/routes/favourites.js";
import couponRoutes from "./server/routes/coupons.js";
import saleRoutes from "./server/routes/sales.js";
// Cashfree
import paymentRoutes from "./server/routes/payment.js";
import { cashfreeWebhook } from "./server/controllers/Paymentcontroller.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function startServer() {
    const app = express();
    const PORT = parseInt(process.env.PORT || '3000', 10);
    // Security headers
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));
    // Disable X-Powered-By
    app.disable('x-powered-by');
    app.post("/api/payments/webhook", express.raw({ type: "application/json" }), cashfreeWebhook);
    app.use(express.json({ limit: "50mb" }));
    app.use(cookieParser());
    // SSRF protection — block internal URLs in request bodies
    app.use(ssrfProtection);
    // CSRF token endpoint (client fetches this on load)
    app.get("/api/csrf-token", getCsrfToken);
    // Trust proxy — configurable for environments with multiple proxies
    app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));
    // Global CSRF protection for all state-changing requests.
    // Exempt paths are handled before this middleware.
    const csrfExemptPaths = ['/api/auth', '/api/track-visit'];
    app.use((req, res, next) => {
        if (csrfExemptPaths.some(p => req.path === p || req.path.startsWith(`${p}/`))) {
            return next();
        }
        return csrfProtection(req, res, next);
    });
    // API Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/products", productRoutes);
    app.use("/api/orders", orderRoutes);
    app.use("/api/designs", designRoutes);
    app.use("/api/profile", profileRoutes);
    app.use("/api/upload", uploadRoutes);
    app.use("/api/export", exportRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/profile/favourites", favourites);
    app.post("/api/coupons/test", (req, res) => {
        res.json({
            message: "Coupon route is working"
        });
    });
    app.use("/api/coupons", couponRoutes);
    app.use("/api/sales", saleRoutes);
    //Cashfree
    app.use("/api/payments", authenticateToken, paymentRoutes);
    // Public analytics tracking (exempt from CSRF — non-sensitive, fire-and-forget)
    app.post("/api/track-visit", trackVisit);
    // Serve Uploads
    app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));
    // Health Check
    app.get("/api/health", (req, res) => {
        res.json({ status: "ok" });
    });
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    }
    else {
        const distPath = path.resolve(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
            res.sendFile(path.join(distPath, "index.html"));
        });
    }
    // Ensure local upload folders exist
    await initStorage();
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server is listening on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}
startServer();
