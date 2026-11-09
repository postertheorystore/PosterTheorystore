const getItemSize = (item) => {
    return String(item.customSpecs?.size || item.size || "")
        .trim()
        .toUpperCase();
};
const isPromotionEligible = (item) => {
    if (item.promotionEligible !== true)
        return false;
    const material = String(item.customSpecs?.material || "")
        .trim()
        .toUpperCase();
    const frame = String(item.customSpecs?.frame || "None")
        .trim()
        .toLowerCase();
    const size = getItemSize(item);
    return (Boolean(size) &&
        (material === "PAPER" || material === "PAPER POSTER") &&
        (frame === "none" || frame === ""));
};
/**
 * Allocates paid and free quantities independently for each physical size.
 *
 * Example: Buy 5 Get 3 Free
 * Positions 1-5: paid
 * Positions 6-8: free
 * Positions 9-13: paid
 * Positions 14-16: free
 *
 * The order of items is preserved when allocating rewards.
 */
export const applyPromotionToItems = (items, promotion) => {
    if (!promotion || !promotion.is_active) {
        return {
            processedItems: items.map((item) => {
                const { promotionFree, promotionId, promotionSize, originalPrice, isFree, promotion: oldPromotion, ...cleanItem } = item;
                return cleanItem;
            }),
            freeQuantity: 0,
            discount: 0,
        };
    }
    const buyQuantity = Number(promotion.buy_quantity);
    const freeQuantityPerCycle = Number(promotion.free_quantity);
    if (!Number.isInteger(buyQuantity) ||
        buyQuantity <= 0 ||
        !Number.isInteger(freeQuantityPerCycle) ||
        freeQuantityPerCycle <= 0) {
        throw new Error("Invalid promotion configuration.");
    }
    const cycleLength = buyQuantity + freeQuantityPerCycle;
    // Each size has its own independent promotion counter.
    const sizeCounters = new Map();
    const processedItems = [];
    let totalFreeQuantity = 0;
    let totalDiscount = 0;
    for (const item of items) {
        const { promotionFree, promotionId, promotionSize, originalPrice, isFree, promotion: oldPromotion, ...cleanItem } = item;
        const quantity = Number(item.quantity);
        const price = Number(item.price);
        if (!Number.isInteger(quantity) ||
            quantity < 1 ||
            !Number.isFinite(price) ||
            price <= 0) {
            throw new Error("Invalid item quantity or price.");
        }
        // Non-eligible items remain fully paid.
        if (!isPromotionEligible(item)) {
            processedItems.push(cleanItem);
            continue;
        }
        const size = getItemSize(item);
        let currentPosition = sizeCounters.get(size) || 0;
        let paidQuantity = 0;
        let freeQuantity = 0;
        // Allocate every unit, including units added in bulk.
        for (let i = 0; i < quantity; i++) {
            const positionInCycle = currentPosition % cycleLength;
            if (positionInCycle < buyQuantity) {
                paidQuantity++;
            }
            else {
                freeQuantity++;
            }
            currentPosition++;
        }
        sizeCounters.set(size, currentPosition);
        const baseCartItemId = item.cartItemId || `item-${item.id}-${size}`;
        // Preserve the paid portion as a separate order row.
        if (paidQuantity > 0) {
            processedItems.push({
                ...cleanItem,
                cartItemId: `${baseCartItemId}-paid`,
                quantity: paidQuantity,
                price,
                promotionFree: false,
            });
        }
        // Generate a separate free order row.
        if (freeQuantity > 0) {
            processedItems.push({
                ...cleanItem,
                cartItemId: `${baseCartItemId}-free`,
                quantity: freeQuantity,
                price: 0,
                originalPrice: price,
                promotionFree: true,
                promotionId: promotion.id,
                promotionSize: size,
                isFree: true,
                promotion: {
                    name: promotion.name,
                    buyQuantity,
                    freeQuantity: freeQuantityPerCycle,
                },
            });
            totalFreeQuantity += freeQuantity;
            totalDiscount += price * freeQuantity;
        }
    }
    return {
        processedItems,
        freeQuantity: totalFreeQuantity,
        discount: totalDiscount,
    };
};
