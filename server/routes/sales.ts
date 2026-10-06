import { Router } from "express";

import {
  getActiveSale,
} from "../controllers/saleController.ts";

const router = Router();

// IMPORTANT: keep /active before any /:id route
router.get("/active", getActiveSale);

export default router;