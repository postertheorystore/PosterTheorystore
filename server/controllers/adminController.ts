import { Request, Response } from "express";
import pool from "../config/db.ts";
import cloudinary from "../config/cloudinary.ts";
import { ensureCollectionFolder } from "../config/initStorage.ts";

// ========== HELPERS ==========
const sanitizeFilename = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.\./g, '_').slice(0, 200);
};

const parseBool = (val: any): boolean => {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === '1') return true;
  return false;
};

const validatePositiveInt = (val: any): number | null => {
  const n = parseInt(val, 10);
  return (!isNaN(n) && n > 0) ? n : null;
};

const validateNonNegativeNum = (val: any): number | null => {
  const n = parseFloat(val);
  return (!isNaN(n) && n >= 0) ? n : null;
};

export const sanitizeText = (val: any, maxLen = 500): string => {
  if (!val || typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
};

const normalizeTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];

  return [
    ...new Set(
      tags
        .filter((tag): tag is string => typeof tag === "string")
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
};

// ========== DASHBOARD ==========
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const [totalOrders, revenue, monthOrders, pending, completed, customRequests, cancelled, inProcess] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM orders"),
      pool.query("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled'"),
      pool.query("SELECT COUNT(*) FROM orders WHERE created_at >= date_trunc('month', CURRENT_DATE)"),
      pool.query("SELECT COUNT(*) FROM orders WHERE status IN ('order_placed', 'verified')"),
      pool.query("SELECT COUNT(*) FROM orders WHERE status = 'delivered'"),
      pool.query("SELECT COALESCE(SUM(COALESCE((item->>'quantity')::int, 1)), 0) as count FROM orders o, jsonb_array_elements(o.items) as item WHERE item->'customSpecs' IS NOT NULL AND o.status != 'cancelled'"),
      pool.query("SELECT COUNT(*) FROM orders WHERE status = 'cancelled'"),
      pool.query("SELECT COUNT(*) FROM orders WHERE status IN ('in_production', 'printed', 'ready_to_ship')"),
    ]);

    const bestSelling = await pool.query(`
      SELECT p.title, p.image, SUM(COALESCE((item->>'quantity')::int, 1)) as order_count 
      FROM orders o, jsonb_array_elements(o.items) as item 
      JOIN products p ON p.id = COALESCE((item->>'productId')::bigint, (item->>'id')::bigint)
      WHERE o.status != 'cancelled'
      GROUP BY p.id, p.title, p.image ORDER BY order_count DESC LIMIT 5
    `).catch(() => ({ rows: [] }));

    const recentOrders = await pool.query(
      "SELECT orders.*, users.name as user_name, users.email FROM orders JOIN users ON orders.user_id = users.id ORDER BY orders.created_at DESC LIMIT 10"
    );

    res.json({
      totalOrders: parseInt(totalOrders.rows[0].count),
      totalRevenue: parseInt(revenue.rows[0].total),
      ordersThisMonth: parseInt(monthOrders.rows[0].count),
      pendingOrders: parseInt(pending.rows[0].count),
      completedOrders: parseInt(completed.rows[0].count),
      cancelledOrders: parseInt(cancelled.rows[0].count),
      inProcessOrders: parseInt(inProcess.rows[0].count),
      customRequests: parseInt(customRequests.rows[0].count),
      bestSelling: bestSelling.rows,
      recentOrders: recentOrders.rows,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
};

// ========== collections ==========
export const getCollections = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM collections ORDER BY name");
  res.json(rows);
};

