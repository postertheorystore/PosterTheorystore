import { Router } from "express";
import { createPayment, verifyPayment, } from "../controllers/Paymentcontroller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
const router = Router();
// Creating a payment must require login.
router.post("/create", authenticateToken, createPayment);
// Verification must work even if the customer's session expires.
router.get("/verify/:cashfreeOrderId", verifyPayment);
export default router;
