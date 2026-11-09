import React, { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Trash2, ShoppingBag, CreditCard, MapPin } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { saveCheckoutAddressId } from '../lib/checkout';

interface Address {
  id: number;
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

interface PromotionSettings {
  id: number;
  name: string;
  buy_quantity: number;
  free_quantity: number;
  eligible_category: string;
  is_active: boolean;
}
export default function Cart() {
  const { cart, cartLoading, displayCart, removeFromCart, updateQuantity, total } = useCart();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<'cart' | 'address' | 'confirm'>('cart');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [profileError, setProfileError] = useState('');


  const [promotion, setPromotion] =
  useState<PromotionSettings | null>(null);

const [promotionLoading, setPromotionLoading] =
  useState(true);

useEffect(() => {
  const fetchPromotion = async () => {
    try {
      const res = await api.get("/api/orders/promotion");
      setPromotion(res.data.promotion);
    } catch (error) {
      console.error("Failed to load promotion:", error);
      setPromotion(null);
    } finally {
      setPromotionLoading(false);
    }
  };

  fetchPromotion();
}, []);

const eligibleGroups = cart.reduce<Record<string, typeof cart>>(
  (groups, item) => {
    if (item.promotionFree === true) return groups;

    const specs = item.customSpecs || {};

    const material = String(specs.material || "")
      .trim()
      .toUpperCase();

    const frame = String(specs.frame || "None")
      .trim()
      .toLowerCase();

    const isCustomPaper =
  (material === "PAPER" || material === "PAPER POSTER") &&
  (frame === "none" || frame === "") &&
  ![7, 8].includes(Number(item.sizeId));

    const isCataloguePaper =
      item.priceCategory === "print_only" &&
      ![7, 8].includes(Number(item.sizeId));

    if (!isCustomPaper && !isCataloguePaper) return groups;

    const size = String(specs.size || item.size || "")
      .trim()
      .toUpperCase();

    if (!size) return groups;

    if (!groups[size]) groups[size] = [];
    groups[size].push(item);

    return groups;
  },
  {}
);

const promotionSummary = Object.entries(eligibleGroups).map(
  ([size, items]) => {
    const quantity = items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const bundleSize =
      (promotion?.buy_quantity || 0) +
      (promotion?.free_quantity || 0);

    let freeQuantity = 0;

if (
  promotion?.is_active &&
  promotion.buy_quantity > 0 &&
  promotion.free_quantity > 0
) {
  const buy = promotion.buy_quantity;
  const free = promotion.free_quantity;
  const bundleSize = buy + free;

  const completeBundles = Math.floor(quantity / bundleSize);
  const remainingQuantity = quantity % bundleSize;

  const partialFree = Math.min(
    Math.max(remainingQuantity - buy, 0),
    free
  );

  freeQuantity = completeBundles * free + partialFree;
}

    const addedFreeQuantity = displayCart
      .filter(item => {
        if (!item.promotionFree) return false;

        const freeSize = String(
          item.customSpecs?.size || item.size || ""
        )
          .trim()
          .toUpperCase();

        return freeSize === size;
      })
      .reduce((sum, item) => sum + item.quantity, 0);

    return {
      size,
      quantity,
      freeQuantity,
      addedFreeQuantity,
      items,
    };
  }
);

// Calculate rewards using PAID quantity only.



  const fetchAddresses = async (preferredId?: number | null) => {
    if (!token) return;
    try {
      const res = await api.get('/api/profile/addresses', { headers: { Authorization: `Bearer ${token}` } });
      setAddresses(res.data);
      const preferred = preferredId ? res.data.find((a: Address) => a.id === preferredId) : null;
      const defaultAddr = res.data.find((a: Address) => a.is_default);
      if (preferred) setSelectedAddressId(preferred.id);
      else if (defaultAddr) setSelectedAddressId(defaultAddr.id);
      else if (res.data.length > 0) setSelectedAddressId(res.data[0].id);
    } catch (err) { console.error(err); }
  };

  // Coming back from /payment ("Change address" / "Back to review"): reopen the right step.
  useEffect(() => {
    const state = location.state as { resumeStep?: 'address' | 'confirm'; addressId?: number } | null;
    if (!state?.resumeStep || !token) return;
    fetchAddresses(state.addressId).then(() => setStep(state.resumeStep === 'address' ? 'address' : 'confirm'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
  console.log(
    "POSTER THEORY CART ITEMS:",
    JSON.stringify(
      cart.map(({ image, ...item }) => item),
      null,
      2
    )
  );
}, [cart]);
const handleProceedToAddress = async () => {
  if (!user) {
    navigate('/login?redirect=/cart');
    return;
  }

  setProfileError('');

  try {
    const res = await api.get('/api/profile/check', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.data.complete) {
      const missing = res.data.missing;

      if (missing.address) {
        setProfileError(
          'No delivery address found. Please add an address to continue checkout.'
        );
        return;
      }

      const parts: string[] = [];

      if (missing.name) parts.push('name');
      if (missing.phone) parts.push('phone number');

      setProfileError(
        `Please complete your profile first: ${parts.join(', ')}.`
      );
      return;
    }

    await fetchAddresses();
    setStep('address');

  } catch (error) {
    console.error('Profile verification failed:', error);
    setProfileError('Failed to verify profile. Please try again.');
  }
};
  



  // The order is no longer created here. It is created server-side when the customer
  // presses PAY NOW on the payment page, after the amount has been re-priced on the server.
  const handleProceedToPayment = () => {
    if (!selectedAddressId) return;
    saveCheckoutAddressId(selectedAddressId);
    navigate('/payment', { state: { addressId: selectedAddressId } });
  };

  if (cartLoading) {
  return (
    <div className="pt-24 sm:pt-40 min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-z-border border-t-z-ink rounded-full animate-spin mx-auto mb-6" />

        <p className="font-mono text-[11px] font-black uppercase tracking-[0.25em] text-z-muted">
          Loading Your Bag...
        </p>
      </div>
    </div>
  );
}

  if (cart.length === 0 && step === 'cart') {
    return (
      <div className="pt-24 sm:pt-40 pb-32 min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full px-6 text-center">
          <div className="polaroid mx-auto mb-12 rotate-[-4deg] w-48">
            <div className="tape -top-4 -left-6" />
            <ShoppingBag className="w-full h-32 text-z-border p-8" />
            <p className="font-mono text-[12px] mt-4 font-bold border-t border-z-border pt-4">EMPTY BAG</p>
          </div>
          <h2 className="font-display font-black text-5xl uppercase tracking-tighter mb-4 text-z-ink">Your bag is empty.</h2>
          <p className="font-mono text-[13px] text-z-muted mb-12 uppercase font-bold tracking-widest leading-relaxed">Start your journey in our archive.</p>
          <div className="flex flex-col sm:flex-row gap-8 justify-center">
            <Link to="/collection" className="sticker-btn scale-110">Browse Posters</Link>
            <Link to="/customize" className="sticker-btn scale-110 bg-z-orange border-z-orange">Create Your Own</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 sm:pt-40 pb-32 min-h-screen px-6">
      <div className="max-w-7xl mx-auto">
       
        <header className="mb-20 border-b-4 border-z-border pb-8 flex items-baseline justify-between">
          <h1 className="font-display font-black text-6xl md:text-8xl uppercase tracking-tighter   leading-none">
            {step === 'cart' && <><span className="">Your</span>_Bag_</>}
            {step === 'address' && <>Select_<span className="">Address</span></>}
            {step === 'confirm' && <>Confirm_<span className="">Order</span></>}
          </h1>
          <p className="font-mono text-[14px] font-bold text-z-ink border-2 border-z-border px-4 py-1">[{cart.reduce((sum, i) => sum + i.quantity, 0)}] POSTERS</p>
        </header>


      {step === "cart" &&
  promotion?.is_active &&
  !promotionLoading && (
    <div className="mb-10 space-y-4">
      {promotionSummary.map((group) => {
        const bundleSize =
      promotion.buy_quantity + promotion.free_quantity;

      const completedTiers = Math.floor(
        group.quantity / bundleSize
      );

      const quantityInCurrentTier =
        group.quantity % bundleSize;

      const remainingToNextTier =
        quantityInCurrentTier === 0
          ? bundleSize
          : bundleSize - quantityInCurrentTier;

      const progress =
        group.quantity > 0 && quantityInCurrentTier === 0
          ? 100
          : (quantityInCurrentTier / bundleSize) * 100;

          const hasUnlockedReward = group.freeQuantity > 0;

        return (
          <div
            key={group.size}
            className="border-2 border-z-border bg-z-paper p-5"
          >
            <div className="flex justify-between items-center gap-4">
              <div>
                <p className="font-display font-black text-lg uppercase">
                  {promotion.name}
                </p>

                <p className="text-[10px] font-mono text-z-muted uppercase mt-1">
                  SIZE: {group.size}
                </p>
              </div>

              <span className="text-[10px] font-mono font-black uppercase border-2 border-z-border px-3 py-2">
                {group.quantity} / {bundleSize}
              </span>
            </div>

            <div className="mt-4 h-2 bg-z-border overflow-hidden">
              <div
                className="h-full bg-z-ink transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            {group.freeQuantity > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    navigate('/collection', {
                      state: {
                        promotionSelection: {
                          size: group.size,
                          promotionId: promotion.id,
                          quantity: group.freeQuantity,
                        },
                      },
                    })
                  }
                  className="mt-5 w-full sm:w-auto sticker-btn bg-z-ink text-z-paper px-6 py-3"
                >
                  CHOOSE {group.freeQuantity} FREE POSTERS
                </button>
)}

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                {hasUnlockedReward ? (
                  <>
                    <p className="font-display font-black text-xl uppercase">
                      {group.freeQuantity} FREE POSTERS UNLOCKED!
                    </p>

                    <p className="font-mono text-[10px] text-z-muted uppercase mt-1">
                      {group.addedFreeQuantity} / {group.freeQuantity} FREE POSTERS ADDED
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display font-black text-lg uppercase">
                      Add {remainingToNextTier} more posters
                    </p>

                    <p className="font-mono text-[10px] text-z-muted uppercase mt-1">
                      Unlock {promotion.free_quantity} free posters
                    </p>
                  </>
                )}
              </div>

              <span
                className={`font-mono text-xs font-black uppercase ${
                  hasUnlockedReward ? "text-green-600" : "text-z-muted"
                }`}
              >
                {hasUnlockedReward
                  ? `${completedTiers} REWARD TIER${completedTiers > 1 ? "S" : ""} UNLOCKED`
                  : "KEEP SHOPPING"}
              </span>
            </div>

            
          </div>
        );
      })}
    </div>
  )}