export const createCollection = async (req: Request, res: Response) => {
  const name = sanitizeText(req.body.name, 100);

  // New: get and normalize default tags
  const default_tags = Array.isArray(req.body.default_tags)
    ? [
        ...new Set(
          req.body.default_tags
            .filter((tag: any) => typeof tag === "string")
            .map((tag: string) => tag.trim().toLowerCase())
            .filter(Boolean)
        ),
      ]
    : [];

  if (!name || name.length < 2) return res.status(400).json({ error: "Name must be at least 2 characters" });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (!slug) return res.status(400).json({ error: "Invalid collection name" });

  try {
    const { rows } = await pool.query(
      "INSERT INTO collections (name, slug, default_tags) VALUES ($1, $2, $3) RETURNING *",
      [name, slug, default_tags]
    );

    // Create local folder
    ensureCollectionFolder(slug);

    // Create Cloudinary folder
    try {
      await cloudinary.api.create_folder(`poster-theory/products/${slug}`);
    } catch (_) { /* folder may already exist */ }

    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: "Collection already exists" });
    res.status(500).json({ error: "Failed to create collection" });
  }
};

export const updateCollection = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, is_active } = req.body;
  const slug = name?.toLowerCase().replace(/\s+/g, '-');

  try {
    // If name changed, create new folder
    if (name && slug) {
      ensureCollectionFolder(slug);
      try {
        await cloudinary.api.create_folder(`poster-theory/products/${slug}`);
      } catch (_) { /* folder may already exist */ }
    }

    const { rows } = await pool.query(
      "UPDATE collections SET name = COALESCE($1, name), slug = COALESCE($2, slug), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING *",
      [name, slug, is_active, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update collection" });
  }
};

export const deleteCollection = async (req: Request, res: Response) => {
  const catId = validatePositiveInt(req.params.id);
  if (!catId) return res.status(400).json({ error: "Invalid ID" });
  await pool.query("DELETE FROM collections WHERE id = $1", [catId]);
  res.json({ message: "Deleted" });
};

// ========== LAYOUTS ==========
export const getLayouts = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM layouts ORDER BY panel_count");
  res.json(rows);
};

export const createLayout = async (req: Request, res: Response) => {
  const name = sanitizeText(req.body.name, 50);
  const panel_count = validatePositiveInt(req.body.panel_count);
  if (!name || name.length < 1) return res.status(400).json({ error: "Name is required" });
  if (!panel_count || panel_count > 16) return res.status(400).json({ error: "Panel count must be between 1-16" });
  try {
    const { rows } = await pool.query("INSERT INTO layouts (name, panel_count) VALUES ($1, $2) RETURNING *", [name, panel_count]);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: "Layout already exists" });
    res.status(500).json({ error: "Failed to create layout" });
  }
};

export const updateLayout = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, panel_count, is_active } = req.body;
  const { rows } = await pool.query(
    "UPDATE layouts SET name = COALESCE($1, name), panel_count = COALESCE($2, panel_count), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING *",
    [name, panel_count, is_active, id]
  );
  res.json(rows[0]);
};

export const deleteLayout = async (req: Request, res: Response) => {
  const layoutId = validatePositiveInt(req.params.id);
  if (!layoutId) return res.status(400).json({ error: "Invalid ID" });
  await pool.query("DELETE FROM layouts WHERE id = $1", [layoutId]);
  res.json({ message: "Deleted" });
};

// ========== SIZES ==========
export const getSizes = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM sizes ORDER BY width_mm DESC");
  res.json(rows);
};

