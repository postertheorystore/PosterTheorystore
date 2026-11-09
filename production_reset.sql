

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
