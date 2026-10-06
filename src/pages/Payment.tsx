import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Lock, MapPin, XCircle } from 'lucide-react';
import { load } from '@cashfreepayments/cashfree-js';
import CouponInput, { AppliedCoupon } from '../components/CouponInput';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { getImage } from '../lib/imageDB';
import { clearCheckoutAddressId, readCheckoutAddressId } from '../lib/checkout';

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

type Phase =
  | 'init'        // figuring out what to show
  | 'ready'       // summary + PAY NOW
  | 'paying'      // creating payment / handing off to Cashfree
  | 'verifying'   // returned from Cashfree, asking the server
  | 'processing'  // server says payment is still in flight (or we couldn't reach it)
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'invalid';

const MAX_VERIFY_POLLS = 6;
const POLL_INTERVAL_MS = 2500;
const EMPTY_CART_GRACE_MS = 1500;
const RUPEE = '\u20B9';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (n: number) => `${RUPEE}${n.toLocaleString()}`;

const Spinner = ({ label, hint }: { label: string; hint?: string }) => (
  <div className="pt-24 sm:pt-40 min-h-screen flex items-center justify-center px-6">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-z-border border-t-z-ink rounded-full animate-spin mx-auto mb-6" />
      <p className="font-mono text-[11px] font-black uppercase tracking-[0.25em] text-z-muted">{label}</p>
      {hint && <p className="font-mono text-[10px] uppercase text-z-muted mt-3">{hint}</p>}
    </div>
  </div>
);