export const createSize = async (req: Request, res: Response) => {
  const name = sanitizeText(req.body.name, 50);
  const { width_mm, height_mm, margin_top, margin_bottom, margin_left, margin_right } = req.body;
  const frame_only = parseBool(req.body.frame_only);
  if (!name || name.length < 1) return res.status(400).json({ error: "Name is required" });
  if (!width_mm || !height_mm) return res.status(400).json({ error: "Width and height are required" });
  try {
    const { rows } = await pool.query(
      "INSERT INTO sizes (name, width_mm, height_mm, margin_top, margin_bottom, margin_left, margin_right, frame_only) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [name, width_mm, height_mm, margin_top || 10, margin_bottom || 10, margin_left || 10, margin_right || 10, frame_only]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: "Size already exists" });
    res.status(500).json({ error: "Failed to create size" });
  }
};

export const updateSize = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, width_mm, height_mm, margin_top, margin_bottom, margin_left, margin_right, is_active } = req.body;
  const frame_only = req.body.frame_only !== undefined ? parseBool(req.body.frame_only) : undefined;
  const { rows } = await pool.query(
    `UPDATE sizes SET name = COALESCE($1, name), width_mm = COALESCE($2, width_mm), height_mm = COALESCE($3, height_mm),
     margin_top = COALESCE($4, margin_top), margin_bottom = COALESCE($5, margin_bottom),
     margin_left = COALESCE($6, margin_left), margin_right = COALESCE($7, margin_right),
     is_active = COALESCE($8, is_active), frame_only = COALESCE($9, frame_only) WHERE id = $10 RETURNING *`,
    [name, width_mm, height_mm, margin_top, margin_bottom, margin_left, margin_right, is_active, frame_only ?? null, id]
  );
  res.json(rows[0]);
};

export const deleteSize = async (req: Request, res: Response) => {
  const sizeId = validatePositiveInt(req.params.id);
  if (!sizeId) return res.status(400).json({ error: "Invalid ID" });
  await pool.query("DELETE FROM sizes WHERE id = $1", [sizeId]);
  res.json({ message: "Deleted" });
};

// ========== PRICING ==========
export const getPricing = async (req: Request, res: Response) => {
  const { rows } = await pool.query(`
    SELECT p.id, p.price, s.name as size_name, s.id as size_id, l.name as layout_name, l.id as layout_id
    FROM pricing p
    JOIN sizes s ON p.size_id = s.id
    JOIN layouts l ON p.layout_id = l.id
    ORDER BY s.width_mm DESC, l.panel_count
  `);
  res.json(rows);
};

