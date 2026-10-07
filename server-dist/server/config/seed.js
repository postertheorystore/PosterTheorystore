/**
 * DEV SEED DATA
 * Remove this file (and its import in db.ts) when moving to production.
 */
export const seedDatabase = async (client) => {
    // Seed collections
    const catCount = await client.query("SELECT COUNT(*) FROM collections");
    if (parseInt(catCount.rows[0].count) === 0) {
        const cats = ['Anime', 'Movies', 'Music', 'Minimal', 'Typography', 'Abstract', 'Vintage', 'Photography', 'Gaming', 'Sports', 'Devotional'];
        for (const c of cats) {
            await client.query("INSERT INTO collections (name, slug) VALUES ($1, $2)", [c, c.toLowerCase()]);
        }
        console.log("  â†’ Seeded collections");
    }
    // Seed layouts
    const layoutCount = await client.query("SELECT COUNT(*) FROM layouts");
    if (parseInt(layoutCount.rows[0].count) === 0) {
        await client.query("INSERT INTO layouts (name, panel_count) VALUES ('Single', 1), ('Duo', 2), ('Trio', 3), ('Quad', 4)");
        console.log("  â†’ Seeded layouts");
    }
    // Seed sizes with margins (top, bottom, left, right in mm)
    const sizeCount = await client.query("SELECT COUNT(*) FROM sizes");
    if (parseInt(sizeCount.rows[0].count) === 0) {
        // [name, width, height, margin_top, margin_bottom, margin_left, margin_right]
        const sizes = [
            ['A3', 297, 420, 2.5, 2.5, 2.5, 2.5],
            ['A4', 210, 297, 2.5, 2.5, 2.5, 2.5],
            ['A5', 148, 210, 2.5, 2.5, 2.5, 2.5],
            ['A6', 105, 148, 2.5, 2.5, 2.5, 2.5],
            ['Polaroid', 75, 90, 5, 15, 2.5, 2.5],
            ['Pocket', 50, 70, 3, 14, 2.5, 2.5],
        ];
        for (const [name, w, h, mt, mb, ml, mr] of sizes) {
            await client.query("INSERT INTO sizes (name, width_mm, height_mm, margin_top, margin_bottom, margin_left, margin_right) VALUES ($1, $2, $3, $4, $5, $6, $7)", [name, w, h, mt, mb, ml, mr]);
        }
        console.log("  â†’ Seeded sizes (with margins)");
    }
    // Seed pricing matrix (Size Ã— Layout â†’ Price in â‚¹)
    const priceCount = await client.query("SELECT COUNT(*) FROM pricing");
    if (parseInt(priceCount.rows[0].count) === 0) {
        const sizesResult = await client.query("SELECT id, name FROM sizes ORDER BY id");
        const layoutsResult = await client.query("SELECT id, name FROM layouts ORDER BY id");
        // Prices: [Single, Duo, Trio, Quad] per size
        // 0 means that combination is not available
        const priceMatrix = {
            'A3': [199, 349, 499, 599],
            'A4': [129, 229, 329, 399],
            'A5': [99, 179, 249, 299],
            'A6': [69, 129, 179, 219],
            'Polaroid': [49, 89, 0, 0],
            'Pocket': [39, 69, 0, 0],
        };
        for (const size of sizesResult.rows) {
            const prices = priceMatrix[size.name];
            if (!prices)
                continue;
            for (let i = 0; i < layoutsResult.rows.length; i++) {
                const layout = layoutsResult.rows[i];
                const price = prices[i] || 0;
                if (price > 0) {
                    await client.query("INSERT INTO pricing (size_id, layout_id, price) VALUES ($1, $2, $3)", [size.id, layout.id, price]);
                }
            }
        }
        console.log("  â†’ Seeded pricing matrix");
    }
    // Seed homepage config
    const hpCount = await client.query("SELECT COUNT(*) FROM homepage_config");
    if (parseInt(hpCount.rows[0].count) === 0) {
        await client.query(`INSERT INTO homepage_config (section, data) VALUES 
      ('hero', '{"title": "Poster Theory", "subtitle": "Curated prints for your walls", "cta_text": "Shop Now", "cta_link": "/shop"}'),
      ('hero_images', '{"images": [{"url": "", "ref": "001//STILL_LIFE_VIBES"}, {"url": "", "ref": "002//SILK_CHROMATIC"}, {"url": "", "ref": "003//NEON_DREAMS"}, {"url": "", "ref": "004//STUDIO_GEOMETRIC"}]}'),
      ('collection_images', '{"collections": [{"name": "Anime Archive", "img": "", "path": "/shop?collection=Anime"}, {"name": "F1 Syndicate", "img": "", "path": "/shop?collection=F1"}, {"name": "Music Gallery", "img": "", "path": "/shop?collection=Music"}, {"name": "Motorsports", "img": "", "path": "/shop?collection=Cars"}]}'),
      ('about_image', '{"url": ""}'),
      ('new_arrivals', '{"enabled": true, "limit": 8}'),
      ('trending', '{"enabled": true, "limit": 8}'),
      ('featured', '{"enabled": true, "limit": 4}')
    `);
        console.log("  â†’ Seeded homepage config");
    }
    console.log("  âœ“ Dev seed complete");
};
