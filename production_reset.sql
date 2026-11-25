

---------BUY X Get Y promotion------------

BEGIN;

CREATE TABLE IF NOT EXISTS promotion_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),

    name TEXT NOT NULL DEFAULT 'Buy 5 Get 3 Free',

    buy_quantity INTEGER NOT NULL DEFAULT 5
        CHECK (buy_quantity > 0),

    free_quantity INTEGER NOT NULL DEFAULT 3
        CHECK (free_quantity > 0),

    eligible_category TEXT NOT NULL DEFAULT 'print_only'
        CHECK (eligible_category = 'print_only'),

    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO promotion_settings (
    id,
    name,
    buy_quantity,
    free_quantity,
    eligible_category,
    is_active
)
VALUES (
    1,
    'Buy 5 Get 3 Free',
    5,
    3,
    'print_only',
    true
)
ON CONFLICT (id) DO NOTHING;

COMMIT;


CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(150) NOT NULL,
    review_text TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    image_url TEXT,
    span VARCHAR(20) NOT NULL DEFAULT 'short'
        CHECK (span IN ('short', 'tall', 'wide')),
    status VARCHAR(20) NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'published', 'hidden')),
    source VARCHAR(20) NOT NULL DEFAULT 'admin'
        CHECK (source IN ('admin', 'customer')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);