export const upsertPricing = async (req: Request, res: Response) => {
  const size_id = validatePositiveInt(req.body.size_id);
  const layout_id = validatePositiveInt(req.body.layout_id);
  const price = validatePositiveInt(req.body.price);
  if (!size_id) return res.status(400).json({ error: "Valid size is required" });
  if (!layout_id) return res.status(400).json({ error: "Valid layout is required" });
  if (!price || price > 100000) return res.status(400).json({ error: "Price must be between 1-100000" });
  try {
    const { rows } = await pool.query(`
      INSERT INTO pricing (size_id, layout_id, price) VALUES ($1, $2, $3)
      ON CONFLICT (size_id, layout_id) DO UPDATE SET price = $3
      RETURNING *
    `, [size_id, layout_id, price]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update pricing" });
  }
};

export const deletePricing = async (req: Request, res: Response) => {
  const { sizeId, layoutId } = req.params;
  if (sizeId && layoutId) {
    await pool.query("DELETE FROM pricing WHERE size_id = $1 AND layout_id = $2", [sizeId, layoutId]);
  } else {
    await pool.query("DELETE FROM pricing WHERE id = $1", [req.params.id]);
  }
  res.json({ message: "Deleted" });
};

// ========== PRODUCTS (POSTERS) ==========
export const getAdminProducts = async (req: Request, res: Response) => {
  const { rows } = await pool.query(`
    SELECT p.*, c.name as collection_name
    FROM products p
    LEFT JOIN collections c ON p.collection_id = c.id
    ORDER BY p.created_at DESC
  `);
  res.json(rows);
};

export const getProductStats = async (req: Request, res: Response) => {
  const prodId = parseInt(req.params.id, 10);
  if (!prodId || isNaN(prodId)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const result = await pool.query(`
      SELECT COALESCE(SUM(COALESCE((item->>'quantity')::int, 1)), 0) as total_ordered
      FROM orders o, jsonb_array_elements(o.items) as item
      WHERE (
        (item->>'productId' IS NOT NULL AND (item->>'productId')::bigint = $1)
        OR (item->>'id' IS NOT NULL AND (item->>'id')::bigint = $1)
      ) AND o.status != 'cancelled'
    `, [prodId]);
    res.json({ totalOrdered: parseInt(result.rows[0].total_ordered) });
  } catch (err) {
    console.error("Product stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  const title = sanitizeText(req.body.title, 200);
  const description = sanitizeText(req.body.description, 2000);
  const collection_id = validatePositiveInt(req.body.collection_id);
  const orientation = ['portrait', 'landscape', 'both'].includes(req.body.orientation) ? req.body.orientation : 'portrait';
  const status = ['active', 'hidden'].includes(req.body.status) ? req.body.status : 'active';
  const is_featured = parseBool(req.body.is_featured);
  const is_trending = parseBool(req.body.is_trending);
  const is_new_arrival = parseBool(req.body.is_new_arrival);
  const is_bestseller = parseBool(req.body.is_bestseller);

  if (!title || title.length < 1) return res.status(400).json({ error: "Title is required" });
  if (!collection_id) return res.status(400).json({ error: "Collection is required" });
  const files = (req as any).files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ error: "At least one image required" });

  // Validate file types
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return res.status(400).json({ error: `Invalid file type: ${sanitizeFilename(file.originalname)}` });
    }
  }

  try {
    const catResult = await pool.query("SELECT slug FROM collections WHERE id = $1", [collection_id]);
    const folder = catResult.rows[0]?.slug || 'misc';
    const cloudinaryFolder = `poster-theory/products/${folder}`;

    // Upload all images
    const uploadedUrls: string[] = [];
    for (const file of files) {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: cloudinaryFolder, transformation: [{ quality: "auto", fetch_format: "auto" }] },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(file.buffer);
      });
      uploadedUrls.push(result.secure_url);
    }

    const parsedTags = req.body.tags ? (typeof req.body.tags === 'string' ? (() => { try { const t = JSON.parse(req.body.tags); return Array.isArray(t) ? t : []; } catch { return []; } })() : req.body.tags) : [];
    const parsedSizes = req.body.available_sizes ? (typeof req.body.available_sizes === 'string' ? (() => { try { const s = JSON.parse(req.body.available_sizes); return Array.isArray(s) ? s : []; } catch { return []; } })() : req.body.available_sizes) : [];
    const parsedLayouts = req.body.available_layouts ? (typeof req.body.available_layouts === 'string' ? (() => { try { const l = JSON.parse(req.body.available_layouts); return Array.isArray(l) ? l : []; } catch { return []; } })() : req.body.available_layouts) : [];

    // Validate arrays contain only numbers
    if (!Array.isArray(parsedTags)) return res.status(400).json({ error: "Tags must be an array" });
    if (!Array.isArray(parsedSizes) || parsedSizes.some((s: any) => typeof s !== 'number')) return res.status(400).json({ error: "Invalid sizes" });
    if (!Array.isArray(parsedLayouts) || parsedLayouts.some((l: any) => typeof l !== 'number')) return res.status(400).json({ error: "Invalid layouts" });

    const { rows } = await pool.query(
      `INSERT INTO products (title, description, collection_id, tags, image, images, image_folder, orientation, available_sizes, available_layouts, status, is_featured, is_trending, is_new_arrival, is_bestseller)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [title, description, collection_id, parsedTags, uploadedUrls[0], uploadedUrls, cloudinaryFolder, orientation, parsedSizes, parsedLayouts, status, is_featured, is_trending, is_new_arrival, is_bestseller]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const prodId = validatePositiveInt(id);
  if (!prodId) return res.status(400).json({ error: "Invalid product ID" });

  const title = req.body.title != null ? sanitizeText(req.body.title, 200) : undefined;
  const description = req.body.description != null ? sanitizeText(req.body.description, 2000) : undefined;
  const collection_id = req.body.collection_id != null ? validatePositiveInt(req.body.collection_id) : undefined;
  const orientation = req.body.orientation && ['portrait', 'landscape', 'both'].includes(req.body.orientation) ? req.body.orientation : undefined;
  const status = req.body.status && ['active', 'hidden'].includes(req.body.status) ? req.body.status : undefined;
  const tags = req.body.tags != null ? (Array.isArray(req.body.tags) ? req.body.tags : []) : undefined;
  const available_sizes = req.body.available_sizes != null ? (Array.isArray(req.body.available_sizes) ? req.body.available_sizes : []) : undefined;
  const available_layouts = req.body.available_layouts != null ? (Array.isArray(req.body.available_layouts) ? req.body.available_layouts : []) : undefined;

  // Boolean flags — explicitly parse, don't use COALESCE for booleans
  const is_featured = req.body.is_featured != null ? parseBool(req.body.is_featured) : undefined;
  const is_trending = req.body.is_trending != null ? parseBool(req.body.is_trending) : undefined;
  const is_new_arrival = req.body.is_new_arrival != null ? parseBool(req.body.is_new_arrival) : undefined;
  const is_bestseller = req.body.is_bestseller != null ? parseBool(req.body.is_bestseller) : undefined;

  if (title !== undefined && title.length < 1) return res.status(400).json({ error: "Title cannot be empty" });

  try {
    // If category changed, move image to new folder in Cloudinary
    if (collection_id) {
      const productResult = await pool.query("SELECT image, image_folder, collection_id FROM products WHERE id = $1", [prodId]);
      const product = productResult.rows[0];

      if (product && product.collection_id !== collection_id && product.image) {
        const newCatResult = await pool.query("SELECT slug FROM collections WHERE id = $1", [collection_id]);
        const newSlug = newCatResult.rows[0]?.slug;

        if (newSlug) {
          const newFolder = `poster-theory/products/${newSlug}`;

          // Extract public_id from current image URL
          const urlParts = product.image.split('/');
          const uploadIdx = urlParts.indexOf('upload');
          if (uploadIdx > -1) {
            // public_id is everything after /upload/v{version}/ without extension
            const afterUpload = urlParts.slice(uploadIdx + 2).join('/');
            const publicId = afterUpload.replace(/\.[^.]+$/, '');

            try {
              // Move image to new folder via rename
              const fileName = publicId.split('/').pop();
              const newPublicId = `${newFolder}/${fileName}`;
              await cloudinary.uploader.rename(publicId, newPublicId, { overwrite: true });

              // Get new URL
              const newUrl = cloudinary.url(newPublicId, { secure: true, format: 'auto', quality: 'auto' });
              
              // Update image and image_folder
              await pool.query(
                "UPDATE products SET image = $1, image_folder = $2 WHERE id = $3",
                [newUrl, newFolder, prodId]
              );
            } catch (moveErr) {
              // If move fails, just update collection without moving image
              console.error("Image move failed, updating collection only");
            }
          }

          // Ensure local folder exists
          ensureCollectionFolder(newSlug);
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE products SET 
        title = COALESCE($1, title), description = COALESCE($2, description), collection_id = COALESCE($3, collection_id),
        tags = COALESCE($4::text[], tags), orientation = COALESCE($5, orientation),
        available_sizes = COALESCE($6::int[], available_sizes), available_layouts = COALESCE($7::int[], available_layouts),
        status = COALESCE($8, status),
        is_featured = COALESCE($9, is_featured),
        is_trending = COALESCE($10, is_trending),
        is_new_arrival = COALESCE($11, is_new_arrival),
        is_bestseller = COALESCE($12, is_bestseller)
       WHERE id = $13 RETURNING *`,
      [title || null, description ?? null, collection_id || null, tags || null, orientation || null, available_sizes || null, available_layouts || null, status || null, is_featured ?? null, is_trending ?? null, is_new_arrival ?? null, is_bestseller ?? null, prodId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  const prodId = validatePositiveInt(req.params.id);
  if (!prodId) return res.status(400).json({ error: "Invalid product ID" });
  await pool.query("DELETE FROM products WHERE id = $1", [prodId]);
  res.json({ message: "Deleted" });
};

export const deleteProductImage = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
  try {
    const productResult = await pool.query("SELECT images, image FROM products WHERE id = $1", [id]);
    const product = productResult.rows[0];
    if (!product) return res.status(404).json({ error: "Product not found" });

    const updatedImages = (product.images || []).filter((url: string) => url !== imageUrl);
    const newMainImage = updatedImages.length > 0 ? updatedImages[0] : '';

    await pool.query("UPDATE products SET images = $1, image = $2 WHERE id = $3", [updatedImages, newMainImage, id]);

    // Delete from Cloudinary
    try {
      const urlParts = imageUrl.split('/');
      const uploadIdx = urlParts.indexOf('upload');
      if (uploadIdx > -1) {
        const publicId = urlParts.slice(uploadIdx + 2).join('/').replace(/\.[^.]+$/, '');
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (_) {}

    res.json({ images: updatedImages, image: newMainImage });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete image" });
  }
};

export const uploadProductImages = async (req: Request, res: Response) => {
  const { id } = req.params;
  const files = (req as any).files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ error: "No images provided" });

  try {
    const productResult = await pool.query("SELECT images, image, collection_id FROM products WHERE id = $1", [id]);
    const product = productResult.rows[0];
    if (!product) return res.status(404).json({ error: "Product not found" });

    const catResult = await pool.query("SELECT slug FROM collections WHERE id = $1", [product.collection_id]);
    const folder = catResult.rows[0]?.slug || 'misc';
    const cloudinaryFolder = `poster-theory/products/${folder}`;

    const uploadedUrls: string[] = [];
    for (const file of files) {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: cloudinaryFolder, transformation: [{ quality: "auto", fetch_format: "auto" }] },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(file.buffer);
      });
      uploadedUrls.push(result.secure_url);
    }

    const updatedImages = [...(product.images || []), ...uploadedUrls];
    const mainImage = product.image || updatedImages[0];

    await pool.query("UPDATE products SET images = $1, image = $2 WHERE id = $3", [updatedImages, mainImage, id]);
    res.json({ images: updatedImages, image: mainImage });
  } catch (err) {
    console.error("Upload product images error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};

export const setMainImage = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });

  try {
    const productResult = await pool.query("SELECT images FROM products WHERE id = $1", [id]);
    const product = productResult.rows[0];
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (!product.images?.includes(imageUrl)) return res.status(400).json({ error: "Image not found in product" });

    // Move selected image to front of array
    const reordered = [imageUrl, ...product.images.filter((url: string) => url !== imageUrl)];
    await pool.query("UPDATE products SET image = $1, images = $2 WHERE id = $3", [imageUrl, reordered, id]);
    res.json({ image: imageUrl, images: reordered });
  } catch (err) {
    res.status(500).json({ error: "Failed to set main image" });
  }
};

