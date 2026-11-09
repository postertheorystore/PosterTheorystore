
import { Router } from "express";
import {
  getPublicPromotionSettings,
} from "../controllers/promotionController.ts";

const router = Router();

// GET /api/promotions
router.get("/", getPublicPromotionSettings);

export default router;
