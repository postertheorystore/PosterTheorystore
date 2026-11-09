import { Router } from "express";
import { getPublicPromotionSettings, } from "../controllers/promotionController.js";
const router = Router();
// GET /api/promotions
router.get("/", getPublicPromotionSettings);
export default router;
