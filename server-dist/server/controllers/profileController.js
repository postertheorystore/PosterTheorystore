import pool from "../config/db.js";
import { updateProfileSchema, addressSchema } from "../validators/schemas.js";
export const updateProfile = async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { name, phone } = parsed.data;
    try {
        await pool.query("UPDATE users SET name = $1, phone = $2 WHERE id = $3", [name, phone, req.user.id]);
        res.json({ message: "Profile updated", name, phone });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to update profile" });
    }
};
export const getAddresses = async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id DESC", [req.user.id]);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch addresses" });
    }
};
export const addAddress = async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { label, line1, line2, city, state, pincode, is_default } = parsed.data;
    try {
        if (is_default) {
            await pool.query("UPDATE addresses SET is_default = false WHERE user_id = $1", [req.user.id]);
        }
        const { rows } = await pool.query("INSERT INTO addresses (user_id, label, line1, line2, city, state, pincode, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [req.user.id, label, line1, line2 || "", city, state, pincode, is_default]);
        res.status(201).json(rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to add address" });
    }
};
export const updateAddress = async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { label, line1, line2, city, state, pincode, is_default } = parsed.data;
    const { id } = req.params;
    try {
        if (is_default) {
            await pool.query("UPDATE addresses SET is_default = false WHERE user_id = $1", [req.user.id]);
        }
        const { rows } = await pool.query("UPDATE addresses SET label=$1, line1=$2, line2=$3, city=$4, state=$5, pincode=$6, is_default=$7 WHERE id=$8 AND user_id=$9 RETURNING *", [label, line1, line2 || "", city, state, pincode, is_default, id, req.user.id]);
        if (!rows[0])
            return res.status(404).json({ error: "Address not found" });
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to update address" });
    }
};
export const deleteAddress = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM addresses WHERE id = $1 AND user_id = $2", [id, req.user.id]);
        res.json({ message: "Address deleted" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to delete address" });
    }
};
export const checkProfileComplete = async (req, res) => {
    try {
        const { rows: userRows } = await pool.query("SELECT name, phone FROM users WHERE id = $1", [req.user.id]);
        const { rows: addrRows } = await pool.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1", [req.user.id]);
        const user = userRows[0];
        const complete = !!(user?.name && user?.phone && addrRows.length > 0);
        res.json({ complete, missing: {
                name: !user?.name,
                phone: !user?.phone,
                address: addrRows.length === 0,
            } });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to check profile" });
    }
};
// ========== USER CART ==========
export const getCart = async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT items FROM user_cart WHERE user_id = $1", [req.user.id]);
        res.json(rows[0]?.items || []);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch cart" });
    }
};
export const saveCart = async (req, res) => {
    const { items } = req.body;
    try {
        await pool.query(`INSERT INTO user_cart (user_id, items, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET items = $2, updated_at = NOW()`, [req.user.id, JSON.stringify(items || [])]);
        res.json({ message: "Cart saved" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to save cart" });
    }
};
export const clearCartDB = async (req, res) => {
    try {
        await pool.query("DELETE FROM user_cart WHERE user_id = $1", [req.user.id]);
        res.json({ message: "Cart cleared" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to clear cart" });
    }
};