// ========== ORDERS ==========
export const getAdminOrders = async (req: Request, res: Response) => {
  const { rows } = await pool.query(`
    SELECT o.*, u.name as user_name, u.email, u.phone,
      a.line1, a.line2, a.city, a.state, a.pincode, a.label as addr_label
    FROM orders o
    JOIN users u ON o.user_id = u.id
    LEFT JOIN addresses a ON o.address_id = a.id
    ORDER BY o.created_at DESC
  `);
  res.json(rows);
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, note, courier_name, tracking_id } = req.body;
  const validStatuses = ['order_placed', 'verified', 'in_production', 'printed', 'ready_to_ship', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

  // Require tracking info for out_for_delivery or delivered
  if (status === 'out_for_delivery' || status === 'delivered') {
    if (!courier_name || !tracking_id) {
      return res.status(400).json({ error: "Courier name and tracking ID are required for shipping" });
    }
    await pool.query("UPDATE orders SET status = $1, courier_name = $2, tracking_id = $3, updated_at = NOW() WHERE id = $4", [status, courier_name, tracking_id, id]);
  } else {
    await pool.query("UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2", [status, id]);
  }

  await pool.query("INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)", [id, status, note || '']);

  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  res.json(rows[0]);
};

export const getOrderHistory = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at", [req.params.id]);
  res.json(rows);
};

