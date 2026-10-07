import express from "express";
import { getFavourites, toggleFavourite, syncFavourites, removeFavourite, } from "../controllers/favouritesController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
const router = express.Router();
router.get("/", authenticateToken, getFavourites);
router.post("/", authenticateToken, toggleFavourite);
router.post("/sync", authenticateToken, syncFavourites);
router.delete("/:productId", authenticateToken, removeFavourite);
export default router;
