-- ============================================================
-- POSTER THEORY — PRODUCTION DATABASE RESET & INIT
-- Run this against your PostgreSQL instance to fully clear
-- and reinitialize the database.
--
-- WARNING: This DROPS all existing data!
-- ============================================================

BEGIN;

-- ─── DROP ALL TABLES ───
DROP TABLE IF EXISTS order_item_tracking CASCADE;
DROP TABLE IF EXISTS user_cart CASCADE;
DROP TABLE IF EXISTS homepage_config CASCADE;
DROP TABLE IF EXISTS addresses CASCADE;
DROP TABLE IF EXISTS designs CASCADE;
DROP TABLE IF EXISTS sale_announcements CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS custom_requests CASCADE;
DROP TABLE IF EXISTS order_status_history CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS pricing CASCADE;
DROP TABLE IF EXISTS sizes CASCADE;
DROP TABLE IF EXISTS layouts CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS login_attempts CASCADE;
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email_verified BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE otp_codes (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'signup',
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_attempts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  success BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collections (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE layouts (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  panel_count INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE sizes (
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

CREATE TABLE pricing (
  id SERIAL PRIMARY KEY,
  size_id INTEGER REFERENCES sizes(id) ON DELETE CASCADE,
  layout_id INTEGER REFERENCES layouts(id) ON DELETE CASCADE,
  price INTEGER NOT NULL,
  UNIQUE(size_id, layout_id)
);

CREATE TABLE products (
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

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  items JSONB,
  total INTEGER,
  address_id INTEGER,
  status TEXT DEFAULT 'order_placed',
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  courier_name TEXT DEFAULT '',
  tracking_id TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_item_tracking (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL,
  downloaded BOOLEAN DEFAULT false,
  printing BOOLEAN DEFAULT false,
  completed BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id, item_index)
);

CREATE TABLE custom_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  image TEXT NOT NULL,
  notes TEXT DEFAULT '',
  size_id INTEGER REFERENCES sizes(id),
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending_review',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE coupons (
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

CREATE TABLE designs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  text TEXT,
  font_size INTEGER,
  size TEXT,
  position TEXT
);

CREATE TABLE addresses (
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

CREATE TABLE homepage_config (
  id SERIAL PRIMARY KEY,
  section TEXT UNIQUE NOT NULL,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_cart (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  items JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE TABLE page_visits (
  id SERIAL PRIMARY KEY,
  page TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  referrer TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE couriers (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  tracking_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES (production performance)
-- ============================================================

CREATE INDEX idx_otp_email_type ON otp_codes(email, type);
CREATE INDEX idx_otp_expires ON otp_codes(expires_at) WHERE used = false;
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);
CREATE INDEX idx_products_collection ON products(collection_id) WHERE status = 'active';
CREATE INDEX idx_products_featured ON products(is_featured) WHERE status = 'active';
CREATE INDEX idx_products_trending ON products(is_trending) WHERE status = 'active';
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_page_visits_page ON page_visits(page, created_at);
CREATE INDEX idx_page_visits_created ON page_visits(created_at DESC);

-- ============================================================
-- ADMIN USER
-- Password: Admin@1234 (bcrypt 12 rounds) — CHANGE AFTER FIRST LOGIN
-- ============================================================

INSERT INTO users (name, email, password, phone, email_verified, is_admin)
VALUES (
  'Admin',
  'admin@postertheory.com',
  '$2b$12$3JYlPHLwqzW5Som2DCZAQuTJ.ujBb/IxnJ0tvJ3VvLdv4yJFBO6bO',
  '9999999999',
  true,
  true
);

-- ============================================================
-- COLLECTIONS
-- ============================================================

INSERT INTO collections (name, slug) VALUES
  ('Anime', 'anime'),
  ('Movies', 'movies'),
  ('Music', 'music'),
  ('Minimal', 'minimal'),
  ('Typography', 'typography');
  -- ('Vintage', 'vintage'),
  -- ('Photography', 'photography'),
  -- ('Gaming', 'gaming'),
  -- ('Sports', 'sports'),
  -- ('Devotional', 'devotional'),
  -- ('Series', 'series');

-- ============================================================
-- LAYOUTS
-- ============================================================

INSERT INTO layouts (name, panel_count) VALUES
  ('Single', 1),
  ('Duo', 2),
  ('Trio', 3),
  ('Quad', 4);

-- ============================================================
-- PAPER SIZES (mm)
-- ============================================================

INSERT INTO sizes (name, width_mm, height_mm, margin_top, margin_bottom, margin_left, margin_right) VALUES
  ('A3',       297, 420, 2.5, 2.5, 2.5, 2.5),
  ('A4',       210, 297, 2.5, 2.5, 2.5, 2.5),
  ('A5',       148, 210, 2.5, 2.5, 2.5, 2.5),
  ('A6',       105, 148, 2.5, 2.5, 2.5, 2.5),
  ('Polaroid',  75,  90, 5.0, 15.0, 2.5, 2.5),
  ('Pocket',    50,  70, 3.0, 14.0, 2.5, 2.5);

-- ============================================================
-- PRICING MATRIX (INR)
-- ============================================================

DO $$
DECLARE
  s_id INTEGER;
  l_id INTEGER;
  price_val INTEGER;
  price_matrix JSONB := '{
    "A3":       {"Single": 199, "Duo": 349, "Trio": 499, "Quad": 599},
    "A4":       {"Single": 129, "Duo": 229, "Trio": 329, "Quad": 399},
    "A5":       {"Single": 99,  "Duo": 179, "Trio": 249, "Quad": 299},
    "A6":       {"Single": 69,  "Duo": 129, "Trio": 179, "Quad": 219},
    "Polaroid": {"Single": 49,  "Duo": 89},
    "Pocket":   {"Single": 39,  "Duo": 69}
  }';
  size_name TEXT;
  layout_name TEXT;
BEGIN
  FOR size_name IN SELECT jsonb_object_keys(price_matrix) LOOP
    SELECT id INTO s_id FROM sizes WHERE name = size_name;
    IF s_id IS NULL THEN CONTINUE; END IF;

    FOR layout_name IN SELECT jsonb_object_keys(price_matrix -> size_name) LOOP
      SELECT id INTO l_id FROM layouts WHERE name = layout_name;
      IF l_id IS NULL THEN CONTINUE; END IF;

      price_val := (price_matrix -> size_name ->> layout_name)::INTEGER;

      INSERT INTO pricing (size_id, layout_id, price) VALUES (s_id, l_id, price_val);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- HOMEPAGE CONFIG
-- ============================================================

INSERT INTO homepage_config (section, data) VALUES
  ('hero', '{"title": "Poster Theory", "subtitle": "Curated prints for your walls", "cta_text": "Shop Now", "cta_link": "/shop"}'),
  ('hero_images', '{"images": [{"url": "", "ref": "001//STILL_LIFE_VIBES"}, {"url": "", "ref": "002//SILK_CHROMATIC"}, {"url": "", "ref": "003//NEON_DREAMS"}, {"url": "", "ref": "004//STUDIO_GEOMETRIC"}]}'),
  ('collection_images', '{"collections": []}'),
  ('about_image', '{"url": ""}'),
  ('new_arrivals', '{"enabled": true, "limit": 8}'),
  ('trending', '{"enabled": true, "limit": 8}'),
  ('featured', '{"enabled": true, "limit": 4}'),
  ('bestseller', '{"enabled": true, "limit": 8}');

COMMIT;

-- ============================================================
-- DONE — Production DB initialized
-- Admin: admin@postertheory.com / Admin@1234
-- ============================================================