// ========== CUSTOM REQUESTS ==========
export const getCustomRequests = async (req: Request, res: Response) => {
  const { rows } = await pool.query(`
    SELECT cr.*, u.name as user_name, u.email, s.name as size_name
    FROM custom_requests cr
    JOIN users u ON cr.user_id = u.id
    LEFT JOIN sizes s ON cr.size_id = s.id
    ORDER BY cr.created_at DESC
  `);
  res.json(rows);
};

export const updateCustomRequestStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const valid = ['pending_review', 'approved', 'rejected', 'printing', 'completed'];
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const { rows } = await pool.query("UPDATE custom_requests SET status = $1 WHERE id = $2 RETURNING *", [status, id]);
  res.json(rows[0]);
};

// ========== COUPONS ==========
export const getCoupons = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM coupons ORDER BY created_at DESC");
  res.json(rows);
};

export const createCoupon = async (req: Request, res: Response) => {
  const code = sanitizeText(req.body.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const type = ['percent', 'flat'].includes(req.body.type) ? req.body.type : null;
  const value = validatePositiveInt(req.body.value);
  const min_order = validateNonNegativeNum(req.body.min_order) ?? 0;
  const max_uses = validateNonNegativeNum(req.body.max_uses) ?? 0;
  const free_shipping = parseBool(req.body.free_shipping);
  const expires_at = req.body.expires_at || null;

  if (!code || code.length < 3) return res.status(400).json({ error: "Code must be at least 3 characters" });
  if (!type) return res.status(400).json({ error: "Type must be 'percent' or 'flat'" });
  if (!value || (type === 'percent' && value > 100)) return res.status(400).json({ error: type === 'percent' ? "Percent value must be 1-100" : "Value must be positive" });

  try {
    const { rows } = await pool.query(
      "INSERT INTO coupons (code, type, value, min_order, max_uses, free_shipping, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [code, type, value, min_order, max_uses, free_shipping, expires_at]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: "Coupon code already exists" });
    res.status(500).json({ error: "Failed to create coupon" });
  }
};

export const updateCoupon = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const { rows } = await pool.query("UPDATE coupons SET is_active = $1 WHERE id = $2 RETURNING *", [is_active, id]);
  res.json(rows[0]);
};

export const deleteCoupon = async (req: Request, res: Response) => {
  const couponId = validatePositiveInt(req.params.id);
  if (!couponId) return res.status(400).json({ error: "Invalid ID" });
  await pool.query("DELETE FROM coupons WHERE id = $1", [couponId]);
  res.json({ message: "Deleted" });
};

// ========== CUSTOMERS ==========
export const getCustomers = async (req: Request, res: Response) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.name, u.email, u.phone, u.created_at,
      COUNT(o.id) as total_orders,
      COALESCE(SUM(o.total), 0) as total_spend,
      MAX(o.created_at) as last_order
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id
    WHERE u.is_admin = false
    GROUP BY u.id
    ORDER BY total_spend DESC
  `);
  res.json(rows);
};

// ========== HOMEPAGE CONFIG ==========
export const getHomepageConfig = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM homepage_config ORDER BY section");
  res.json(rows);
};

export const updateHomepageConfig = async (req: Request, res: Response) => {
  const section = sanitizeText(req.body.section, 100);
  const { data } = req.body;
  if (!section || section.length < 1) return res.status(400).json({ error: "Section is required" });
  if (data === undefined || data === null) return res.status(400).json({ error: "Data is required" });
  // Prevent excessively large config data
  if (JSON.stringify(data).length > 50000) return res.status(400).json({ error: "Data too large" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO homepage_config (section, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (section) DO UPDATE SET data = $2, updated_at = NOW() RETURNING *`,
      [section, JSON.stringify(data)]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update config" });
  }
};

