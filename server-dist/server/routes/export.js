import { Router } from "express";
import { authenticateToken, isAdmin } from "../middleware/authMiddleware.js";
import { csrfProtection } from "../middleware/csrf.js";
import { exportHighRes } from "../controllers/exportController.js";
const router = Router();
router.post("/highres", csrfProtection, authenticateToken, isAdmin, exportHighRes);
export default router;
