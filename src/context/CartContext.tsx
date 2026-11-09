import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { generateThumbnail, saveImage, getImage, deleteImage, clearAllImages } from '../lib/imageDB';
import api from '../lib/api';
import { useAuth } from './AuthContext';


type PricingCategory = 'framed_photo' | 'print_only';

type PromotionSettings = {
  buy_quantity: number;
  free_quantity: number;
  is_active: boolean;
  eligible_size_ids?: number[];
  eligible_materials?: string[];
  include_framed?: boolean;
  start_date?: string | null;
  end_date?: string | null;
};

interface CartDisplayItem extends CartItem {
  displayRowId: string;
  sourceCartItemId: string;
}

interface CartItem {
  cartItemId: string;
  id: number;
  title: string;
  price: number;
  image: string;
  quantity: number;
  collection: string;
  size: string;

  // New category-based pricing fields
  priceCategory?: PricingCategory;
  sizeId?: number;

  designId?: string | number;
  customSpecs?: any;
  isCustom?: boolean;

  originalPrice?: number;
  promotionFree?: boolean;
  promotionId?: number;
  promotionSize?: string;
}

interface CartContextType {
  cart: CartItem[];
  displayCart: CartDisplayItem[];
  addToCart: (item: any) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  cartLoading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const GUEST_CART_KEY = 'guest_cart';

const getGuestCart = (): CartItem[] => {
  try {
    const saved = localStorage.getItem(GUEST_CART_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const saveGuestCart = (items: CartItem[]) => {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  } catch {}
};

const clearGuestCart = () => {
  try {
    localStorage.removeItem(GUEST_CART_KEY);
  } catch {}
};

const getPromotionSize = (item: CartItem): string =>
  String(
    item.promotionFree
      ? item.promotionSize || item.customSpecs?.size || item.size
      : item.customSpecs?.size || item.size
  )
    .trim()
    .toUpperCase();

const isPromotionCurrentlyActive = (
  promotion: PromotionSettings | null
): boolean => {
  if (!promotion?.is_active) return false;

  const now = Date.now();
  const start = promotion.start_date ? Date.parse(promotion.start_date) : NaN;
  const end = promotion.end_date ? Date.parse(promotion.end_date) : NaN;

  return !(Number.isFinite(start) && now < start) &&
    !(Number.isFinite(end) && now > end);
};

const isEligiblePaidPoster = (
  item: CartItem,
  promotion: PromotionSettings | null
): boolean => {
  if (item.promotionFree || !promotion) return false;

  const rawMaterial = String(
    item.customSpecs?.material || ''
  ).trim().toUpperCase();

  // "PAPER POSTER" becomes "PAPER".
  const material = rawMaterial.replace(/\s+POSTER$/, '');

  const frame = String(
    item.customSpecs?.frame || 'None'
  ).trim().toLowerCase();

  const sizeId = Number(item.sizeId);
  const allowedMaterials = Array.isArray(promotion.eligible_materials)
    ? promotion.eligible_materials
    : ['PAPER'];

  const allowedSizes = Array.isArray(promotion.eligible_size_ids)
    ? promotion.eligible_size_ids.map(Number)
    : [];

  const includeFramed = promotion.include_framed === true;
  const isFramed = frame !== 'none' && frame !== '';

  if (!allowedMaterials.includes(material)) return false;

  if (allowedSizes.length > 0 && !allowedSizes.includes(sizeId)) {
    return false;
  }

  if (isFramed && !includeFramed) return false;

  if ([7, 8].includes(sizeId) && !includeFramed) return false;

  // Catalogue products must be print-only, unless framed products
  // have explicitly been enabled in the promotion.
  if (
    item.priceCategory &&
    item.priceCategory !== 'print_only' &&
    !(item.priceCategory === 'framed_photo' && includeFramed)
  ) {
    return false;
  }

  return Boolean(getPromotionSize(item));
};  

const getEarnedFreeQuantity = (
  items: CartItem[],
  size: string,
  buyQuantity: number,
  freeQuantity: number,
  promotion: PromotionSettings | null
): number => {
  if (buyQuantity <= 0 || freeQuantity <= 0) return 0;

  const paidQuantity = items
    .filter(
      (item) =>
        !item.promotionFree &&
        isEligiblePaidPoster(item, promotion) &&
        getPromotionSize(item) === size
    )
    .reduce((sum, item) => sum + item.quantity, 0);

  const bundleSize = buyQuantity + freeQuantity;

  const completeBundles = Math.floor(paidQuantity / bundleSize);
  const remainingQuantity = paidQuantity % bundleSize;

  const partialFree = Math.min(
    Math.max(remainingQuantity - buyQuantity, 0),
    freeQuantity
  );

  return completeBundles * freeQuantity + partialFree;
};


const buildPromotionDisplayCart = (
  items: CartItem[],
  promotion: PromotionSettings | null
): CartDisplayItem[] => {
  const buyQuantity = promotion?.buy_quantity || 0;
  const freeQuantity = promotion?.free_quantity || 0;
  const promotionActive = isPromotionCurrentlyActive(promotion);
  // Quantity removed from paid rows.
  const paidReductionByItem = new Map<string, number>();

  // Automatically generated free display rows.
  const automaticFreeByItem = new Map<string, number>();

  if (
    promotionActive &&
    buyQuantity > 0 &&
    freeQuantity > 0
  ) {
    const itemsBySize = new Map<string, CartItem[]>();

    for (const item of items) {
      if (!isEligiblePaidPoster(item, promotion)) continue;

      const size = getPromotionSize(item);
      const group = itemsBySize.get(size) || [];

      group.push(item);
      itemsBySize.set(size, group);
    }

    for (const [size, group] of itemsBySize) {
      const totalQuantity = group.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      const bundleSize = buyQuantity + freeQuantity;

      const completeBundles = Math.floor(totalQuantity / bundleSize);
      const remainingQuantity = totalQuantity % bundleSize;

      const partialFree = Math.min(
        Math.max(remainingQuantity - buyQuantity, 0),
        freeQuantity
      );

      const automaticallyEarned =
        completeBundles * freeQuantity + partialFree;

      // Manual selections replace automatic free designs.
      const manuallySelected = items
        .filter(
          (item) =>
            item.promotionFree === true &&
            getPromotionSize(item) === size
        )
        .reduce((sum, item) => sum + item.quantity, 0);

      const targetFreeQuantity =
        manuallySelected > 0
          ? manuallySelected
          : automaticallyEarned;

      let remaining = targetFreeQuantity;

      // Allocate from the most recently added eligible design first.
      for (let i = group.length - 1; i >= 0 && remaining > 0; i--) {
        const item = group[i];

        const allocated = Math.min(
          item.quantity,
          remaining
        );

        if (allocated <= 0) continue;

        paidReductionByItem.set(item.cartItemId, allocated);

        // Generate free rows only for automatic rewards.
        if (manuallySelected === 0) {
          automaticFreeByItem.set(item.cartItemId, allocated);
        }

        remaining -= allocated;
      }
    }
  }

  return items.flatMap((item) => {
    // Preserve manually selected free rows as free.
    if (item.promotionFree === true) {
      return [{
        ...item,
        price: 0,
        originalPrice: item.originalPrice ?? item.price,
        displayRowId: `${item.cartItemId}-free`,
        sourceCartItemId: item.cartItemId,
      }];
    }

    const reducedQuantity =
      paidReductionByItem.get(item.cartItemId) || 0;

    const automaticFreeQuantity =
      automaticFreeByItem.get(item.cartItemId) || 0;

    const paidQuantity = item.quantity - reducedQuantity;

    const rows: CartDisplayItem[] = [];

    if (paidQuantity > 0) {
      rows.push({
        ...item,
        quantity: paidQuantity,
        promotionFree: false,
        displayRowId: `${item.cartItemId}-paid`,
        sourceCartItemId: item.cartItemId,
      });
    }

    if (automaticFreeQuantity > 0) {
      rows.push({
        ...item,
        quantity: automaticFreeQuantity,
        price: 0,
        originalPrice: item.originalPrice ?? item.price,
        promotionFree: true,
        displayRowId: `${item.cartItemId}-free`,
        sourceCartItemId: item.cartItemId,
      });
    }

    // Keep products with no promotion allocation visible.
    if (rows.length === 0) {
      rows.push({
        ...item,
        displayRowId: `${item.cartItemId}-paid`,
        sourceCartItemId: item.cartItemId,
      });
    }

    return rows;
  });
};


export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('guest_cart');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [cartLoading, setCartLoading] = useState(false);

  const [promotionSettings, setPromotionSettings] =
    useState<PromotionSettings | null>(null);

useEffect(() => {
  let cancelled = false;

  const loadPromotion = async () => {
    try {
      const res = await api.get('/api/orders/promotion');

      if (!cancelled) {
        setPromotionSettings(res.data.promotion);
      }
    } catch (error) {
      console.error('Failed to load promotion:', error);
    }
  };

  loadPromotion();

  return () => {
    cancelled = true;
  };
}, []);
  
  const { user, token } = useAuth();
  const prevUserId = useRef<number | null>(null);
  const syncTimeout = useRef<any>(null);
  const isInitialSyncing = useRef(false);

 useEffect(() => {
  const loadCart = async () => {
    try {
      // your existing cart loading logic
    } catch (error) {
      console.error('Failed to load cart:', error);
    } finally {
      setCartLoading(false);
    }
  };

  loadCart();
}, []);

  useEffect(() => {
  if (!user || !token) return;

  // Already synced this user
  if (prevUserId.current === user.id) return;

  prevUserId.current = user.id;
  isInitialSyncing.current = true;
  setCartLoading(true);

  const syncGuestCart = async () => {
    const guestCart = getGuestCart();

    try {
      const res = await api.get('/api/profile/cart', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const serverCart: CartItem[] = Array.isArray(res.data)
        ? res.data
        : [];

      // Keep both carts
      const mergedCart = [
        ...serverCart,
        ...guestCart,
      ];

      // Update UI
      setCart(mergedCart);

      // Save merged cart to account
      await api.post(
        '/api/profile/cart',
        { items: mergedCart },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Guest cart has successfully moved to account
      clearGuestCart();

    } catch (error) {
      console.error('Cart login sync failed:', error);

      // Never lose guest cart if API fails
      if (guestCart.length > 0) {
        setCart(guestCart);
      }
    } finally {
      isInitialSyncing.current = false;
      setCartLoading(false);
    }
  };

  syncGuestCart();
}, [user, token]);

  // Persist guest cart to localStorage
  useEffect(() => {
  if (!user && !isInitialSyncing.current) {
    saveGuestCart(cart);
  }
}, [cart, user]);

  // Load cart from server when user logs in
 

  // Sync cart to server (debounced)
 const syncToServer = useCallback((items: CartItem[]) => {
  if (!token || isInitialSyncing.current) return;

  if (syncTimeout.current) {
    clearTimeout(syncTimeout.current);
  }

  syncTimeout.current = setTimeout(() => {
    api.post(
      '/api/profile/cart',
      { items },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    ).catch((err) => {
      console.error('Cart sync failed:', err);
    });
  }, 1000);
}, [token]);

  // Save to server whenever cart changes (only if logged in)
  useEffect(() => {
    if (user && token && cart.length >= 0 && prevUserId.current === user.id) {
      syncToServer(cart);
    }
  }, [cart, user, token, syncToServer]);

  // Upload base64 image to Cloudinary via server and return the URL
  const uploadCustomImage = async (base64Image: string): Promise<string | null> => {
    if (!token) return null;
    try {
      const res = await api.post('/api/upload/design', 
        createFormDataFromBase64(base64Image),
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.url;
    } catch {
      return null;
    }
  };

  const addToCart = async (product: any) => {
    const cartItemId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let displayImage = product.image;
    let isCustom = product.isCustom || false;

    // Only upload to Cloudinary if it's a custom image (base64 from canvas)
    // Catalog product images are already Cloudinary URLs - do not re-upload
    if (isCustom && product.image && product.image.startsWith('data:') && product.image.length > 5000) {
      if (token) {
        const cloudUrl = await uploadCustomImage(product.image);
        if (cloudUrl) {
          displayImage = cloudUrl;
        } else {
          await saveImage(cartItemId, product.image);
          displayImage = await generateThumbnail(product.image);
        }
      } else {
        await saveImage(cartItemId, product.image);
        displayImage = await generateThumbnail(product.image);
      }
    }

   setCart(prev => [
  ...prev,
  {
    ...product,

    price: product.promotionFree ? 0 : product.price,
    originalPrice: product.originalPrice ?? product.price,

    image: displayImage,
    quantity: product.quantity || 1,
    cartItemId,
    isCustom,

    priceCategory: product.priceCategory,
    sizeId: product.sizeId,

    promotionFree: product.promotionFree || false,
    promotionId: product.promotionId,
    promotionSize: product.promotionSize,
  },
]);
  };

  const removeFromCart = async (cartItemId: string) => {
    try { await deleteImage(cartItemId); } catch {}
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
  if (quantity < 1) return;

  setCart((previous) => {
    const target = previous.find(
      (item) => item.cartItemId === cartItemId
    );

    if (!target) return previous;

    // Free selections are limited to the rewards already earned.
    if (target.promotionFree) {
      const size = getPromotionSize(target);

      const earned = getEarnedFreeQuantity(
        previous,
        size,
        promotionSettings?.buy_quantity || 0,
        promotionSettings?.free_quantity || 0,
        promotionSettings
      );

      const otherSelected = previous
        .filter(
          (item) =>
            item.promotionFree &&
            item.cartItemId !== cartItemId &&
            getPromotionSize(item) === size
        )
        .reduce((sum, item) => sum + item.quantity, 0);

      if (otherSelected + quantity > earned) {
        console.warn(
          `Only ${Math.max(0, earned - otherSelected)} free poster(s) are available for ${size}.`
        );
        return previous;
      }
    }

    return previous.map((item) =>
      item.cartItemId === cartItemId
        ? { ...item, quantity }
        : item
    );
  });
};
  

  const clearCart = () => {
    setCart([]);
    localStorage.removeItem('guest_cart');
    clearAllImages().catch(() => {});
    if (token) {
      api.delete('/api/profile/cart', { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  };

  const displayCart = buildPromotionDisplayCart(
  cart,
    promotionSettings
);

const total = displayCart.reduce((sum, item) => {
  return sum + item.price * item.quantity;
}, 0);

return (
  <CartContext.Provider
    value={{
      cart,
      displayCart,
      cartLoading,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      total,
    }}
  >
    {children}
  </CartContext.Provider>
);
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

// Helper: Convert base64 to FormData for upload
function createFormDataFromBase64(base64: string): FormData {
  const byteString = atob(base64.split(',')[1]);
  const mimeType = base64.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeType });
  const fd = new FormData();
  fd.append('image', blob, `custom-${Date.now()}.${mimeType.split('/')[1] || 'png'}`);
  return fd;
}

