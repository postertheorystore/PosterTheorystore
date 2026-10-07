import express from "express";
import { createDesign, getUserDesigns } from "../controllers/designController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
const router = express.Router();
router.post("/", authenticateToken, createDesign);
router.get("/user/:id", authenticateToken, getUserDesigns);
export default router;
