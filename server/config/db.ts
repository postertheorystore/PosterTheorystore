import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
export const { Pool } = pg;

// ─── DEV SEED: Disabled for production ───
// import { seedDatabase } from "./seed.ts";
// ────────────────────────────────────────────────────

const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is required");
  // Only allow postgresql:// protocol
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error("DATABASE_URL must use postgresql:// protocol");
  }
  return url;
};

const dbUrl = getDatabaseUrl();

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: true } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 20000,
  max: 5,
});

const initDB = async () => {
  // In production, skip schema creation entirely — use production_reset.sql manually
  if (process.env.NODE_ENV === 'production') {
    console.log("Production mode — skipping schema creation");
    return;
  }

  try {
    const client = await pool.connect();

    // ─── Uncomment to reset DB (keeps users) ───
    // await client.query(`
    //   DROP TABLE IF EXISTS user_cart CASCADE;
    //   DROP TABLE IF EXISTS homepage_config CASCADE;
    //   DROP TABLE IF EXISTS addresses CASCADE;
    //   DROP TABLE IF EXISTS designs CASCADE;
    //   DROP TABLE IF EXISTS coupons CASCADE;
    //   DROP TABLE IF EXISTS custom_requests CASCADE;
    //   DROP TABLE IF EXISTS order_status_history CASCADE;
    //   DROP TABLE IF EXISTS orders CASCADE;
    //   DROP TABLE IF EXISTS products CASCADE;
    //   DROP TABLE IF EXISTS pricing CASCADE;
    //   DROP TABLE IF EXISTS sizes CASCADE;
    //   DROP TABLE IF EXISTS layouts CASCADE;
    //   DROP TABLE IF EXISTS collections CASCADE;
    //   DROP TABLE IF EXISTS login_attempts CASCADE;
    //   DROP TABLE IF EXISTS otp_codes CASCADE;
    // `);
    // ─────────────────────────────────────────────────────

    // Schema only — no data here
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT DEFAULT '',
        email_verified BOOLEAN DEFAULT false,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'signup',
        attempts INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        ip TEXT NOT NULL,
        success BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS collections (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS layouts (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        panel_count INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS sizes (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        width_mm INTEGER NOT NULL,
        height_mm INTEGER NOT NULL,
        margin_top NUMERIC(5,1) NOT NULL DEFAULT 10,
        margin_bottom NUMERIC(5,1) NOT NULL DEFAULT 10,
        margin_left NUMERIC(5,1) NOT NULL DEFAULT 10,
        margin_right NUMERIC(5,1) NOT NULL DEFAULT 10,
        is_active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS pricing (
        id SERIAL PRIMARY KEY,
        size_id INTEGER REFERENCES sizes(id) ON DELETE CASCADE,
        layout_id INTEGER REFERENCES layouts(id) ON DELETE CASCADE,
        price INTEGER NOT NULL,
        UNIQUE(size_id, layout_id)
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
        tags TEXT[] DEFAULT '{}',
        image TEXT,
        images TEXT[] DEFAULT '{}',
        image_folder TEXT DEFAULT '',
        orientation TEXT DEFAULT 'portrait',
        available_sizes INTEGER[] DEFAULT '{}',
        available_layouts INTEGER[] DEFAULT '{}',
        status TEXT DEFAULT 'active',
        is_featured BOOLEAN DEFAULT false,
        is_trending BOOLEAN DEFAULT false,
        is_new_arrival BOOLEAN DEFAULT true,
        is_bestseller BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        items JSONB,
        total INTEGER,
        address_id INTEGER,
        status TEXT DEFAULT 'new_order',
        customer_name TEXT,
        customer_phone TEXT,
        customer_email TEXT,
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_status_history (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS custom_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        image TEXT NOT NULL,
        notes TEXT DEFAULT '',
        size_id INTEGER REFERENCES sizes(id),
        quantity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending_review',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL DEFAULT 'percent',
        value INTEGER NOT NULL,
        min_order INTEGER DEFAULT 0,
        max_uses INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        free_shipping BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sale_announcements (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT DEFAULT '',
        description TEXT DEFAULT '',
        discount_text TEXT DEFAULT '',
        coupon_code TEXT DEFAULT '',
        min_order INTEGER DEFAULT 0,
        starts_at TIMESTAMP,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sale_announcements_active ON sale_announcements (is_active);
      CREATE INDEX IF NOT EXISTS idx_sale_announcements_starts_at ON sale_announcements (starts_at);
      CREATE INDEX IF NOT EXISTS idx_sale_announcements_expires_at ON sale_announcements (expires_at);
      CREATE INDEX IF NOT EXISTS idx_sale_announcements_priority ON sale_announcements (priority DESC);

      CREATE TABLE IF NOT EXISTS designs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        text TEXT,
        font_size INTEGER,
        size TEXT,
        position TEXT
      );

      CREATE TABLE IF NOT EXISTS addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        label TEXT DEFAULT 'Home',
        line1 TEXT NOT NULL,
        line2 TEXT DEFAULT '',
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        pincode TEXT NOT NULL,
        is_default BOOLEAN DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS homepage_config (
        id SERIAL PRIMARY KEY,
        section TEXT UNIQUE NOT NULL,
        data JSONB DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_cart (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        items JSONB DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );

      CREATE TABLE IF NOT EXISTS order_item_tracking (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        item_index INTEGER NOT NULL,
        downloaded BOOLEAN DEFAULT false,
        printing BOOLEAN DEFAULT false,
        completed BOOLEAN DEFAULT false,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id, item_index)
      );

      CREATE TABLE IF NOT EXISTS page_visits (
        id SERIAL PRIMARY KEY,
        page TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        referrer TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS couriers (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        tracking_url TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ─── DEV SEED: Disabled for production ───
    // if (process.env.NODE_ENV !== 'production') {
    //   await seedDatabase(client);
    // }
    // ─────────────────────────────────────────────────

    // Ensure new columns exist on existing tables
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS orientation TEXT DEFAULT 'portrait';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_folder TEXT DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name TEXT DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_id TEXT DEFAULT '';
      ALTER TABLE sizes ADD COLUMN IF NOT EXISTS frame_only BOOLEAN DEFAULT false;
    `).catch(() => {});

    // Insert Bookmark size if not exists
    await client.query(`
      INSERT INTO sizes (name, width_mm, height_mm, margin_top, margin_bottom, margin_left, margin_right)
      VALUES ('Bookmark', 51, 152, 5, 5, 5, 5)
      ON CONFLICT (name) DO NOTHING;
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS frame_pricing (
        id SERIAL PRIMARY KEY,
        size_name TEXT NOT NULL,
        price INTEGER NOT NULL,
        UNIQUE(size_name)
      );

      CREATE TABLE IF NOT EXISTS material_pricing (
        id SERIAL PRIMARY KEY,
        material TEXT NOT NULL,
        extra_price INTEGER NOT NULL DEFAULT 0,
        UNIQUE(material)
      );

      
    `);

    client.release();
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Failed to initialize PostgreSQL Database:", err);
  }
};

initDB();

export default pool;