export default function Payment() {
  const { cart, cartLoading, total, clearCart } = useCart();
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Set by Cashfree when it redirects the customer back to us.
  const returnedCfOrderId = searchParams.get('cf_order_id');

  const [addressId] = useState<number | null>(
    () => (location.state as { addressId?: number } | null)?.addressId ?? readCheckoutAddressId()
  );

  const [phase, setPhase] = useState<Phase>('init');
  const [address, setAddress] = useState<Address | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [confirmedOrderId, setConfirmedOrderId] = useState<number | null>(null);
  const [verifiedTotal, setVerifiedTotal] = useState<number | null>(null); // server-decided amount
  const [priceChanged, setPriceChanged] = useState(false);
  const [initNonce, setInitNonce] = useState(0);
  const [graceOver, setGraceOver] = useState(false);

  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  const payingRef = useRef(false);
  const verifyingRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const clearCartRef = useRef(clearCart);
  clearCartRef.current = clearCart;

  const displayTotal = verifiedTotal ?? total;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /* ---------- authentication ---------- */
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?redirect=${encodeURIComponent('/payment' + location.search)}`, { replace: true });
    }
  }, [authLoading, user, navigate, location.search]);

  /* ---------- the cart syncs from the server after login; give it a moment before calling it empty ---------- */
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => setGraceOver(true), EMPTY_CART_GRACE_MS);
    return () => clearTimeout(t);
  }, [user]);

  /* ---------- returning from Cashfree: verify on the server ---------- */
  const verifyPayment = useCallback(
    async (cfOrderId: string) => {
      setPhase('verifying');
      setErrorMsg('');

      for (let attempt = 0; attempt <= MAX_VERIFY_POLLS; attempt++) {
        try {
          const res = await api.get(
            `/api/payments/verify/${encodeURIComponent(cfOrderId)}`,
            {
                headers: {
                Authorization: `Bearer ${token}`,
                },
            }
            );
          if (!aliveRef.current) return;
          const { state, reason, order_id } = res.data as { state: string; reason?: string; order_id?: number };

          if (state === 'paid') {
            // Only now, with server-side confirmation, is the cart cleared.
            setConfirmedOrderId(order_id ?? null);
            clearCartRef.current();
            clearCheckoutAddressId();
            setPhase('success');
            return;
          }
          if (state === 'failed') {
            setFailureReason(reason || '');
            setPhase('failed');
            return;
          }
          if (state === 'cancelled') {
            setPhase('cancelled');
            return;
          }

          // 'processing': the bank hasn't settled yet (or webhook is lagging). Poll briefly.
          if (reason) setErrorMsg(reason);
          if (attempt < MAX_VERIFY_POLLS) {
            await sleep(POLL_INTERVAL_MS);
            if (!aliveRef.current) return;
            continue;
          }
          setPhase('processing');
          return;
        } catch (err: any) {
          if (!aliveRef.current) return;
          if (err.response?.status === 401) {
            navigate(`/login?redirect=${encodeURIComponent('/payment' + location.search)}`, { replace: true });
            return;
          }
          setErrorMsg(err.response?.data?.error || 'We could not confirm your payment status yet.');
          setPhase('processing');
          return;
        }
      }
    },
    [navigate, location.search, token]
  );

  useEffect(() => {
    if (authLoading || !user || !returnedCfOrderId) return;
    if (verifyingRef.current === returnedCfOrderId) return;
    verifyingRef.current = returnedCfOrderId;
    verifyPayment(returnedCfOrderId);
  }, [authLoading, user, returnedCfOrderId, verifyPayment]);

  /* ---------- normal entry: validate checkout state and load the address ---------- */
  useEffect(() => {
    if (returnedCfOrderId || authLoading || !user || cartLoading || phase !== 'init') return;

    if (cart.length === 0 || !addressId) {
      // Wait out the cart sync before declaring the bag empty.
      if (cart.length === 0 && !graceOver) return;
      setPhase('invalid');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/profile/addresses');
        if (cancelled) return;
        const found = (res.data as Address[]).find((a) => a.id === addressId) || null;
        if (!found) {
          setPhase('invalid');
          return;
        }
        setAddress(found);
        setPhase('ready');
      } catch {
        if (cancelled) return;
        setErrorMsg('We could not load your delivery address.');
        setPhase('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [returnedCfOrderId, authLoading, user, cartLoading, cart.length, addressId, phase, graceOver, initNonce]);

  /* ---------- browser Back from Cashfree can restore this page mid-"redirecting" ---------- */
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        payingRef.current = false;
        setPhase((p) => (p === 'paying' ? 'ready' : p));
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  /* ---------- PAY NOW ---------- */
  const handlePayNow = async () => {
    if (payingRef.current || !addressId || phase !== 'ready') return;
    payingRef.current = true;
    setErrorMsg('');
    setPriceChanged(false);
    setPhase('paying');

    try {
      // Same payload the old "PLACE ORDER" sent. Full-res images come from IndexedDB.
      const itemsWithFullImages = await Promise.all(
        cart.map(async (item) => {
          const fullImage = await getImage(item.cartItemId);
          return { ...item, image: fullImage || item.image };
        })
      );

      const checkoutTotal = appliedCoupon
  ? appliedCoupon.final_amount
  : total;

      const res = await api.post(
        '/api/payments/create',
        {
          total: checkoutTotal,
          items: itemsWithFullImages,
          address_id: addressId,
          coupon_code: appliedCoupon?.code || null,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = res.data;

      // This exact cart was already paid (e.g. paid in another tab): go straight to verification.
      if (data.already_paid && data.cashfree_order_id) {
        payingRef.current = false;
        await verifyPayment(data.cashfree_order_id);
        return;
      }

      // Server price differs from what the customer was shown: make them confirm the real number.
      if (Math.abs(Number(data.amount) - displayTotal) > 0.009) {
        setVerifiedTotal(Number(data.amount));
        setPriceChanged(true);
        payingRef.current = false;
        setPhase('ready');
        return;
      }

      const cashfree = await load({ mode: data.environment === 'production' ? 'production' : 'sandbox' });
      if (!cashfree) throw new Error('Payment could not be started. Please check your connection and try again.');

      // Hosted checkout: full-page redirect to Cashfree, then back to /payment?cf_order_id=...
      const result: any = await cashfree.checkout({
        paymentSessionId: data.payment_session_id,
        redirectTarget: '_self',
      });
      if (result?.error) {
        throw new Error(result.error.message || 'Payment could not be started.');
      }
      // Success path: the browser is navigating away; stay in 'paying' until it does.
    } catch (err: any) {
      if (!aliveRef.current) return;
      if (err.response?.status === 401) {
        navigate(`/login?redirect=${encodeURIComponent('/payment')}`, { replace: true });
        return;
      }
      setErrorMsg(err.response?.data?.error || err.message || 'Payment could not be started. Please try again.');
      payingRef.current = false;
      setPhase('ready');
    }
  };

  const handleRetry = () => {
    setErrorMsg('');
    setFailureReason('');
    setPriceChanged(false);
    verifyingRef.current = null;
    payingRef.current = false;
    setSearchParams({}, { replace: true });
    setPhase('init');
    setInitNonce((n) => n + 1);
  };

  const goBackToCart = (step: 'address' | 'confirm') =>
    navigate('/cart', { state: { resumeStep: step, addressId } });

  /* ------------------------------------------------------------------ */
  /* render                                                              */
  /* ------------------------------------------------------------------ */

  if (authLoading || !user || phase === 'init') {
    return <Spinner label="Preparing Checkout..." />;
  }

  if (phase === 'verifying') {
    return <Spinner label="Confirming Your Payment..." hint="Please don't close or refresh this page" />;
  }

  if (phase === 'success') {
    return (
      <div className="pt-24 sm:pt-40 pb-32 min-h-screen flex items-center justify-center">
        <div className="max-w-lg w-full px-6 text-center">
          <div className="w-20 h-20 bg-green-100 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="font-display font-black text-5xl uppercase tracking-tighter mb-4 text-z-ink">Order Confirmed!</h2>
          <p className="font-mono text-[12px] text-z-muted uppercase tracking-widest mb-2">ORDER REF: STUDIO-{confirmedOrderId}</p>
          <p className="font-mono text-[11px] text-z-muted uppercase mb-2">Payment received. Thank you!</p>
          <p className="font-mono text-[11px] text-z-muted uppercase mb-8">Your posters are being prepared for dispatch.</p>

          <div className="text-left border-2 border-amber-400 bg-amber-50 p-5 mb-10">
            <p className="text-[11px] font-mono font-black uppercase text-amber-800 mb-2">&#9888; Cancellation Policy</p>
            <ul className="text-[10px] font-mono text-amber-700 leading-relaxed space-y-1 list-disc pl-4">
              <li>You can cancel your order before it enters <span className="font-black">In Production</span>.</li>
              <li>Once production begins, cancellation is <span className="font-black">not available</span>.</li>
              <li>For post-production issues, please contact our support team.</li>
            </ul>
            <p className="text-[10px] font-mono text-amber-700 mt-3">Support: <span className="font-black">support@postertheory.com</span></p>
          </div>

          <div className="flex gap-4 justify-center">
            <Link to="/dashboard" className="sticker-btn bg-z-ink text-z-paper">View Orders</Link>
            <Link to="/collection" className="sticker-btn">Continue Shopping</Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'failed' || phase === 'cancelled' || phase === 'processing' || phase === 'invalid') {
    const cfg = {
      failed: {
        icon: <XCircle className="w-10 h-10 text-red-600" />,
        ring: 'bg-red-100 border-red-500',
        title: 'Payment Failed',
        body: failureReason || 'Your payment could not be completed. You have not been charged for this order.',
      },
      cancelled: {
        icon: <AlertTriangle className="w-10 h-10 text-amber-600" />,
        ring: 'bg-amber-100 border-amber-500',
        title: 'Payment Not Completed',
        body: 'You left the payment window before paying. No money was taken and your bag is safe.',
      },
      processing: {
        icon: <AlertTriangle className="w-10 h-10 text-amber-600" />,
        ring: 'bg-amber-100 border-amber-500',
        title: 'Still Processing',
        body:
          errorMsg ||
          "We haven't received final confirmation from the bank yet. If money was deducted, your order will be confirmed automatically. You can check again in a moment.",
      },
      invalid: {
        icon: <AlertTriangle className="w-10 h-10 text-amber-600" />,
        ring: 'bg-amber-100 border-amber-500',
        title: 'Nothing To Pay',
        body:
          errorMsg ||
          'Your bag is empty or no delivery address was selected. Head back to your bag to continue checkout.',
      },
    }[phase];

    return (
      <div className="pt-24 sm:pt-40 pb-32 min-h-screen flex items-center justify-center">
        <div className="max-w-lg w-full px-6 text-center">
          <div className={`w-20 h-20 border-2 rounded-full flex items-center justify-center mx-auto mb-8 ${cfg.ring}`}>
            {cfg.icon}
          </div>
          <h2 className="font-display font-black text-5xl uppercase tracking-tighter mb-4 text-z-ink">{cfg.title}</h2>
          <p className="font-mono text-[11px] text-z-muted uppercase leading-relaxed mb-10">{cfg.body}</p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {(phase === 'failed' || phase === 'cancelled') && (
              <button onClick={handleRetry} className="sticker-btn bg-z-ink text-z-paper">Try Again</button>
            )}
            {phase === 'processing' && returnedCfOrderId && (
              <button
                onClick={() => {
                  verifyingRef.current = returnedCfOrderId;
                  verifyPayment(returnedCfOrderId);
                }}
                className="sticker-btn bg-z-ink text-z-paper"
              >
                Check Again
              </button>
            )}
            {phase === 'processing' && (
              <Link to="/dashboard" className="sticker-btn">View Orders</Link>
            )}
            {phase !== 'processing' && <Link to="/cart" className="sticker-btn">Back To Bag</Link>}
          </div>
        </div>
      </div>
    );
  }

  // phase === 'ready' | 'paying'
  const paying = phase === 'paying';

  return (
    <div className="pt-24 sm:pt-40 pb-32 min-h-screen px-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-20 border-b-4 border-z-border pb-8 flex items-baseline justify-between">
          <h1 className="font-display font-black text-6xl md:text-8xl uppercase tracking-tighter leading-none">
            Secure_<span className="text-outline">Payment</span>
          </h1>
          <p className="font-mono text-[14px] font-bold text-z-ink border-2 border-z-border px-4 py-1">
            [{cart.reduce((sum, i) => sum + i.quantity, 0)}] POSTERS
          </p>


        </header>

        <div className="border-2 border-z-border p-8 bg-z-paper">
          <div className="border-b-2 border-z-border pb-4 mb-6">
            <h3 className="text-[11px] font-mono font-black uppercase tracking-widest">
              Discount Code
            </h3>
          </div>

          <CouponInput
            items={cart}
            addressId={addressId}
            applied={appliedCoupon}
            onChange={(coupon) => {
              setAppliedCoupon(coupon);
              setVerifiedTotal(null);
              setPriceChanged(false);
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
          {/* ---------------- left: order summary + address ---------------- */}
          <div className="lg:col-span-8 space-y-8">
            <div className="border-2 border-z-border p-8 bg-z-paper">
              <h3 className="text-[11px] font-mono font-black uppercase tracking-widest mb-6 border-b-2 border-z-border pb-4">
                Order Summary ({cart.length})
              </h3>

              <div className="space-y-8">
                {cart.map((item) => {
                  const specs = item.customSpecs || {};
                  const size = specs.size || item.size;
                  const isMetal = specs.material === 'METALLIC POSTER';
                  const chips: string[] = [];
                  if (size) chips.push(`SIZE: ${size}`);
                  if (item.customSpecs) {
                    chips.push(`LAYOUT: ${specs.layout || 'Single'}`);
                    chips.push(`FRAME: ${specs.frame && specs.frame !== 'None' ? specs.frame : 'None'}`);
                    chips.push(`MATERIAL: ${specs.material || 'PAPER POSTER'}`);
                    if (isMetal && specs.metallicThickness) chips.push(`THICKNESS: ${specs.metallicThickness}`);
                  } else if (item.collection) {
                    chips.push(`COLLECTION: ${item.collection}`);
                  }

                  return (
                    <div
                      key={item.cartItemId}
                      className="flex flex-col sm:flex-row gap-6 pb-8 border-b-2 border-z-border last:border-0 last:pb-0"
                    >
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-24 h-32 object-cover border-2 border-z-border shrink-0"
                      />
                      <div className="flex-1">
                        <h4 className="font-display font-black text-2xl uppercase tracking-tighter leading-none text-z-ink">
                          {item.title}
                        </h4>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {chips.map((c, i) => (
                            <span
                              key={c}
                              className={`text-[10px] font-mono font-black uppercase px-2 py-1 ${
                                i === 0 ? 'bg-z-ink text-z-paper' : 'border border-z-border text-z-muted'
                              }`}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] font-mono text-z-muted uppercase mt-3">
                          QTY: {item.quantity} &times; {money(item.price)}
                        </p>
                      </div>
                      <p className="font-display font-black text-2xl tracking-tighter text-z-ink sm:text-right">
                        {money(item.price * item.quantity)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-10 border-t-2 border-z-border pt-6 space-y-4">

                    <div className="flex justify-between font-mono text-[13px] font-bold text-z-muted uppercase">
                      <span>Subtotal:</span>
                      <span className="text-z-ink font-black">{money(total)}</span>
                    </div>

                    <div className="flex justify-between font-mono text-[13px] font-bold text-z-muted uppercase">
                      <span>Shipping:</span>
                      <span className="text-z-ink">
                        {appliedCoupon?.free_shipping ? 'FREE — COUPON' : 'FREE'}
                      </span>
                    </div>

                    {appliedCoupon && (
                      <div className="flex justify-between font-mono text-[13px] font-bold uppercase">
                        <span className="text-z-muted">
                          Coupon ({appliedCoupon.code}):
                        </span>
                        <span className="text-green-600">
                          -{money(appliedCoupon.discount)}
                        </span>
                      </div>
                    )}

                    <div className="border-t-2 border-z-border pt-4 flex justify-between items-baseline">
                      <span className="font-display font-black text-xl uppercase tracking-tighter">
                        Total:
                      </span>

                      <span className="font-display font-black text-3xl tracking-tighter text-z-ink">
                        {money(appliedCoupon ? appliedCoupon.final_amount : displayTotal)}
                      </span>
                    </div>
                  </div>                                  
            </div>

            <div className="border-2 border-z-border p-8 bg-z-paper">
              <div className="flex items-center justify-between mb-4 border-b-2 border-z-border pb-4">
                <h3 className="text-[11px] font-mono font-black uppercase tracking-widest flex items-center gap-3">
                  <MapPin className="w-4 h-4" /> Delivering To
                </h3>
                <button
                  onClick={() => goBackToCart('address')}
                  disabled={paying}
                  className="text-[10px] font-mono font-black uppercase underline underline-offset-4 hover:text-z-muted disabled:opacity-50"
                >
                  Change Address
                </button>
              </div>
              {address && (
                <div>
                  <span className="text-[10px] font-mono font-black uppercase bg-z-ink text-z-paper px-2 py-0.5">
                    {address.label}
                  </span>
                  <p className="text-sm font-display font-bold mt-2">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}
                  </p>
                  <p className="text-[11px] font-mono text-z-muted uppercase">
                    {address.city}, {address.state} - {address.pincode}
                  </p>
                </div>
              )}
            </div>

            <div className="border-2 border-amber-400 bg-amber-50 p-5">
              <p className="text-[11px] font-mono font-black uppercase text-amber-800 mb-2">&#9888; Cancellation Policy</p>
              <p className="text-[10px] font-mono text-amber-700 leading-relaxed">
                You can cancel your order only before it enters production. Once the order status moves to "In
                Production", cancellation is no longer available. For post-production issues, please contact our support team.
              </p>
            </div>

            <button
              onClick={() => goBackToCart('confirm')}
              disabled={paying}
              className="px-8 py-4 border-2 border-z-border font-display font-bold uppercase hover:bg-z-ink hover:text-z-paper transition-all disabled:opacity-50"
            >
              Back To Review
            </button>
          </div>

          {/* ---------------- right: payment ---------------- */}
          <aside className="lg:col-span-4">
            <div className="bg-z-paper p-10 border-2 border-z-border shadow-[12px_12px_0px_0px_var(--color-z-shadow)] sticky top-40">
              <div className="flex items-center space-x-3 mb-4 pb-4 border-b-2 border-z-border">
                <Lock className="w-4 h-4 text-z-ink" />
                <h2 className="text-[14px] font-display font-black uppercase tracking-widest text-z-ink">Payment</h2>
              </div>
              <p className="font-mono text-[11px] font-bold uppercase text-z-muted mb-10">
                Secure checkout powered by Cashfree
              </p>

              <div className="border-t-2 border-z-border pt-8 mb-10 flex justify-between items-baseline">
                <span className="font-display font-black text-2xl uppercase tracking-tighter">Total:</span>
                <span className="font-display font-black text-5xl text-z-ink tracking-tighter">{money(displayTotal)}</span>
              </div>

              {priceChanged && (
                <div className="bg-amber-50 border-2 border-amber-400 p-4 text-[10px] font-mono font-bold uppercase text-amber-800 mb-6">
                  Prices were updated. The total above is the amount you will be charged. Press Pay Now to continue.
                </div>
              )}

              {errorMsg && (
                <div className="bg-red-50 border-2 border-red-300 p-4 text-[10px] font-mono font-bold uppercase text-red-700 mb-6">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handlePayNow}
                disabled={paying}
                className="w-full sticker-btn py-5 text-sm bg-z-ink text-z-paper text-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {paying ? 'REDIRECTING TO CASHFREE...' : 'PAY NOW'}
              </button>

              <p className="mt-6 text-center text-[9px] font-mono uppercase text-z-muted leading-relaxed">
                You will be taken to Cashfree to complete payment. Your order is confirmed only after payment is verified.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}