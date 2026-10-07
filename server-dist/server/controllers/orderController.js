import pool from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
const uploadBase64ToCloudinary = async (base64, userId) => {
    const result = await cloudinary.uploader.upload(base64, {
        folder: `poster-theory/custom/${userId}`,
        quality: "auto",
        fetch_format: "auto",
    });
    return result.secure_url;
};
/**
 * Existing order validation + server-side pricing, extracted unchanged from the
 * old createOrder so the payment flow can reuse it.
 *
 *  - uploadImages: false  -> "quote" mode. Validates and prices only (cheap, no Cloudinary).
 *  - uploadImages: true   -> also uploads base64 custom images to Cloudinary.
 *
 * NOTE: catalog (non-custom) items still use the client-supplied price, exactly as
 * before. See the notes delivered with this change.
 */
export const prepareOrder = async (user_id, items, address_id, opts = { uploadImages: true }) => {
    const fail = (status, error) => ({ ok: false, status, error });
    // Verify profile is complete
    const userResult = await pool.query("SELECT name, phone FROM users WHERE id = $1", [user_id]);
    const user = userResult.rows[0];
    if (!user?.name || !user?.phone) {
        return fail(400, "Please complete your profile (name and phone) before placing an order.");
    }
    // Verify address belongs to user
    const addrResult = await pool.query("SELECT id FROM addresses WHERE id = $1 AND user_id = $2", [address_id, user_id]);
    if (!addrResult.rows[0]) {
        return fail(400, "Invalid delivery address.");
    }
    // Load pricing from DB to calculate total server-side (prevent price tampering)
    const { rows: pricingRows } = await pool.query(`
    SELECT p.price, s.name as size_name, l.name as layout_name
    FROM pricing p
    JOIN sizes s ON p.size_id = s.id
    JOIN layouts l ON p.layout_id = l.id
  `);
    const pricingMap = {};
    for (const row of pricingRows) {
        pricingMap[`${row.size_name}-${row.layout_name}`] = row.price;
    }
    // Load frame + material pricing
    const { rows: framePricingRows } = await pool.query('SELECT size_name, price FROM frame_pricing');
    const framePricingMap = {};
    for (const row of framePricingRows)
        framePricingMap[row.size_name] = row.price;
    const { rows: materialPricingRows } = await pool.query('SELECT material, extra_price FROM material_pricing');
    const materialPricingMap = {};
    for (const row of materialPricingRows)
        materialPricingMap[row.material] = row.extra_price;
    // Validate and recalculate prices server-side
    const parsedItems = Array.isArray(items) ? items : JSON.parse(items);
    if (!parsedItems.length || parsedItems.length > 50) {
        return fail(400, "Invalid number of items.");
    }
    let serverTotal = 0;
    const processedItems = [];
    for (const item of parsedItems) {
        // Non-custom catalog items: trust client price (no customSpecs)
        if (!item.isCustom || !item.customSpecs) {
            const qty = Math.max(1, Math.min(100, parseInt(item.quantity) || 1));
            const price = Math.max(0, parseFloat(item.price) || 0);
            serverTotal += price * qty;
            processedItems.push({ ...item, price, quantity: qty });
            continue;
        }
        const size = item.customSpecs?.size;
        const layout = item.customSpecs?.layout;
        if (!size || !layout) {
            return fail(400, `Item "${item.title || 'Unknown'}" is missing size/layout info.`);
        }
        const key = `${size}-${layout}`;
        const basePrice = pricingMap[key] ?? Object.entries(pricingMap)
            .filter(([k]) => k.startsWith(`${size}-`))
            .reduce((min, [, v]) => (v < min ? v : min), Infinity);
        if (!basePrice || basePrice <= 0 || basePrice === Infinity) {
            console.error(`Price lookup failed: key=${key}, available keys:`, Object.keys(pricingMap));
            return fail(400, `No valid price found for ${size} - ${layout}. Please re-add to cart.`);
        }
        const frameOption = item.customSpecs?.frame;
        const material = item.customSpecs?.material || 'PAPER';
        const frameCost = (frameOption && frameOption !== 'None') ? (framePricingMap[size] || 0) : 0;
        const materialExtra = materialPricingMap[material] ?? 0;
        const verifiedPrice = basePrice + frameCost + materialExtra;
        const qty = Math.max(1, Math.min(100, parseInt(item.quantity) || 1));
        serverTotal += verifiedPrice * qty;
        let image = item.image;
        if (opts.uploadImages && image && image.startsWith('data:')) {
            image = await uploadBase64ToCloudinary(image, user_id);
        }
        processedItems.push({ ...item, image, price: verifiedPrice, quantity: qty });
    }
    if (serverTotal <= 0) {
        return fail(400, "Invalid order total. Please try again.");
    }
    return { ok: true, serverTotal, processedItems };
};
/**
 * Popularity events (previously created at order creation).
 * Now called only once an order is confirmed PAID, so abandoned checkouts
 * don't inflate product popularity.
 */
export const recordProductOrderEvents = async (orderId, userId, processedItems) => {
    const productIds = [
        ...new Set(processedItems
            .filter((item) => !item.isCustom && item.id)
            .map((item) => Number(item.id))
            .filter((id) => Number.isInteger(id) && id > 0)),
    ];
    for (const productId of productIds) {
        await pool.query(`INSERT INTO product_order_events (product_id, order_id, user_id)
       SELECT id, $2, $3
       FROM products
       WHERE id = $1
         AND status = 'active'
       ON CONFLICT (order_id, product_id) DO NOTHING`, [productId, orderId, userId]);
    }
};
/**
 * POST /api/orders is retired: an order can no longer be created without going
 * through payment. Kept as an export so existing route imports don't break.
 * Use POST /api/payments/create instead.
 */