export const uploadHomepageImage = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "No image provided" });
  const section = sanitizeText(req.body.section, 50).replace(/[^a-z0-9_-]/gi, '_') || 'general';
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(req.file.mimetype)) {
    return res.status(400).json({ error: "Invalid image type. Allowed: jpeg, png, webp, gif" });
  }
  try {
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `poster-theory/homepage/${section}`, transformation: [{ quality: "auto", fetch_format: "auto" }] },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      stream.end(req.file!.buffer);
    });
    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    console.error("Homepage image upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};

// ========== FRAME PRICING ==========
export const getFramePricing = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM frame_pricing ORDER BY size_name");
  res.json(rows);
};

export const upsertFramePricing = async (req: Request, res: Response) => {
  const size_name = sanitizeText(req.body.size_name, 50);
  const price = validatePositiveInt(req.body.price);
  if (!size_name) return res.status(400).json({ error: "size_name required" });
  if (!price) return res.status(400).json({ error: "Valid price required" });
  const { rows } = await pool.query(
    `INSERT INTO frame_pricing (size_name, price) VALUES ($1, $2)
     ON CONFLICT (size_name) DO UPDATE SET price = $2 RETURNING *`,
    [size_name, price]
  );
  res.json(rows[0]);
};

export const deleteFramePricing = async (req: Request, res: Response) => {
  const id = validatePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID" });
  await pool.query("DELETE FROM frame_pricing WHERE id = $1", [id]);
  res.json({ message: "Deleted" });
};

