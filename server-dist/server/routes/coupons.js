import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware.js"; // adjust path
import { validateCoupon } from "../controllers/couponController.js";
const router = Router();
router.post("/validate", authenticateToken, validateCoupon);
export default router;
