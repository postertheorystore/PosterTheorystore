
import type { Request, Response } from "express";
import pool from "../config/db.ts";

const PROMOTION_ID = 1;

// GET /api/promotions
// Public endpoint: storefront reads the promotion configuration.
export const getPublicPromotionSettings = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        buy_quantity,
        free_quantity,
        eligible_category,
        is_active
       FROM promotion_settings
       WHERE id = $1
       LIMIT 1`,
      [PROMOTION_ID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Promotion settings not found.",
      });
    }

    return res.status(200).json({
      success: true,
      promotion: result.rows[0],
    });
  } catch (error) {
    console.error("Get public promotion settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch promotion settings.",
    });
  }
};

// GET /api/admin/promotions/buy-x-get-y
// Admin endpoint: fetch current promotion configuration.
export const getAdminPromotionSettings = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        buy_quantity,
        free_quantity,
        eligible_category,
        is_active
       FROM promotion_settings
       WHERE id = $1
       LIMIT 1`,
      [PROMOTION_ID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Promotion settings not found.",
      });
    }

    return res.status(200).json({
      success: true,
      promotion: result.rows[0],
    });
  } catch (error) {
    console.error("Get admin promotion settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch admin promotion settings.",
    });
  }
};

// PUT /api/admin/promotions/buy-x-get-y
// Admin endpoint: update promotion configuration.
export const updatePromotionSettings = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      name,
      buy_quantity,
      free_quantity,
      is_active,
    } = req.body;

    // Validate promotion name.
    if (
      typeof name !== "string" ||
      name.trim().length < 1 ||
      name.trim().length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Promotion name must contain 1–100 characters.",
      });
    }

    // Validate quantities.
    const buyQuantity = Number(buy_quantity);
    const freeQuantity = Number(free_quantity);

    if (
      !Number.isInteger(buyQuantity) ||
      buyQuantity < 1 ||
      buyQuantity > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Buy quantity must be an integer between 1 and 100.",
      });
    }

    if (
      !Number.isInteger(freeQuantity) ||
      freeQuantity < 1 ||
      freeQuantity > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Free quantity must be an integer between 1 and 100.",
      });
    }

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_active must be true or false.",
      });
    }

    const result = await pool.query(
      `UPDATE promotion_settings
       SET
         name = $1,
         buy_quantity = $2,
         free_quantity = $3,
         is_active = $4
       WHERE id = $5
       RETURNING
         id,
         name,
         buy_quantity,
         free_quantity,
         eligible_category,
         is_active`,
      [
        name.trim(),
        buyQuantity,
        freeQuantity,
        is_active,
        PROMOTION_ID,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Promotion settings not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Promotion settings updated successfully.",
      promotion: result.rows[0],
    });
  } catch (error) {
    console.error("Update promotion settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update promotion settings.",
    });
  }
};
