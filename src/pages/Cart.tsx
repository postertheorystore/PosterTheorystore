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

export default function Cart() {
  const { cart, cartLoading, removeFromCart, updateQuantity, total } = useCart();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<'cart' | 'address' | 'confirm'>('cart');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [profileError, setProfileError] = useState('');

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

  const handleProceedToAddress = async () => {
      if (!user) {
      navigate('/login?redirect=/cart');
      return;
    }

    setProfileError('');
    try {
      const res = await api.get('/api/profile/check', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.data.complete) {
        const missing = res.data.missing;
        const parts = [];
        if (missing.name) parts.push('name');
        if (missing.phone) parts.push('phone number');
        if (missing.address) parts.push('delivery address');
        setProfileError(`Please complete your profile first: ${parts.join(', ')}. Go to Dashboard &rarr; Manage Profile / Addresses.`);
        return;
      }
      await fetchAddresses();
      setStep('address');
    } catch (err) {
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
            {step === 'cart' && <><span className="text-outline">Your</span>_Bag_</>}
            {step === 'address' && <>Select_<span className="text-outline">Address</span></>}
            {step === 'confirm' && <>Confirm_<span className="text-outline">Order</span></>}
          </h1>
          <p className="font-mono text-[14px] font-bold text-z-ink border-2 border-z-border px-4 py-1">[{cart.reduce((sum, i) => sum + i.quantity, 0)}] POSTERS</p>
        </header>

        {step === 'cart' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
            <div className="lg:col-span-8 space-y-12">
              {cart.map((item) => (
                <div key={item.cartItemId} className="flex flex-col sm:flex-row space-y-6 sm:space-y-0 sm:space-x-10 pb-12 border-b-2 border-z-border last:border-0 group">
                  <div className="polaroid w-40 h-52 shrink-0 group-hover:-rotate-2 transition-transform bg-z-paper">
                    <div className="tape -top-2 -left-4 w-16" />
                    <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700 font-mono" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between pt-4">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-col">
                          <h3 className="font-display font-black text-4xl uppercase tracking-tighter leading-none text-z-ink">{item.title}</h3>
                          <div className="mt-3 flex items-center flex-wrap gap-2">
                            <span className="text-[11px] font-mono font-black uppercase text-z-paper bg-z-ink px-3 py-1">SIZE: {item.size}</span>
                            <span className="text-[11px] font-mono font-bold uppercase text-z-muted">COLLECTION: {item.collection}</span>
                          </div>
                        </div>
                        <button onClick={() => removeFromCart(item.cartItemId)} className="bg-z-paper border-2 border-z-border p-3 text-z-ink hover:bg-z-ink hover:text-z-paper transition-all shadow-[4px_4px_0px_0px_var(--color-z-shadow)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {item.customSpecs && (
                       <div className="mt-4 p-4 border-2 border-dashed border-z-border bg-z-paper">
                          <span className="text-[9px] font-mono font-black uppercase text-z-muted tracking-widest">
                            SPECS: {item.customSpecs.size} / {item.customSpecs.layout || 'Single'} / {item.customSpecs.printStyle || 'full-bleed'}
                            {item.customSpecs.panelCount > 1 && ` / ${item.customSpecs.panelCount} panels`}
                            {item.customSpecs.frame && item.customSpecs.frame !== 'None' && ` / ${item.customSpecs.frame} Frame`}
                            {item.customSpecs.material && item.customSpecs.material !== 'PAPER POSTER' && ` / ${item.customSpecs.material}`}

                            {item.customSpecs.material === 'METALLIC POSTER' &&
                              item.customSpecs.metallicThickness &&
                              ` / ${item.customSpecs.metallicThickness}`}
                          </span>

                          {item.customSpecs.material === 'METALLIC POSTER' && (
                            <p className="text-[9px] font-mono text-z-muted mt-1">
                              Metal poster — Premium metal posters with a sleek finish and long-lasting durability
                            </p>
                          )}

                          {(!item.customSpecs.material || item.customSpecs.material === 'PAPER POSTER') && (
                            <p className="text-[9px] font-mono text-z-muted mt-1">
                              Art poster — High-quality paper prints with vibrant colors and sharp details
                            </p>
                          )}
                        </div>
                      )}
                      <p className="text-z-ink mt-8 font-display font-black text-2xl   tracking-tighter">&#8377;{(item.price * item.quantity).toLocaleString()}</p>
                      {item.quantity > 1 && <p className="text-[10px] font-mono text-z-muted mt-1">&#8377;{item.price.toLocaleString()} &times; {item.quantity}</p>}
                    </div>
                    <div className="flex items-center space-x-6 mt-8 sm:mt-0">
                      <label className="text-[12px] font-mono uppercase text-z-muted font-black tracking-widest">Qty:</label>
                      <div className="flex items-center border-2 border-z-border font-display font-bold text-base bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
                        <button onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)} className="px-8 py-3 hover:bg-z-ink hover:text-z-paper transition-all">-</button>
                        <span className="px-8 py-3 border-x-2 border-z-border bg-z-paper">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)} className="px-8 py-3 hover:bg-z-ink hover:text-z-paper transition-all">+</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <aside className="lg:col-span-4">
              <div className="bg-z-paper p-10 border-2 border-z-border shadow-[12px_12px_0px_0px_var(--color-z-shadow)] sticky top-40">
                <div className="flex items-center space-x-3 mb-10 pb-4 border-b-2 border-z-border">
                  <CreditCard className="w-4 h-4 text-z-ink" />
                  <h2 className="text-[14px] font-display font-black uppercase tracking-widest text-z-ink">Summary</h2>
                </div>
                <div className="space-y-3 mb-8">
                  {cart.map((item) => (
                    <div key={item.cartItemId} className="flex justify-between font-mono text-[11px] text-z-muted uppercase">
                      <span className="truncate max-w-[140px]">{item.title}</span>
                      <span className="text-z-ink font-bold whitespace-nowrap">&#8377;{item.price.toLocaleString()} &times; {item.quantity} = &#8377;{(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-6 mb-12 border-t-2 border-z-border pt-6">
                  <div className="flex justify-between font-mono text-[13px] font-bold text-z-muted uppercase">
                    <span>Subtotal:</span>
                    <span className="text-z-ink tracking-widest font-black">&#8377;{total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-mono text-[13px] font-bold text-z-muted uppercase">
                    <span>Shipping:</span>
                    <span className="text-z-ink  ">FREE</span>
                  </div>
                  <div className="border-t-2 border-z-border pt-8 flex justify-between items-baseline">
                    <span className="font-display font-black text-2xl uppercase tracking-tighter">Total:</span>
                    <span className="font-display font-black text-5xl text-z-ink tracking-tighter  ">&#8377;{total.toLocaleString()}</span>
                  </div>
                </div>

                {profileError && (
                  <div className="bg-red-50 border-2 border-red-300 p-4 text-[10px] font-mono font-bold uppercase text-red-700 mb-6">
                    {profileError}
                    <Link to="/dashboard" className="block mt-3 sticker-btn bg-z-ink text-z-paper text-center text-[10px] py-2">GO TO MANAGE PROFILE</Link>
                  </div>
                )}

                <button onClick={handleProceedToAddress} className="w-full sticker-btn py-5 text-sm bg-z-ink text-z-paper text-center">
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