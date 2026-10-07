import pool from "../config/db.js";
const productPriceSQL = `
  (
    SELECT MIN(pr.price)
    FROM pricing pr
    WHERE pr.size_id = ANY(p.available_sizes)
      AND pr.layout_id = ANY(p.available_layouts)
  ) AS price
`;
export const getProducts = async (req, res) => {
    try {
        const { filter, limit } = req.query;
        let where = "WHERE p.status = 'active'";
        if (filter === 'trending')
            where += " AND p.is_trending = true";
        else if (filter === 'new_arrival')
            where += " AND p.is_new_arrival = true";
        else if (filter === 'featured')
            where += " AND p.is_featured = true";
        else if (filter === 'bestseller')
            where += " AND p.is_bestseller = true";
        const limitNum = limit ? Math.min(parseInt(limit, 10) || 100, 100) : 100;
        const { rows } = await pool.query(`
        SELECT
          p.*,
          c.name AS collection_name,
          c.slug AS collection_slug,
          ${productPriceSQL}

        FROM products p
        LEFT JOIN collections c ON p.collection_id = c.id
        ${where}
        ORDER BY p.created_at DESC
        LIMIT $1
      `, [limitNum]);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch products" });
    }
};
export const getProductPricing = async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT p.id, p.price, s.name as size_name, s.id as size_id, l.name as layout_name, l.id as layout_id
      FROM pricing p
      JOIN sizes s ON p.size_id = s.id
      JOIN layouts l ON p.layout_id = l.id
      ORDER BY s.width_mm DESC, l.panel_count
    `);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch pricing" });
    }
};
// Public endpoint: returns all sizes, layouts, and pricing for the customize page
export const getCustomizeConfig = async (req, res) => {
    try {
        const [sizesRes, layoutsRes, pricingRes, frameRes, materialRes] = await Promise.all([
            pool.query("SELECT * FROM sizes WHERE is_active = true ORDER BY width_mm DESC"),
            pool.query("SELECT * FROM layouts WHERE is_active = true ORDER BY panel_count"),
            pool.query(`
        SELECT p.price, s.name as size_name, l.name as layout_name
        FROM pricing p
        JOIN sizes s ON p.size_id = s.id
        JOIN layouts l ON p.layout_id = l.id
      `),
            pool.query("SELECT * FROM frame_pricing ORDER BY size_name").catch(() => ({ rows: [] })),
            pool.query("SELECT * FROM material_pricing ORDER BY material").catch(() => ({ rows: [] })),
        ]);
        res.json({
            sizes: sizesRes.rows,
            layouts: layoutsRes.rows,
            pricing: pricingRes.rows,
            framePricing: frameRes.rows,
            materialPricing: materialRes.rows,
        });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch config" });
    }
};
export const getPublicCollections = async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id, name, slug FROM collections WHERE is_active = true ORDER BY name");
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch collections" });
    }
};
export const getPublicLayouts = async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id, name, panel_count FROM layouts WHERE is_active = true ORDER BY panel_count");
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch layouts" });
    }
};
export const getHomepageData = async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT section, data FROM homepage_config");
        const result = {};
        for (const row of rows)
            result[row.section] = row.data;
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch homepage data" });
    }
};
//Get Similar Product for the product page
export const getSimilarProducts = async (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        if (isNaN(productId)) {
            return res.status(400).json({
                error: "Invalid product ID",
            });
        }
        const limit = Math.min(parseInt(req.query.limit, 10) || 6, 20);
        const { rows } = await pool.query(`
      WITH current_product AS (
        SELECT
          id,
          SPLIT_PART(image_folder, '/', 3) AS category
        FROM products
        WHERE id = $1
          AND status = 'active'
      )

      SELECT
        p.*,
        c.name AS collection_name,
        c.slug AS collection_slug,

        (
          SELECT MIN(pr.price)
          FROM pricing pr
          WHERE pr.size_id = ANY(p.available_sizes)
            AND pr.layout_id = ANY(p.available_layouts)
        ) AS price

      FROM products p

      CROSS JOIN current_product cp

      LEFT JOIN collections c
        ON p.collection_id = c.id

      WHERE
        p.id <> cp.id
        AND p.status = 'active'
        AND SPLIT_PART(p.image_folder, '/', 3) = cp.category

      ORDER BY
        p.created_at DESC

      LIMIT $2
      `, [productId, limit]);
        res.json(rows);
    }
    catch (err) {
        console.error("getSimilarProducts error:", err);
        res.status(500).json({
            error: "Failed to fetch similar products",
        });
    }
};
export const getTrendingProducts = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
        const { rows } = await pool.query(`
      SELECT
        p.*,
        c.name AS collection_name,
        c.slug AS collection_slug,
        ${productPriceSQL},

        COUNT(e.id) FILTER (
          WHERE e.created_at >= NOW() - INTERVAL '7 days'
        ) AS popularity_score

      FROM products p

      LEFT JOIN product_order_events e
        ON e.product_id = p.id
        AND e.created_at >= NOW() - INTERVAL '7 days'

      LEFT JOIN collections c
        ON p.collection_id = c.id

      WHERE
        p.status = 'active'
        AND (
          p.is_trending = true
          OR e.id IS NOT NULL
        )

      GROUP BY
        p.id,
        c.name,
        c.slug

      ORDER BY
        popularity_score DESC,
        p.is_trending DESC,
        p.created_at DESC

      LIMIT $1
      `, [limit]);
        res.json(rows);
    }
    catch (err) {
        console.error("getTrendingProducts error:", err);
        res.status(500).json({
            error: "Failed to fetch trending products",
        });
    }
};
export const getNewArrivals = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
        const { rows } = await pool.query(`
  SELECT *
  FROM (
    SELECT
      p.*,
      c.name AS collection_name,
      c.slug AS collection_slug,
      ${productPriceSQL},

      SPLIT_PART(p.image_folder, '/', 3) AS category,

      ROW_NUMBER() OVER (
        PARTITION BY SPLIT_PART(p.image_folder, '/', 3)
        ORDER BY p.created_at DESC
      ) AS row_num

    FROM products p

    LEFT JOIN collections c
      ON p.collection_id = c.id

    WHERE
      p.status = 'active'
      AND p.image_folder IS NOT NULL
  ) ranked

  WHERE row_num = 1

  ORDER BY created_at DESC

  LIMIT $1
  `, [limit]);
        res.json(rows);
    }
    catch (err) {
        console.error("getNewArrivals error:", err);
        res.status(500).json({
            error: "Failed to fetch new arrivals",
        });
    }
};
export const getBestsellerProducts = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
        const { rows } = await pool.query(`
      SELECT
        p.*,
        c.name AS collection_name,
        c.slug AS collection_slug,
        ${productPriceSQL},

        COALESCE(
          SUM(
            CASE
              WHEN o.id IS NOT NULL
              THEN COALESCE((item->>'quantity')::int, 1)
              ELSE 0
            END
          ),
          0
        ) AS popularity_score

      FROM products p

      LEFT JOIN collections c
        ON p.collection_id = c.id

      LEFT JOIN orders o
        ON o.status != 'cancelled'
        AND o.created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)

      LEFT JOIN LATERAL jsonb_array_elements(o.items) AS item
        ON (
          (item->>'productId' IS NOT NULL
            AND (item->>'productId')::bigint = p.id)
          OR
          (item->>'id' IS NOT NULL
            AND (item->>'id')::bigint = p.id)
        )

      WHERE
        p.status = 'active'
        AND (
          p.is_bestseller = true
          OR item IS NOT NULL
        )

      GROUP BY
        p.id,
        c.name,
        c.slug

      ORDER BY
        popularity_score DESC,
        p.is_bestseller DESC,
        p.created_at DESC

      LIMIT $1
      `, [limit]);
        res.json(rows);
    }
    catch (err) {
        console.error("getBestsellerProducts error:", err);
        res.status(500).json({
            error: "Failed to fetch bestseller products",
        });
    }
};
