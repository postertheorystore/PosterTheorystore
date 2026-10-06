import { Router } from "express";
import multer from "multer";
import { authenticateToken, isAdmin } from "../middleware/authMiddleware.ts";
import {
  getDashboard,
  getCollections, createCollection, updateCollection, deleteCollection,
  getLayouts, createLayout, updateLayout, deleteLayout,
  getSizes, createSize, updateSize, deleteSize,
  getPricing, upsertPricing, deletePricing,
  getAdminProducts, getProductStats, createProduct, updateProduct, deleteProduct, deleteProductImage, uploadProductImages, setMainImage,
  getAdminOrders, updateOrderStatus, getOrderHistory,
  getCustomRequests, updateCustomRequestStatus,
  getCoupons, createCoupon, updateCoupon, deleteCoupon,
  getCustomers,
  getHomepageConfig, updateHomepageConfig, uploadHomepageImage,
  getCouriers, createCourier, updateCourier, deleteCourier,
  getFramePricing, upsertFramePricing, deleteFramePricing,
  getMaterialPricing, upsertMaterialPricing,
} from "../controllers/adminController.ts";
import { getAnalytics } from "../controllers/analyticsController.ts";

import {
  getSales,
  getSaleById,
  createSale,
  updateSale,
  deleteSale,
} from "../controllers/saleController.ts";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

// All routes require admin auth
router.use(authenticateToken, isAdmin);


// Dashboard
router.get("/dashboard", getDashboard);

// Collections
router.get("/collections", getCollections);
router.post("/collections", createCollection);
router.put("/collections/:id", updateCollection);
router.delete("/collections/:id", deleteCollection);

// Layouts
router.get("/layouts", getLayouts);
router.post("/layouts", createLayout);
router.put("/layouts/:id", updateLayout);
router.delete("/layouts/:id", deleteLayout);

// Sizes
router.get("/sizes", getSizes);
router.post("/sizes", createSize);
router.put("/sizes/:id", updateSize);
router.delete("/sizes/:id", deleteSize);

// Pricing
router.get("/pricing", getPricing);
router.post("/pricing", upsertPricing);
router.delete("/pricing/:sizeId/:layoutId", deletePricing);
router.delete("/pricing/:id", deletePricing);

// Products (Posters)
router.get("/products", getAdminProducts);
router.get("/products/:id/stats", getProductStats);
router.post("/products", upload.array("images", 10), createProduct);
router.put("/products/:id", updateProduct);
router.put("/products/:id/remove-image", deleteProductImage);
router.put("/products/:id/set-main-image", setMainImage);
router.post("/products/:id/upload-images", upload.array("images", 10), uploadProductImages);
router.delete("/products/:id", deleteProduct);

// Orders
router.get("/orders", getAdminOrders);
router.put("/orders/:id/status", updateOrderStatus);
router.get("/orders/:id/history", getOrderHistory);

// Custom Requests
router.get("/custom-requests", getCustomRequests);
router.put("/custom-requests/:id", updateCustomRequestStatus);

// Coupons
router.get("/coupons", getCoupons);
router.post("/coupons", createCoupon);
router.put("/coupons/:id", updateCoupon);
router.delete("/coupons/:id", deleteCoupon);

// Customers
router.get("/customers", getCustomers);

// Homepage
router.get("/homepage", getHomepageConfig);
router.put("/homepage", updateHomepageConfig);
router.post("/homepage/upload", upload.single("image"), uploadHomepageImage);

// Analytics
router.get("/analytics", getAnalytics);

// Couriers
router.get("/couriers", getCouriers);
router.post("/couriers", createCourier);
router.put("/couriers/:id", updateCourier);
router.delete("/couriers/:id", deleteCourier);

// Frame Pricing
router.get("/frame-pricing", getFramePricing);
router.post("/frame-pricing", upsertFramePricing);
router.delete("/frame-pricing/:id", deleteFramePricing);

// Material Pricing
router.get("/material-pricing", getMaterialPricing);
router.post("/material-pricing", upsertMaterialPricing);

// Sales
router.get("/sales", getSales);
router.get("/sales/:id", getSaleById);
router.post("/sales", createSale);
router.put("/sales/:id", updateSale);
router.delete("/sales/:id", deleteSale);

export default router;
