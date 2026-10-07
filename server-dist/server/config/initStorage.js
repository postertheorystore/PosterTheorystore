import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../");
export const UPLOADS_DIR = path.join(ROOT, "public/uploads");
export const ensureCollectionFolder = (slug) => {
    const dir = path.join(UPLOADS_DIR, slug);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
};
export const initStorage = async () => {
    if (!fs.existsSync(UPLOADS_DIR))
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    try {
        const { rows } = await pool.query("SELECT slug FROM collections");
        // Always ensure local folders exist
        for (const row of rows) {
            ensureCollectionFolder(row.slug);
        }
        console.log(`Storage synced: ${rows.length} collections`);
    }
    catch (err) {
        console.log("Local uploads base folder created (DB not ready for full sync)");
    }
};
