import express from "express";
import multer from "multer";
import { uploadProductImage, uploadDesignImage, deleteImage } from "../controllers/uploadController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype))
            cb(null, true);
        else
            cb(new Error("Only image files are allowed"));
    },
});
router.post("/product", authenticateToken, upload.single("image"), uploadProductImage);
router.post("/design", authenticateToken, upload.single("image"), uploadDesignImage);
router.post("/delete", authenticateToken, deleteImage);
export default router;