  {step === 'cart' && (
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">

    {/* Cart products */}
    <div className="lg:col-span-8 space-y-12">
      {cart.map((item) => (
        <div
          key={item.cartItemId}
          className="flex flex-col sm:flex-row space-y-6 sm:space-y-0 sm:space-x-10 pb-12 border-b-2 border-z-border last:border-0 group"
        >
          <div className="polaroid w-40 h-52 shrink-0 group-hover:-rotate-2 transition-transform bg-z-paper">
            <div className="tape -top-2 -left-4 w-16" />

            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 flex flex-col justify-between pt-4">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-display font-black text-4xl uppercase tracking-tighter leading-none text-z-ink">
                    {item.title}
                  </h3>

                  <div className="mt-3 flex items-center flex-wrap gap-2">
                    <span className="text-[11px] font-mono font-black uppercase text-z-paper bg-z-ink px-3 py-1">
                      SIZE: {item.size}
                    </span>

                    <span className="text-[11px] font-mono font-bold uppercase text-z-muted">
                      COLLECTION: {item.collection}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => removeFromCart(item.cartItemId)}
                  className="bg-z-paper border-2 border-z-border p-3 text-z-ink hover:bg-z-ink hover:text-z-paper transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {item.customSpecs && (
                <div className="mt-4 p-4 border-2 border-dashed border-z-border bg-z-paper">
                  <span className="text-[9px] font-mono font-black uppercase text-z-muted tracking-widest">
                    SPECS: {item.customSpecs.size} /
                    {item.customSpecs.layout || 'Single'} /
                    {item.customSpecs.printStyle || 'full-bleed'}
                    {item.customSpecs.frame &&
                      item.customSpecs.frame !== 'None' &&
                      ` / ${item.customSpecs.frame} Frame`}
                    {item.customSpecs.material &&
                      item.customSpecs.material !== 'PAPER POSTER' &&
                      ` / ${item.customSpecs.material}`}
                  </span>
                </div>
              )}

              <p className="text-z-ink mt-8 font-display font-black text-2xl tracking-tighter">
                {item.promotionFree ? (
                  <span className="text-green-600">FREE</span>
                ) : (
                  `₹${(item.price * item.quantity).toLocaleString()}`
                )}
              </p>

              {item.quantity > 1 && (
                <p className="text-[10px] font-mono text-z-muted mt-1">
                  ₹{item.price.toLocaleString()} × {item.quantity}
                </p>
              )}
            </div>

            <div className="flex items-center space-x-6 mt-8">
              <label className="text-[12px] font-mono uppercase text-z-muted font-black">
                Qty:
              </label>

              <div className="flex items-center border-2 border-z-border font-display font-bold">
                <button
                  onClick={() =>
                    updateQuantity(item.cartItemId, item.quantity - 1)
                  }
                  className="px-6 py-3 hover:bg-z-ink hover:text-z-paper"
                >
                  -
                </button>

                <span className="px-6 py-3 border-x-2 border-z-border">
                  {item.quantity}
                </span>

                <button
                  onClick={() =>
                    updateQuantity(item.cartItemId, item.quantity + 1)
                  }
                  className="px-6 py-3 hover:bg-z-ink hover:text-z-paper"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Cart summary */}
    <aside className="lg:col-span-4">
      <div className="bg-z-paper p-10 border-2 border-z-border sticky top-40">
        <h2 className="text-[14px] font-display font-black uppercase tracking-widest mb-8 border-b-2 border-z-border pb-4">
          Order Summary
        </h2>

        <div className="space-y-4 mb-8">
          {cart.map((item) => (
            <div
              key={item.cartItemId}
              className="flex justify-between font-mono text-[11px] text-z-muted uppercase"
            >
              <span>{item.title}</span>
              <span className="text-z-ink font-bold">
                ₹{(item.price * item.quantity).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t-2 border-z-border pt-6">
          <div className="flex justify-between font-mono text-sm font-bold">
            <span>Subtotal:</span>
            <span>₹{total.toLocaleString()}</span>
          </div>

          <div className="flex justify-between font-mono text-sm font-bold mt-4">
            <span>Shipping:</span>
            <span>FREE</span>
          </div>

          <div className="border-t-2 border-z-border mt-6 pt-6 flex justify-between items-baseline">
            <span className="font-display font-black text-2xl uppercase">
              Total:
            </span>

            <span className="font-display font-black text-4xl">
              ₹{total.toLocaleString()}
            </span>
          </div>
        </div>

        {profileError && (
          <p className="text-sm text-red-600 mt-4">{profileError}</p>
        )}

        <button
          onClick={handleProceedToAddress}
          className="w-full sticker-btn py-5 text-sm bg-z-ink text-z-paper mt-8"
        >
          PROCEED TO CHECKOUT
        </button>
      </div>
    </aside>
  </div>
)}

        {step === 'address' && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center space-x-4 mb-10 pb-4 border-b-2 border-z-border">
              <MapPin className="w-5 h-5" />
              <h2 className="text-[12px] font-display font-black uppercase tracking-widest">Select Delivery Address</h2>
            </div>
            {addresses.length > 0 ? (
              <div className="space-y-4 mb-12">
                {addresses.map(addr => (
                  <label key={addr.id} className={`flex items-start gap-4 p-6 border-2 cursor-pointer transition-all ${selectedAddressId === addr.id ? 'border-z-ink bg-z-paper shadow-[6px_6px_0px_0px_var(--color-z-shadow)]' : 'border-z-border hover:border-z-ink'}`}>
                    <input type="radio" name="address" checked={selectedAddressId === addr.id} onChange={() => setSelectedAddressId(addr.id)} className="mt-1 w-4 h-4" />
                    <div>
                      <span className="text-[10px] font-mono font-black uppercase bg-z-ink text-z-paper px-2 py-0.5">{addr.label}</span>
                      <p className="text-sm font-display font-bold text-z-ink mt-2">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
                      <p className="text-[11px] font-mono text-z-muted uppercase">{addr.city}, {addr.state} - {addr.pincode}</p>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-z-border mb-12">
                <p className="font-display font-black text-xl uppercase text-z-muted   mb-4">No addresses found</p>
                <Link to="/dashboard" className="sticker-btn bg-z-ink text-z-paper inline-block">Add Address in Dashboard</Link>
              </div>
            )}
            <div className="flex gap-4">
              <button onClick={() => setStep('cart')} className="px-8 py-4 border-2 border-z-border font-display font-bold uppercase hover:bg-z-ink hover:text-z-paper transition-all">Back</button>
              <button onClick={() => setStep('confirm')} disabled={!selectedAddressId} className="sticker-btn py-4 bg-z-ink text-z-paper flex-1 text-center">
                Review Order
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="max-w-2xl mx-auto">
            <div className="space-y-8">
              <div className="border-2 border-z-border p-8 bg-z-paper">
                <h3 className="text-[11px] font-mono font-black uppercase tracking-widest mb-6 border-b-2 border-z-border pb-4">Order Items ({cart.length})</h3>
                <div className="space-y-4">
                  {cart.map(item => (
                    <div key={item.cartItemId} className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <img src={item.image} alt={item.title} className="w-12 h-16 object-cover border border-z-border" />
                        <div>
                          <p className="font-display font-black text-sm uppercase">{item.title}</p>
                          <p className="text-[9px] font-mono text-z-muted uppercase">QTY: {item.quantity} &times; &#8377;{item.price.toLocaleString()}</p>
                        </div>
                      </div>
                      <p className="font-mono font-bold">&#8377;{(item.price * item.quantity).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-2 border-z-border p-8 bg-z-paper">
                <h3 className="text-[11px] font-mono font-black uppercase tracking-widest mb-4 border-b-2 border-z-border pb-4">Delivering To</h3>
                {(() => {
                  const addr = addresses.find(a => a.id === selectedAddressId);
                  return addr ? (
                    <div>
                      <span className="text-[10px] font-mono font-black uppercase bg-z-ink text-z-paper px-2 py-0.5">{addr.label}</span>
                      <p className="text-sm font-display font-bold mt-2">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
                      <p className="text-[11px] font-mono text-z-muted uppercase">{addr.city}, {addr.state} - {addr.pincode}</p>
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="border-2 border-z-ink p-8 bg-z-ink text-z-paper">
                <div className="flex justify-between items-baseline">
                  <span className="font-display font-black text-2xl uppercase">Total</span>
                  <span className="font-display font-black text-4xl  ">&#8377;{total.toLocaleString()}</span>
                </div>
              </div>

              {/* Cancellation Policy Notice */}
              <div className="border-2 border-amber-400 bg-amber-50 p-5">
                <p className="text-[11px] font-mono font-black uppercase text-amber-800 mb-2">&#9888; Cancellation Policy</p>
                <p className="text-[10px] font-mono text-amber-700 leading-relaxed">
                  You can cancel your order only before it enters production. Once the order status moves to "In Production", cancellation is no longer available. For post-production issues, please contact our support team.
                </p>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setStep('address')} className="px-8 py-4 border-2 border-z-border font-display font-bold uppercase hover:bg-z-ink hover:text-z-paper transition-all">Back</button>
                <button onClick={handleProceedToPayment} disabled={!selectedAddressId} className="sticker-btn py-4 bg-z-ink text-z-paper flex-1 text-center text-lg">
                  PROCEED TO PAYMENT
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}