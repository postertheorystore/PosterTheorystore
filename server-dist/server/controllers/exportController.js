import sharp from "sharp";
// @ts-ignore
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Archiver } = require('archiver');
import pool from "../config/db.js";
const LINE_THICKNESS = 4;
const getSizeConfig = async (sizeName) => {
    const { rows } = await pool.query("SELECT name, width_mm, height_mm, margin_top, margin_bottom, margin_left, margin_right FROM sizes WHERE name = $1", [sizeName]);
    if (!rows[0])
        return null;
    return {
        ...rows[0],
        width_mm: parseFloat(rows[0].width_mm),
        height_mm: parseFloat(rows[0].height_mm),
        margin_top: parseFloat(rows[0].margin_top),
        margin_bottom: parseFloat(rows[0].margin_bottom),
        margin_left: parseFloat(rows[0].margin_left),
        margin_right: parseFloat(rows[0].margin_right),
    };
};
export const exportHighRes = async (req, res) => {
    try {
        const { imageDataUrl, size, orientation, printStyle, fileName, panelCount = 1, splitDirection = 'vertical' } = req.body;
        if (!imageDataUrl || !size || !orientation || !printStyle) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        const sizeConfig = await getSizeConfig(size);
        if (!sizeConfig)
            return res.status(400).json({ error: "Invalid paper size" });
        const base64Match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        if (!base64Match)
            return res.status(400).json({ error: "Invalid image data" });
        const imageBuffer = Buffer.from(base64Match[1], 'base64');
        const [sheetW, sheetH] = orientation === 'portrait'
            ? [sizeConfig.width_mm, sizeConfig.height_mm]
            : [sizeConfig.height_mm, sizeConfig.width_mm];
        // Grid layout
        let cols = 1, rows = 1;
        if (panelCount === 4) {
            cols = 2;
            rows = 2;
        }
        else if (panelCount === 9) {
            cols = 3;
            rows = 3;
        }
        else if (panelCount > 1) {
            if (splitDirection === 'vertical')
                cols = panelCount;
            else
                rows = panelCount;
        }
        const totalW = sheetW * cols;
        const totalH = sheetH * rows;
        const printWidthPx = Math.round((totalW / 25.4) * 300);
        const printHeightPx = Math.round((totalH / 25.4) * 300);
        const sheetWPx = Math.round((sheetW / 25.4) * 300);
        const sheetHPx = Math.round((sheetH / 25.4) * 300);
        // Generate full combined image
        let fullImage;
        if (printStyle === 'white-margin') {
            const mTop = Math.round((sizeConfig.margin_top / 25.4) * 300);
            const mRight = Math.round((sizeConfig.margin_right / 25.4) * 300);
            const mBottom = Math.round((sizeConfig.margin_bottom / 25.4) * 300);
            const mLeft = Math.round((sizeConfig.margin_left / 25.4) * 300);
            const innerW = printWidthPx - mLeft - mRight;
            const innerH = printHeightPx - mTop - mBottom;
            const resized = await sharp(imageBuffer).resize(innerW, innerH, { fit: 'cover' }).toBuffer();
            fullImage = await sharp({
                create: { width: printWidthPx, height: printHeightPx, channels: 3, background: { r: 255, g: 255, b: 255 } }
            }).composite([{ input: resized, top: mTop, left: mLeft }]).png().toBuffer();
        }
        else {
            fullImage = await sharp(imageBuffer).resize(printWidthPx, printHeightPx, { fit: 'cover' }).png().toBuffer();
        }
        const sanitized = (fileName || 'print').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\.\.+/g, '').trim().slice(0, 80) || 'print';
        // Single panel — return PNG directly
        if (panelCount <= 1) {
            const downloadName = `${sanitized}_${size.replace(/[^a-zA-Z0-9]/g, '')}_${orientation}_300dpi.png`;
            res.set({
                'Content-Type': 'image/png',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`,
                'Content-Length': fullImage.length.toString(),
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-store',
            });
            return res.send(fullImage);
        }
        // Multi-panel — ZIP with full image (red lines) + individual panels
        // Add red cut lines
        const redLines = [];
        for (let i = 1; i < cols; i++) {
            redLines.push({
                input: await sharp({ create: { width: LINE_THICKNESS, height: printHeightPx, channels: 4, background: { r: 255, g: 50, b: 50, alpha: 200 } } }).png().toBuffer(),
                top: 0, left: sheetWPx * i - Math.floor(LINE_THICKNESS / 2),
            });
        }
        for (let i = 1; i < rows; i++) {
            redLines.push({
                input: await sharp({ create: { width: printWidthPx, height: LINE_THICKNESS, channels: 4, background: { r: 255, g: 50, b: 50, alpha: 200 } } }).png().toBuffer(),
                top: sheetHPx * i - Math.floor(LINE_THICKNESS / 2), left: 0,
            });
        }
        const fullWithLines = await sharp(fullImage).composite(redLines).png().toBuffer();
        // Cut individual panels
        const panels = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c + 1;
                const panel = await sharp(fullImage)
                    .extract({ left: c * sheetWPx, top: r * sheetHPx, width: sheetWPx, height: sheetHPx })
                    .png().toBuffer();
                panels.push({ buffer: panel, name: `panel_${idx}_of_${panelCount}.png` });
            }
        }
        // Stream ZIP
        const zipName = `${sanitized}_${size.replace(/[^a-zA-Z0-9]/g, '')}_${orientation}_${panelCount}panel.zip`;
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
        });
        const archive = new Archiver('zip', { zlib: { level: 6 } });
        archive.pipe(res);
        archive.append(fullWithLines, { name: 'full_with_cutlines.png' });
        for (const p of panels)
            archive.append(p.buffer, { name: p.name });
        await archive.finalize();
    }
    catch (err) {
        console.error("Export error:", err);
        if (!res.headersSent)
            res.status(500).json({ error: "Failed to generate export" });
    }
};
