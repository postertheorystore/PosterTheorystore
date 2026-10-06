import { Request, Response } from "express";
import pool from "../config/db.ts";

interface SaleInput {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  discount_text?: string | null;
  coupon_code?: string | null;
  min_order?:number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
  priority?: number;
}

interface SaleProductInput {
  product_id: number;
  sale_price: number;
}

const parseSaleProducts = (products: unknown): SaleProductInput[] => {
  if (!Array.isArray(products)) return [];

  return products
    .map((product: any) => ({
      product_id: Number(product.product_id),
      sale_price: Number(product.sale_price),
    }))
    .filter(
      product =>
        Number.isInteger(product.product_id) &&
        product.product_id > 0 &&
        Number.isFinite(product.sale_price) &&
        product.sale_price >= 0
    );
};

const cleanString = (
  value: unknown,
  maxLength: number
): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
};

const parseSaleBody = (body: any): SaleInput => {
  return {
    title: cleanString(body.title, 100) || "",
    subtitle: cleanString(body.subtitle, 200),
    description: cleanString(body.description, 500),
    discount_text: cleanString(body.discount_text, 50),

    coupon_code: body.coupon_code
      ? cleanString(body.coupon_code, 30)?.toUpperCase() || null
      : null,

    starts_at: body.starts_at || null,
    expires_at: body.expires_at || null,

    is_active:
      typeof body.is_active === "boolean"
        ? body.is_active
        : true,

    priority:
      Number.isInteger(Number(body.priority))
        ? Number(body.priority)
        : 0,
  };
};

// ======================================================
// ADMIN
// ======================================================

export const getSales = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', sp.product_id,
              'sale_price', sp.sale_price
            )
          ) FILTER (WHERE sp.id IS NOT NULL),
          '[]'
        ) AS products
      FROM sale_announcements s
      LEFT JOIN sale_products sp
        ON sp.sale_id = s.id
      GROUP BY s.id
      ORDER BY s.priority DESC, s.created_at DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error("Get sales error:", error);
    res.status(500).json({ error: "Failed to fetch sales" });
  }
};

export const getSaleById = async (
  req: Request,
  res: Response
) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid sale ID",
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM sale_announcements
      WHERE id = $1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Sale not found",
      });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Get sale error:", error);

    res.status(500).json({
      error: "Failed to fetch sale",
    });
  }
};

