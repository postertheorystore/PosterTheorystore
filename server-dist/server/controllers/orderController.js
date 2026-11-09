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
const getPromotionSize = (item) => {
    return String(item.customSpecs?.size || "").trim().toUpperCase();
};
const calculateDeliveryCharge = (subtotal, state) => {
    if (subtotal > 750)
        return 0;
    const normalizedState = state
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    return normalizedState === "tamil nadu" ? 40 : 70;
};
const isEligibleForPromotion = (item, promotion) => {
    if (item.promotionEligible !== true)
        return false;
    const category = String(item.priceCategory || "");
    if (category &&
        category !== "print_only" &&
        !(category === "framed_photo" && promotion.include_framed)) {
        return false;
    }
    const specs = item.customSpecs || {};
    const rawMaterial = String(specs.material || "")
        .trim()
        .toUpperCase();
    const material = rawMaterial.replace(/\s+POSTER$/, "");
    const frame = String(specs.frame || "None")
        .trim()
        .toLowerCase();
    const sizeId = Number(item.sizeId);
    const allowedMaterials = promotion.eligible_materials || [];
    const allowedSizes = promotion.eligible_size_ids || [];
    if (!allowedMaterials.includes(material))
        return false;
    // Empty size list means all otherwise eligible sizes.
    if (allowedSizes.length > 0 && !allowedSizes.includes(sizeId)) {
        return false;
    }
    // Preserve the previous exclusions for frame-only sizes.
    if ([7, 8].includes(sizeId) && !promotion.include_framed) {
        return false;
    }
    const isFramed = frame !== "none" && frame !== "";
    if (isFramed && !promotion.include_framed) {
        return false;
    }
    return Boolean(getPromotionSize(item));
};
const applyBuyXGetYPromotion = async (items, selections = []) => {
    const settingsResult = await pool.query(`SELECT
     buy_quantity,
     free_quantity,
     is_active,
     eligible_size_ids,
     eligible_materials,
     include_framed,
     start_date,
     end_date
   FROM promotion_settings
   WHERE id = 1`);
    const promotion = settingsResult.rows[0];
    const now = Date.now();
    const withinPromotionDates = !!promotion &&
        (!promotion.start_date || new Date(promotion.start_date).getTime() <= now) &&
        (!promotion.end_date || new Date(promotion.end_date).getTime() > now);
    if (promotion && (!promotion.is_active || !withinPromotionDates)) {
        promotion.is_active = false;
    }
    // Separate free cart rows are used by the current implementation.
    if (selections.length > 0) {
        return {
            ok: false,
            error: "Please refresh your cart and select your free posters again.",
        };
    }
    if (!promotion?.is_active) {
        const hasFreeItems = items.some((item) => item.promotionFree === true);
        if (hasFreeItems) {
            return {
                ok: false,
                error: "The promotion is currently unavailable. Please refresh your cart.",
            };
        }
        return {
            ok: true,
            processedItems: items,
            freeQuantity: 0,
            discount: 0,
        };
    }
    const buyQuantity = Number(promotion.buy_quantity);
    const freeQuantityPerTier = Number(promotion.free_quantity);
    if (!Number.isInteger(buyQuantity) ||
        buyQuantity <= 0 ||
        !Number.isInteger(freeQuantityPerTier) ||
        freeQuantityPerTier <= 0) {
        return {
            ok: false,
            error: "Invalid promotion configuration.",
        };
    }
    const bundleSize = buyQuantity + freeQuantityPerTier;
    // 1. Count original paid poster quantities by size.
    const paidQuantityBySize = new Map();
    for (const item of items) {
        if (item.promotionFree === true)
            continue;
        if (!isEligibleForPromotion(item, promotion))
            continue;
        const size = getPromotionSize(item);
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
            return {
                ok: false,
                error: "Invalid item quantity.",
            };
        }
        paidQuantityBySize.set(size, (paidQuantityBySize.get(size) || 0) + quantity);
    }
    // 2. Calculate earned free quantities independently per size.
    // 2. Calculate earned free quantities independently per size.
    const earnedFreeBySize = new Map();
    for (const [size, paidQuantity] of paidQuantityBySize) {
        const completeBundles = Math.floor(paidQuantity / bundleSize);
        const remainingQuantity = paidQuantity % bundleSize;
        const partialFree = Math.min(Math.max(remainingQuantity - buyQuantity, 0), freeQuantityPerTier);
        const earned = completeBundles * freeQuantityPerTier + partialFree;
        earnedFreeBySize.set(size, earned);
    }
    // 3. Validate manually selected free poster rows.
    const selectedFreeBySize = new Map();
    for (const item of items) {
        if (item.promotionFree !== true)
            continue;
        const size = getPromotionSize(item);
        const quantity = Number(item.quantity);
        if (!item.cartItemId ||
            !isEligibleForPromotion(item, promotion) ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            Number(item.promotionId) !== 1 ||
            String(item.promotionSize || "").trim().toUpperCase() !== size) {
            return {
                ok: false,
                error: "Invalid free poster selection. Please select your rewards again.",
            };
        }
        selectedFreeBySize.set(size, (selectedFreeBySize.get(size) || 0) + quantity);
    }
    for (const [size, selectedQuantity] of selectedFreeBySize) {
        const earnedQuantity = earnedFreeBySize.get(size) || 0;
        if (selectedQuantity > earnedQuantity) {
            return {
                ok: false,
                error: `You have selected more free posters than you earned for ${size}.`,
            };
        }
    }
    // 4. Decide how many free posters to allocate per size.
    // Manual selections replace automatic free poster allocation.
    const freeTargetBySize = new Map();
    for (const [size, earnedQuantity] of earnedFreeBySize) {
        const manuallySelected = selectedFreeBySize.get(size) || 0;
        freeTargetBySize.set(size, manuallySelected > 0 ? manuallySelected : earnedQuantity);
    }
    // 5. Allocate free quantities from the original paid poster rows.
    // Most recently added eligible designs are allocated first.
    const freeQuantityByItem = new Map();
    for (const [size, targetQuantity] of freeTargetBySize) {
        let remaining = targetQuantity;
        for (let i = items.length - 1; i >= 0 && remaining > 0; i--) {
            const item = items[i];
            if (item.promotionFree === true)
                continue;
            if (!isEligibleForPromotion(item, promotion))
                continue;
            if (getPromotionSize(item) !== size)
                continue;
            const available = Number(item.quantity);
            const allocated = Math.min(available, remaining);
            if (allocated > 0) {
                freeQuantityByItem.set(item, allocated);
                remaining -= allocated;
            }
        }
        if (remaining > 0) {
            return {
                ok: false,
                error: `Unable to allocate free posters for ${size}. Please refresh your cart.`,
            };
        }
    }
    // 6. Build final paid and free order rows.
    const processedItems = [];
    let totalFreeQuantity = 0;
    let totalDiscount = 0;
    for (const item of items) {
        const quantity = Number(item.quantity);
        // Preserve manually selected free rows.
        if (item.promotionFree === true) {
            const verifiedOriginalPrice = Number(item.price);
            if (!Number.isFinite(verifiedOriginalPrice) ||
                verifiedOriginalPrice <= 0) {
                return {
                    ok: false,
                    error: "Unable to verify the price of a selected free poster.",
                };
            }
            processedItems.push({
                ...item,
                quantity,
                price: 0,
                originalPrice: verifiedOriginalPrice,
                isFree: true,
                promotionFree: true,
                promotion: {
                    name: "Buy X Get Y Free",
                    buyQuantity,
                    freeQuantity: freeQuantityPerTier,
                },
            });
            totalFreeQuantity += quantity;
            totalDiscount += verifiedOriginalPrice * quantity;
            continue;
        }
        const allocatedFree = freeQuantityByItem.get(item) || 0;
        const paidQuantity = quantity - allocatedFree;
        // Keep the remaining paid quantity.
        if (paidQuantity > 0) {
            processedItems.push({
                ...item,
                quantity: paidQuantity,
                promotion: null,
            });
        }
        // Generate automatic free rows only when no manual selection
        // was made for this size.
        if (allocatedFree > 0) {
            const size = getPromotionSize(item);
            const hasManualSelection = (selectedFreeBySize.get(size) || 0) > 0;
            if (!hasManualSelection) {
                const verifiedOriginalPrice = Number(item.price);
                if (!Number.isFinite(verifiedOriginalPrice) ||
                    verifiedOriginalPrice <= 0) {
                    return {
                        ok: false,
                        error: "Unable to verify the price of a free poster.",
                    };
                }
                processedItems.push({
                    ...item,
                    cartItemId: `${item.cartItemId}-promotion-free`,
                    quantity: allocatedFree,
                    price: 0,
                    originalPrice: verifiedOriginalPrice,
                    promotionFree: true,
                    promotionId: 1,
                    promotionSize: size,
                    isFree: true,
                    promotion: {
                        name: "Buy X Get Y Free",
                        buyQuantity,
                        freeQuantity: freeQuantityPerTier,
                    },
                });
                totalFreeQuantity += allocatedFree;
                totalDiscount += verifiedOriginalPrice * allocatedFree;
            }
        }
    }
    return {
        ok: true,
        processedItems,
        freeQuantity: totalFreeQuantity,
        discount: totalDiscount,
    };
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
export const prepareOrder = async (user_id, items, address_id, opts = { uploadImages: true }, freeItemSelections = []) => {
    const fail = (status, error) => ({ ok: false, status, error });
    // Verify profile is complete
    const userResult = await pool.query("SELECT name, phone FROM users WHERE id = $1", [user_id]);
    const user = userResult.rows[0];
    if (!user?.name || !user?.phone) {
        return fail(400, "Please complete your profile (name and phone) before placing an order.");
    }
    // Verify address belongs to user
    const addrResult = await pool.query(`SELECT id, state
   FROM addresses
   WHERE id = $1 AND user_id = $2`, [address_id, user_id]);
    const deliveryAddress = addrResult.rows[0];
    if (!deliveryAddress?.state) {
        return fail(400, "Invalid delivery address or missing state.");
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
        // Catalogue products: verify product, selected size, layout and category price.
        if (!item.isCustom) {
            const productId = Number(item.id);
            const sizeId = Number(item.sizeId);
            const category = String(item.priceCategory || "");
            const layout = String(item.customSpecs?.layout || "Single").trim();
            const qty = Number(item.quantity);
            if (!Number.isInteger(productId) || productId <= 0 ||
                !Number.isInteger(sizeId) || sizeId <= 0 ||
                !Number.isInteger(qty) || qty < 1 || qty > 100 ||
                !["print_only", "framed_photo"].includes(category)) {
                return fail(400, "Invalid catalogue item. Please re-add it to your cart.");
            }
            const productResult = await pool.query(`
    SELECT
    p.id,
    p.title,
    s.id AS size_id,
    s.name AS size_name,
    s.frame_only,
    cp.category,
    cp.price,
    l.name AS layout_name
    FROM products p
    JOIN sizes s
      ON s.id = $2
      AND s.id = ANY(p.available_sizes)
      AND s.is_active = true
    JOIN layouts l
      ON l.name = $4
      AND l.id = ANY(p.available_layouts)
      AND l.is_active = true
    JOIN category_pricing cp
      ON cp.size_id = s.id
      AND cp.category = $3
    WHERE p.id = $1
      AND p.status = 'active'
    LIMIT 1
    `, [productId, sizeId, category, layout]);
            const verifiedProduct = productResult.rows[0];
            if (!verifiedProduct) {
                return fail(400, "This product configuration is unavailable. Please re-add it to your cart.");
            }
            const verifiedPrice = Number(verifiedProduct.price);
            if (!Number.isFinite(verifiedPrice) || verifiedPrice <= 0) {
                return fail(400, "Invalid product price. Please contact support.");
            }
            const verifiedSpecs = {
                ...(item.customSpecs || {}),
                size: verifiedProduct.size_name,
                layout: verifiedProduct.layout_name,
                material: "PAPER POSTER",
                frame: category === "framed_photo"
                    ? (item.customSpecs?.frame || "Framed")
                    : "None",
            };
            serverTotal += verifiedPrice * qty;
            processedItems.push({
                ...item,
                id: verifiedProduct.id,
                title: verifiedProduct.title,
                sizeId: verifiedProduct.size_id,
                size: verifiedProduct.size_name,
                priceCategory: verifiedProduct.category,
                customSpecs: verifiedSpecs,
                price: verifiedPrice,
                quantity: qty,
                promotionEligible: true,
            });
            continue;
        }
        const specs = item.customSpecs || {};
        const size = String(specs.size || "").trim();
        const layout = String(specs.layout || "").trim();
        const frameOption = String(specs.frame || "None").trim();
        const material = String(specs.material || "PAPER POSTER").trim().toUpperCase();
        const qty = Number(item.quantity);
        if (!size ||
            !layout ||
            !Number.isInteger(qty) ||
            qty < 1 ||
            qty > 100) {
            return fail(400, "Invalid custom product configuration.");
        }
        // Validate material against database options.
        if (!Object.prototype.hasOwnProperty.call(materialPricingMap, material)) {
            return fail(400, "Invalid poster material selected.");
        }
        // Validate frame option.
        if (!["None", "Black", "White"].includes(frameOption)) {
            return fail(400, "Invalid frame option selected.");
        }
        // Validate size, layout and exact layout price.
        const configResult = await pool.query(`
    SELECT
      s.id AS size_id,
      s.name AS size_name,
      s.frame_only,
      l.id AS layout_id,
      l.name AS layout_name,
      p.price AS base_price
    FROM sizes s
    JOIN layouts l
      ON l.name = $2
      AND l.is_active = true
    JOIN pricing p
      ON p.size_id = s.id
      AND p.layout_id = l.id
    WHERE s.name = $1
      AND s.is_active = true
    LIMIT 1
  `, [size, layout]);
        const config = configResult.rows[0];
        if (!config) {
            return fail(400, `The selected ${size} - ${layout} configuration is unavailable.`);
        }
        // Frame-only sizes must have a frame.
        if (config.frame_only && frameOption === "None") {
            return fail(400, "This size requires a frame.");
        }
        // A selected frame must be available for this size.
        let frameCost = 0;
        if (frameOption !== "None") {
            frameCost = Number(framePricingMap[size] || 0);
            if (frameCost <= 0) {
                return fail(400, "Frame is unavailable for this size.");
            }
        }
        const materialExtra = Number(materialPricingMap[material]);
        const verifiedPrice = Number(config.base_price) + frameCost + materialExtra;
        if (!Number.isFinite(verifiedPrice) || verifiedPrice <= 0) {
            return fail(400, "Unable to calculate custom product price.");
        }
        const verifiedSpecs = {
            ...specs,
            size: config.size_name,
            layout: config.layout_name,
            frame: frameOption,
            material,
        };
        const promotionEligible = true;
        let image = item.image;
        if (opts.uploadImages && image && image.startsWith("data:")) {
            image = await uploadBase64ToCloudinary(image, user_id);
        }
        serverTotal += verifiedPrice * qty;
        processedItems.push({
            ...item,
            image,
            size: config.size_name,
            sizeId: config.size_id,
            customSpecs: verifiedSpecs,
            price: verifiedPrice,
            quantity: qty,
            promotionEligible,
        });
    }
    // Apply Buy X Get Y Free after server-side item pricing.
    console.log("[PROMOTION] Before calculation:", processedItems.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        size: item.customSpecs?.size,
        material: item.customSpecs?.material,
        frame: item.customSpecs?.frame,
        category: item.priceCategory,
        promotionEligible: item.promotionEligible,
        promotionFree: item.promotionFree,
        price: item.price,
    })));
    const promotionResult = await applyBuyXGetYPromotion(processedItems, freeItemSelections);
    console.log("[PROMOTION] Result:", promotionResult);
    if (promotionResult.ok === false) {
        return fail(400, promotionResult.error);
    }
    // Recalculate payable total using the processed paid/free entries.
    const finalItems = promotionResult.processedItems;
    serverTotal = finalItems.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
    if (serverTotal <= 0) {
        return fail(400, "Invalid order total. Please try again.");
    }
    const deliveryCharge = calculateDeliveryCharge(serverTotal, deliveryAddress.state);
    return {
        ok: true,
        serverTotal,
        deliveryCharge,
        deliveryState: deliveryAddress.state,
        processedItems: finalItems,
        promotion: {
            freeQuantity: promotionResult.freeQuantity,
            discount: promotionResult.discount,
        },
    };
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
// GET /api/orders/promotion
export const getPublicPromotionSettings = async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT
      id,
      promotion_name,
      buy_quantity,
      free_quantity,
      eligible_size_ids,
      eligible_materials,
      include_framed,
      is_active,
      start_date,
      end_date
    FROM promotion_settings
    WHERE id = 1
    LIMIT 1`);
        if (!rows.length) {
            return res.status(404).json({
                error: "Promotion settings not found",
            });
        }
        return res.json({
            promotion: rows[0],
        });
    }
    catch (error) {
        console.error("Failed to fetch promotion settings:", error);
        return res.status(500).json({
            error: "Unable to fetch promotion settings",
        });
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
