import pool from "../config/db.js";
// Get all favourites for logged-in user
export const getFavourites = async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT
        p.*
      FROM user_favourites f
      JOIN products p ON p.id = f.product_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
      `, [req.user.id]);
        res.json(rows);
    }
    catch (err) {
        console.error("Get favourites error:", err);
        res.status(500).json({
            error: "Failed to fetch favourites",
        });
    }
};
// Add/remove a favourite
export const toggleFavourite = async (req, res) => {
    try {
        const productId = Number(req.body.productId);
        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                error: "Invalid product ID",
            });
        }
        const existing = await pool.query(`
      SELECT id
      FROM user_favourites
      WHERE user_id = $1
        AND product_id = $2
      `, [req.user.id, productId]);
        if (existing.rows.length > 0) {
            await pool.query(`
        DELETE FROM user_favourites
        WHERE user_id = $1
          AND product_id = $2
        `, [req.user.id, productId]);
            return res.json({
                favourited: false,
            });
        }
        await pool.query(`
      INSERT INTO user_favourites (user_id, product_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, product_id) DO NOTHING
      `, [req.user.id, productId]);
        res.json({
            favourited: true,
        });
    }
    catch (err) {
        console.error("Toggle favourite error:", err);
        res.status(500).json({
            error: "Failed to update favourite",
        });
    }
};
// Merge guest favourites into logged-in user's favourites
export const syncFavourites = async (req, res) => {
    try {
        const productIds = Array.isArray(req.body.productIds)
            ? req.body.productIds
                .map(Number)
                .filter((id) => Number.isInteger(id) && id > 0)
            : [];
        if (productIds.length === 0) {
            return res.json({
                success: true,
                message: "Nothing to sync",
            });
        }
        for (const productId of [...new Set(productIds)]) {
            await pool.query(`
        INSERT INTO user_favourites (user_id, product_id)
        SELECT $1, id
        FROM products
        WHERE id = $2
        ON CONFLICT (user_id, product_id) DO NOTHING
        `, [req.user.id, productId]);
        }
        res.json({
            success: true,
        });
    }
    catch (err) {
        console.error("Sync favourites error:", err);
        res.status(500).json({
            error: "Failed to sync favourites",
        });
    }
};
// Remove a favourite
export const removeFavourite = async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                error: "Invalid product ID",
            });
        }
        await pool.query(`
      DELETE FROM user_favourites
      WHERE user_id = $1
        AND product_id = $2
      `, [req.user.id, productId]);
        res.json({
            success: true,
        });
    }
    catch (err) {
        console.error("Remove favourite error:", err);
        res.status(500).json({
            error: "Failed to remove favourite",
        });
    }
};
