import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware.ts"; // adjust path
import { validateCoupon } from "../controllers/couponController.ts";

const router = Router();
router.post("/validate", authenticateToken, validateCoupon);
export default router;