export const createOrder = async (_req, res) => {
    return res.status(410).json({
        error: "Orders are now created through checkout payment. Please use the Pay Now step in your bag.",
    });
};
export const getUserOrders = async (req, res) => {
    const user_id = req.user.id;
    try {
        const { rows } = await pool.query(`SELECT o.*, a.line1, a.city, a.pincode, a.label as addr_label,
        cr.tracking_url as courier_tracking_url
       FROM orders o
       LEFT JOIN addresses a ON o.address_id = a.id
       LEFT JOIN couriers cr ON cr.name = o.courier_name
       WHERE o.user_id = $1 AND o.payment_status = 'paid' ORDER BY o.created_at DESC`, [user_id]);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch orders" });
    }
};
export const getAllOrders = async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT o.*, u.email, u.name as user_name, u.phone,
        a.line1, a.line2, a.city, a.state, a.pincode, a.label as addr_label
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN addresses a ON o.address_id = a.id
      WHERE o.payment_status = 'paid'
      ORDER BY o.created_at DESC
    `);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch orders" });
    }
};
export const downloadOrder = async (req, res) => {
    const { id } = req.params;
    try {
        const orderResult = await pool.query(`
      SELECT o.*, u.name as user_name, u.email, u.phone,
        a.line1, a.line2, a.city, a.state, a.pincode, a.label as addr_label
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN addresses a ON o.address_id = a.id
      WHERE o.id = $1
    `, [id]);
        const order = orderResult.rows[0];
        if (!order)
            return res.status(404).json({ error: "Order not found" });
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        const lines = [
            `ORDER #${order.id}`,
            `Date: ${new Date(order.created_at).toLocaleString()}`,
            `Status: ${order.status}`,
            ``,
            `--- CUSTOMER ---`,
            `Name: ${order.user_name}`,
            `Email: ${order.email}`,
            `Phone: ${order.phone || 'N/A'}`,
            ``,
            `--- DELIVERY ADDRESS ---`,
            `${order.addr_label || 'Address'}`,
            `${order.line1}${order.line2 ? ', ' + order.line2 : ''}`,
            `${order.city}, ${order.state} - ${order.pincode}`,
            ``,
            `--- ITEMS ---`,
        ];
        items.forEach((item, idx) => {
            lines.push(`${idx + 1}. ${item.title}`);
            lines.push(`   Size: ${item.size || 'N/A'}`);
            lines.push(`   Qty: ${item.quantity || 1}`);
            lines.push(`   Price: Rs.${item.price}`);
            if (item.customSpecs) {
                const specs = item.customSpecs;
                lines.push(`   Layout: ${specs.layout || 'Single'}`);
                lines.push(`   Panels: ${specs.panelCount || 1}`);
                lines.push(`   Print: ${specs.printStyle || 'full-bleed'}`);
                lines.push(`   Frame: ${specs.frame || 'None'}`);
                lines.push(`   Material: ${specs.material || 'PAPER'}`);
                if (specs.material === 'METALLIC POSTER' && specs.metallicThickness) {
                    lines.push(`   Thickness: ${specs.metallicThickness}`);
                }
            }
            lines.push(``);
        });
        lines.push(`--- TOTAL: Rs.${order.total} ---`);
        res.json({
            order: {
                id: order.id,
                user_name: order.user_name,
                email: order.email,
                phone: order.phone,
                address: `${order.line1}${order.line2 ? ', ' + order.line2 : ''}, ${order.city}, ${order.state} - ${order.pincode}`,
                total: order.total,
                status: order.status,
                created_at: order.created_at,
            },
            items,
            orderDetails: lines.join('\n'),
        });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch order details" });
    }
};
// ========== ITEM TRACKING ==========
// Client cancel order
export const cancelOrder = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const result = await pool.query("SELECT id, status, user_id FROM orders WHERE id = $1", [id]);
        const order = result.rows[0];
        if (!order)
            return res.status(404).json({ error: "Order not found" });
        if (order.user_id !== userId)
            return res.status(403).json({ error: "Not authorized" });
        const nonCancellable = ['in_production', 'printed', 'ready_to_ship', 'out_for_delivery', 'delivered', 'cancelled'];
        if (nonCancellable.includes(order.status)) {
            return res.status(400).json({ error: "Order cannot be cancelled at this stage. Please contact support for assistance." });
        }
        await pool.query("UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [id]);
        await pool.query("INSERT INTO order_status_history (order_id, status, note) VALUES ($1, 'cancelled', 'Cancelled by customer')", [id]);
        res.json({ message: "Order cancelled successfully" });
    }
    catch (err) {
        console.error("Cancel order error:", err);
        res.status(500).json({ error: "Failed to cancel order" });
    }
};
export const getItemTracking = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query("SELECT item_index, downloaded, printing, completed FROM order_item_tracking WHERE order_id = $1 ORDER BY item_index", [id]);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch tracking" });
    }
};
export const updateItemTracking = async (req, res) => {
    const { id } = req.params;
    const { item_index, field, value } = req.body;
    const validFields = ['downloaded', 'printing', 'completed'];
    if (item_index == null || !validFields.includes(field)) {
        return res.status(400).json({ error: "Invalid params" });
    }
    try {
        await pool.query(`INSERT INTO order_item_tracking (order_id, item_index, ${field}, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (order_id, item_index) DO UPDATE SET ${field} = $3, updated_at = NOW()`, [id, item_index, value]);
        res.json({ message: "Updated" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to update tracking" });
    }
};