export const createSale = async (req: Request, res: Response) => {
  const data = parseSaleBody(req.body);
  const products = parseSaleProducts(req.body.products);

  if (!data.title) {
    return res.status(400).json({
      error: "Title is required",
    });
  }

  if (data.starts_at && isNaN(new Date(data.starts_at).getTime())) {
    return res.status(400).json({
      error: "Invalid start date",
    });
  }

  if (data.expires_at && isNaN(new Date(data.expires_at).getTime())) {
    return res.status(400).json({
      error: "Invalid expiry date",
    });
  }

  if (
    data.starts_at &&
    data.expires_at &&
    new Date(data.expires_at) <= new Date(data.starts_at)
  ) {
    return res.status(400).json({
      error: "Expiry date must be after start date",
    });
  }

  try {
    // Validate coupon
    if (data.coupon_code) {
      const coupon = await pool.query(
        `SELECT id FROM coupons WHERE code = $1 LIMIT 1`,
        [data.coupon_code]
      );

      if (!coupon.rows.length) {
        return res.status(400).json({
          error: "Coupon code does not exist",
        });
      }
    }

    // Validate products
    if (products.length > 0) {
      const productIds = products.map(p => p.product_id);

      const productResult = await pool.query(
        `SELECT id, price
         FROM products
         WHERE id = ANY($1::int[])`,
        [productIds]
      );

      const productMap = new Map(
        productResult.rows.map(product => [
          product.id,
          Number(product.price),
        ])
      );

      for (const product of products) {
        const regularPrice = productMap.get(product.product_id);

        if (regularPrice === undefined) {
          return res.status(400).json({
            error: `Product ${product.product_id} does not exist`,
          });
        }

        if (product.sale_price >= regularPrice) {
          return res.status(400).json({
            error: `Sale price for product ${product.product_id} must be lower than its regular price`,
          });
        }
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const saleResult = await client.query(
        `INSERT INTO sale_announcements (
          title,
          subtitle,
          description,
          discount_text,
          coupon_code,
          min_order,
          starts_at,
          expires_at,
          is_active,
          priority
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *`,
        [
          data.title,
          data.subtitle,
          data.description,
          data.discount_text,
          data.coupon_code,
          data.min_order,
          data.starts_at,
          data.expires_at,
          data.is_active,
          data.priority,
        ]
      );

      const sale = saleResult.rows[0];

      for (const product of products) {
        await client.query(
          `INSERT INTO sale_products (
            sale_id,
            product_id,
            sale_price
          )
          VALUES ($1, $2, $3)`,
          [
            sale.id,
            product.product_id,
            product.sale_price,
          ]
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        ...sale,
        products,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Create sale error:", error);

    res.status(500).json({
      error: "Failed to create sale",
    });
  }
};

export const updateSale = async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid sale ID",
    });
  }

  const data = parseSaleBody(req.body);
  const products = parseSaleProducts(req.body.products);

  if (!data.title) {
    return res.status(400).json({
      error: "Title is required",
    });
  }

  if (data.starts_at && isNaN(new Date(data.starts_at).getTime())) {
    return res.status(400).json({
      error: "Invalid start date",
    });
  }

  if (data.expires_at && isNaN(new Date(data.expires_at).getTime())) {
    return res.status(400).json({
      error: "Invalid expiry date",
    });
  }

  if (
    data.starts_at &&
    data.expires_at &&
    new Date(data.expires_at) <= new Date(data.starts_at)
  ) {
    return res.status(400).json({
      error: "Expiry date must be after start date",
    });
  }

  try {
    if (data.coupon_code) {
      const coupon = await pool.query(
        `SELECT id FROM coupons WHERE code = $1 LIMIT 1`,
        [data.coupon_code]
      );

      if (!coupon.rows.length) {
        return res.status(400).json({
          error: "Coupon code does not exist",
        });
      }
    }

    // Validate products
    if (products.length > 0) {
      const productIds = products.map(p => p.product_id);

      const productResult = await pool.query(
        `SELECT id, price
         FROM products
         WHERE id = ANY($1::int[])`,
        [productIds]
      );

      const productMap = new Map(
        productResult.rows.map(product => [
          product.id,
          Number(product.price),
        ])
      );

      for (const product of products) {
        const regularPrice = productMap.get(product.product_id);

        if (regularPrice === undefined) {
          return res.status(400).json({
            error: `Product ${product.product_id} does not exist`,
          });
        }

        if (product.sale_price >= regularPrice) {
          return res.status(400).json({
            error: `Sale price for product ${product.product_id} must be lower than its regular price`,
          });
        }
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const saleResult = await client.query(
        `UPDATE sale_announcements
         SET
           title = $1,
           subtitle = $2,
           description = $3,
           discount_text = $4,
           coupon_code = $5,
           min_order = $6,
           starts_at = $7,
           expires_at = $8,
           is_active = $9,
           priority = $10,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $11
         RETURNING *`,
        [
          data.title,
          data.subtitle,
          data.description,
          data.discount_text,
          data.coupon_code,
          data.min_order,
          data.starts_at,
          data.expires_at,
          data.is_active,
          data.priority,
          id,
        ]
      );

      if (!saleResult.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Sale not found",
        });
      }

      // Replace existing product mappings
      await client.query(
        `DELETE FROM sale_products WHERE sale_id = $1`,
        [id]
      );

      for (const product of products) {
        await client.query(
          `INSERT INTO sale_products (
            sale_id,
            product_id,
            sale_price
          )
          VALUES ($1, $2, $3)`,
          [
            id,
            product.product_id,
            product.sale_price,
          ]
        );
      }

      await client.query("COMMIT");

      res.json({
        ...saleResult.rows[0],
        products,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Update sale error:", error);

    res.status(500).json({
      error: "Failed to update sale",
    });
  }
};

export const deleteSale = async (
  req: Request,
  res: Response
) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid sale ID",
    });
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM sale_announcements
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Sale not found",
      });
    }

    res.json({
      message: "Sale deleted successfully",
    });
  } catch (error) {
    console.error("Delete sale error:", error);

    res.status(500).json({
      error: "Failed to delete sale",
    });
  }
};

// ======================================================
// CUSTOMER
// ======================================================

export const getActiveSale = async (
  req: Request,
  res: Response
) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        title,
        subtitle,
        description,
        discount_text,
        coupon_code,
        starts_at,
        expires_at,
        priority
      FROM sale_announcements
      WHERE is_active = TRUE

        AND (
          starts_at IS NULL
          OR starts_at <= CURRENT_TIMESTAMP
        )

        AND (
          expires_at IS NULL
          OR expires_at > CURRENT_TIMESTAMP
        )

      ORDER BY priority DESC, created_at DESC

      LIMIT 1
    `);

    if (!rows.length) {
      return res.json(null);
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Get active sale error:", error);

    res.status(500).json({
      error: "Failed to fetch active sale",
    });
  }
};