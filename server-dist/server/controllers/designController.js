import pool from "../config/db.js";
import { createDesignSchema } from "../validators/schemas.js";
export const createDesign = async (req, res) => {
    const parsed = createDesignSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { text, font_size, size, position } = parsed.data;
    const user_id = req.user.id;
    try {
        const { rows } = await pool.query("INSERT INTO designs (user_id, text, font_size, size, position) VALUES ($1, $2, $3, $4, $5) RETURNING id", [user_id, text, font_size, size, JSON.stringify(position)]);
        res.status(201).json({ id: rows[0].id, text, font_size, size, position });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to save design" });
    }
};
export const getUserDesigns = async (req, res) => {
    const user_id = req.params.id;
    try {
        const { rows } = await pool.query("SELECT * FROM designs WHERE user_id = $1", [user_id]);
        const parsedDesigns = rows.map((d) => ({
            ...d,
            position: JSON.parse(d.position)
        }));
        res.json(parsedDesigns);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch designs" });
    }
};