// ========== MATERIAL PRICING ==========
export const getMaterialPricing = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM material_pricing ORDER BY material");
  res.json(rows);
};

export const upsertMaterialPricing = async (req: Request, res: Response) => {
  const material = sanitizeText(req.body.material, 50);
  const extra_price = req.body.extra_price !== undefined ? parseInt(req.body.extra_price, 10) : null;
  if (!material) return res.status(400).json({ error: "material required" });
  if (extra_price === null || isNaN(extra_price) || extra_price < 0) return res.status(400).json({ error: "Valid extra_price required" });
  const { rows } = await pool.query(
    `INSERT INTO material_pricing (material, extra_price) VALUES ($1, $2)
     ON CONFLICT (material) DO UPDATE SET extra_price = $2 RETURNING *`,
    [material, extra_price]
  );
  res.json(rows[0]);
};

// ========== COURIERS ==========
export const getCouriers = async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM couriers ORDER BY name");
  res.json(rows);
};

export const createCourier = async (req: Request, res: Response) => {
  const name = sanitizeText(req.body.name, 100);
  const tracking_url = sanitizeText(req.body.tracking_url, 500);
  if (!name || name.length < 2) return res.status(400).json({ error: "Name is required (min 2 chars)" });
  if (!tracking_url || !tracking_url.includes('{tracking_id}')) {
    return res.status(400).json({ error: "Tracking URL is required and must contain {tracking_id} placeholder" });
  }
  try {
    const { rows } = await pool.query("INSERT INTO couriers (name, tracking_url) VALUES ($1, $2) RETURNING *", [name, tracking_url]);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: "Courier already exists" });
    res.status(500).json({ error: "Failed to create courier" });
  }
};

export const updateCourier = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, tracking_url, is_active } = req.body;
  const { rows } = await pool.query(
    "UPDATE couriers SET name = COALESCE($1, name), tracking_url = COALESCE($2, tracking_url), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING *",
    [name || null, tracking_url || null, is_active, id]
  );
  res.json(rows[0]);
};

export const deleteCourier = async (req: Request, res: Response) => {
  const cId = validatePositiveInt(req.params.id);
  if (!cId) return res.status(400).json({ error: "Invalid ID" });
  await pool.query("DELETE FROM couriers WHERE id = $1", [cId]);
  res.json({ message: "Deleted" });
};


