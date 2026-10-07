import { Router } from "express";
import { createPayment, verifyPayment } from "../controllers/Paymentcontroller.js";
/**
 * Authenticated payment routes.
 * Mount with your existing JWT middleware (see snippets/server-changes.md):
 *   app.use("/api/payments", <yourAuthMiddleware>, paymentRoutes);
 *
 * The Cashfree webhook is NOT here: it is public + needs the raw body,
 * so it is mounted separately in server.ts.
 */
const router = Router();
router.post("/create", createPayment);
router.get("/verify/:cashfreeOrderId", verifyPayment);
export default router;
