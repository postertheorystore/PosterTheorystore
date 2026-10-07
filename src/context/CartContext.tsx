import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { generateThumbnail, saveImage, getImage, deleteImage, clearAllImages } from '../lib/imageDB';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface CartItem {
  cartItemId: string;
  id: number;
  title: string;
  price: number;
  image: string;
  quantity: number;
  collection: string;
  size: string;
  designId?: string | number;
  customSpecs?: any;
  isCustom?: boolean;
}

interface CartContextType {
  cart: CartItem[];
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

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('guest_cart');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [cartLoading, setCartLoading] = useState(false);
  
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

    setCart(prev => [...prev, { ...product, image: displayImage, quantity: product.quantity || 1, cartItemId, isCustom }]);
  };

  const removeFromCart = async (cartItemId: string) => {
    try { await deleteImage(cartItemId); } catch {}
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity < 1) return;
    setCart(prev => prev.map(item =>
      item.cartItemId === cartItemId ? { ...item, quantity } : item
    ));
  };

  const clearCart = () => {
    setCart([]);
    localStorage.removeItem('guest_cart');
    clearAllImages().catch(() => {});
    if (token) {
      api.delete('/api/profile/cart', { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart,cartLoading, addToCart, removeFromCart, updateQuantity, clearCart, total, }}>
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

