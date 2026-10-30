import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { Package, Heart, ChevronRight, ArrowRight, MapPin, User, X, Plus, Star, AlertTriangle, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { Link,useLocation  } from 'react-router-dom';
import { useWishlist } from '../context/WishlistContext';
import ProductCard from '../components/ProductCard';

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

export default function Dashboard() {
  const { user, token, refreshUser } = useAuth();
  const { favourites, toggleFavourite } = useWishlist();
  const [orders, setOrders] = useState<any[]>([]);
  const [designs, setDesigns] = useState([]);
  const [wishlistProducts, setWishlistProducts] = useState<any[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [cancelModal, setCancelModal] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [couriers, setCouriers] = useState<any[]>([]);

  const location = useLocation();
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Profile panel
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Address panel
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addrForm, setAddrForm] = useState({ label: 'Home', line1: '', line2: '', city: '', state: '', pincode: '', is_default: false });
  const [addrSaving, setAddrSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        try {
          const [ordersRes, designsRes, couriersRes] = await Promise.all([
            api.get(`/api/orders/user`, { headers: { Authorization: `Bearer ${token}` } }),
            api.get(`/api/designs/user/${user.id}`, { headers: { Authorization: `Bearer ${token}` } }),
            api.get('/api/products/collections').then(() => ({ data: [] })).catch(() => ({ data: [] })),
          ]);
          setOrders(ordersRes.data);
          setDesigns(designsRes.data);
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchData();
  }, [user, token]);

  useEffect(() => {
  const fetchWishlistProducts = async () => {
    if (favourites.length === 0) {
      setWishlistProducts([]);
      return;
    }

    try {
      setWishlistLoading(true);

      const response = await api.get('/api/products');

      const products = Array.isArray(response.data)
        ? response.data
        : response.data.products || [];

      const favouriteProducts = products.filter((product: any) =>
        favourites.includes(Number(product.id))
      );

      setWishlistProducts(favouriteProducts);
    } catch (error) {
      console.error('Failed to fetch wishlist products:', error);
    } finally {
      setWishlistLoading(false);
    }
  };

  fetchWishlistProducts();
}, [favourites]);

const handleGetCurrentLocation = () => {
  if (!navigator.geolocation) {
    setLocationError('Your browser does not support location access.');
    return;
  }

  setGettingLocation(true);
  setLocationError('');

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        const { latitude, longitude } = coords;

        const response = await fetch(
  `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=en`
    );

        if (!response.ok) {
          throw new Error('Unable to retrieve your address.');
        }

        const data = await response.json();
        const address = data.address ?? {};

        const road =
          address.road ||
          address.residential ||
          address.pedestrian ||
          address.street ||
          '';

        const houseNumber = address.house_number || '';

        const line1 = [houseNumber, road].filter(Boolean).join(', ');

        const line2 = [
          address.neighbourhood ||
          address.suburb ||
          address.quarter ||
          address.hamlet ||
          '',
          address.village || address.town || '',
        ]
          .filter(Boolean)
          .filter((value, index, values) => values.indexOf(value) === index)
          .join(', ');

        const city =
          address.city ||
          address.town ||
          address.village ||
          address.municipality ||
          address.county ||
          '';

        const state = address.state || '';
        const pincode = (address.postcode || '').replace(/\D/g, '').slice(0, 6);

        setAddrForm((prev) => ({
          ...prev,
          line1: line1 || data.name || '',
          line2,
          city,
          state,
          pincode,
        }));

        if (!line1 || !city || !state || pincode.length !== 6) {
          setLocationError(
            'Some address details could not be detected. Please complete the missing fields manually.'
          );
        } else {
          setLocationError(
            'Location detected! Verify the details before saving.'
          );
        }
      } catch (error) {
        console.error('Location lookup failed:', error);
        setLocationError(
          'Could not retrieve your address. Please enter it manually.'
        );
      } finally {
        setGettingLocation(false);
      }
    },
    (error) => {
      setLocationError(
        error.code === error.PERMISSION_DENIED
          ? 'Location permission denied. Allow location access in your browser.'
          : 'Could not detect your location. Please try again or enter the address manually.'
      );
      setGettingLocation(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }
  );
};

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
    }
  }, [user]);

  const fetchAddresses = async () => {
    try {
      const res = await api.get('/api/profile/addresses', { headers: { Authorization: `Bearer ${token}` } });
      setAddresses(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
  if (location.state?.activeTab !== 'addresses' || !token) return;

  // Open Manage Profile, where the address section lives.
  setShowProfile(true);

  // Load addresses and open the form if none exist.
  const openAddressSection = async () => {
    try {
      const res = await api.get('/api/profile/addresses', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const savedAddresses = Array.isArray(res.data) ? res.data : [];
      setAddresses(savedAddresses);

      if (savedAddresses.length === 0) {
        setShowAddressForm(true);
      }

      // Clear the navigation state so it doesn't reopen unexpectedly.
      window.history.replaceState({}, document.title, location.pathname);
    } catch (error) {
      console.error('Failed to load addresses:', error);
    }
  };

  openAddressSection();
}, [location.state, location.pathname, token]);

  useEffect(() => {
    if (showProfile && token) fetchAddresses();
  }, [showProfile, token]);

  const handleProfileSave = async () => {
    if (profilePhone && (profilePhone.length !== 10 || !/^[6-9]/.test(profilePhone))) {
      setProfileMsg('Enter valid mobile number');
      return;
    }
    setProfileSaving(true);
    setProfileMsg('');
    try {
      await api.put('/api/profile', { name: profileName, phone: profilePhone }, { headers: { Authorization: `Bearer ${token}` } });
      await refreshUser();
      setProfileMsg('Profile updated!');
    } catch (err: any) {
      setProfileMsg(err.response?.data?.error || 'Update failed');
    } finally {
      setProfileSaving(false);
    }
  };

  const resetAddrForm = () => {
    setAddrForm({ label: 'Home', line1: '', line2: '', city: '', state: '', pincode: '', is_default: false });
    setEditingAddress(null);
    setShowAddressForm(false);
  };

  const handleAddressSave = async () => {
    setAddrSaving(true);
    try {
      if (editingAddress) {
        await api.put(`/api/profile/addresses/${editingAddress.id}`, addrForm, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await api.post('/api/profile/addresses', addrForm, { headers: { Authorization: `Bearer ${token}` } });
      }
      await fetchAddresses();
      resetAddrForm();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save address');
    } finally {
      setAddrSaving(false);
    }
  };

  const handleAddressDelete = async (id: number) => {
    try {
      await api.delete(`/api/profile/addresses/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      await fetchAddresses();
    } catch (err) { console.error(err); }
  };

  const startEditAddress = (addr: Address) => {
    setEditingAddress(addr);
    setAddrForm({ label: addr.label, line1: addr.line1, line2: addr.line2, city: addr.city, state: addr.state, pincode: addr.pincode, is_default: addr.is_default });
    setShowAddressForm(true);
  };

  if (loading) return (
    <div className="pt-32 text-center h-screen flex flex-col items-center justify-center space-y-6 bg-z-paper">
      <div className="w-16 h-16 border-4 border-z-border border-t-transparent rounded-full animate-spin"></div>
      <p className="font-mono font-bold text-z-ink uppercase tracking-[0.4em] text-[10px]">VERIFYING_CREDENTIALS...</p>
    </div>
  );

  return (
    <div className="pt-24 sm:pt-40 pb-32 min-h-screen">
      <div className="max-w-7xl mx-auto px-6">
        <header className="mb-20 flex flex-col md:flex-row justify-between items-end gap-10 border-b-4 border-z-border pb-12">
          <div>
            
            <h1 className="font-display font-black text-6xl sm:text-7xl uppercase tracking-tighter   leading-none text-z-ink">
              HELLO, {user?.name || user?.email.split('@')[0]}
            </h1>
          </div>
          <div className="flex gap-4">
            {user?.is_admin && (
                <Link to="/admin" className="sticker-btn bg-z-ink text-z-paper">ADMIN_TERMINAL_</Link>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-24">
           
            {/* Wishlist */}
{/* Wishlist
<section>
  <div className="flex items-center justify-between mb-10 pb-4 border-b-2 border-z-border">
    <div className="flex items-center space-x-4">
      <Heart className="w-5 h-5 text-z-ink" />
      <h2 className="section-label">WISHLIST_</h2>
    </div>

    <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-z-muted">
      {wishlistProducts.length} SAVED
    </span>
  </div>

  {wishlistLoading ? (
    <div className="border-2 border-dashed border-z-border p-12 text-center">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-z-muted">
        LOADING_COLLECTION...
      </p>
    </div>
  ) : wishlistProducts.length > 0 ? (
    <div className="grid grid-cols-5 sm:grid-cols-5 gap-6">
      {wishlistProducts.map((product: any) => (
        <ProductCard
          key={product.id}
          {...product}
        />
      ))}
    </div>
  ) : (
    <div className="bg-z-paper border-2 border-dashed border-z-border p-12 text-center">
      <Heart className="w-8 h-8 mx-auto mb-5 text-z-muted" />

      <p className="font-display font-black text-xl uppercase tracking-tighter text-z-muted   mb-6">
        WISHLIST_IS_EMPTY
      </p>

      <Link
        to="/collection"
        className="sticker-btn bg-z-ink text-white inline-block"
      >
        EXPLORE_THE_DIRECTORY_
      </Link>
    </div>
  )}
</section> */}


            {/* Orders */}
            <section>
              <div className="flex items-center space-x-4 mb-10 pb-4 border-b-2 border-z-border">
                <Package className="w-5 h-5 text-z-ink" />
                <h2 className="section-label">RECENT_CURATIONS_</h2>
              </div>
              
              {orders.length > 0 ? (
                <div className="space-y-8">
                  {orders.map((order: any) => {
                    const isExpanded = expandedOrderId === order.id;
                    const items = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items) : []);
                    const ORDER_STEPS = ['order_placed', 'verified', 'in_production', 'printed', 'ready_to_ship', 'out_for_delivery'];
                    const STEP_LABELS: Record<string, string> = { order_placed: 'Order Placed', verified: 'Verified', in_production: 'In Production', printed: 'Printed', ready_to_ship: 'Ready to Ship', out_for_delivery: 'Out for Delivery' };
                    const currentStepIdx = ORDER_STEPS.indexOf(order.status);
                    const isCancelled = order.status === 'cancelled';
                    const isDelivered = order.status === 'delivered';
                    const canCancel = !isCancelled && !isDelivered && currentStepIdx >= 0 && currentStepIdx < 2; // can cancel before in_production

                    const handleCancel = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setCancelModal(order.id);
                    };
                    
                    return (
                      <div 
                        key={order.id} 
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className={`bg-z-paper border-2 border-z-border p-8 group cursor-pointer shadow-[8px_8px_0px_0px_var(--color-z-shadow)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all relative ${isExpanded ? 'shadow-none translate-x-[4px] translate-y-[4px] border-z-ink' : ''}`}
                      >
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                          <div className="mb-6 sm:mb-0">

                            <p className="font-display font-black text-4xl text-z-ink tracking-tighter uppercase leading-none  "><span className=" ">&#8377;</span>{order.total.toLocaleString()}</p>

                          </div>
                          <div className="flex items-center space-x-8 w-full sm:w-auto justify-between sm:justify-end">
                            <span className={`px-6 py-2 border-2 text-[10px] uppercase tracking-widest font-black shadow-[4px_4px_0px_0px_var(--color-z-shadow)] ${
                              order.status === 'delivered' ? 'bg-green-100 border-green-500 text-green-700' :
                              order.status === 'cancelled' ? 'bg-red-100 border-red-500 text-red-700' :
                              'bg-amber-50 border-amber-400 text-amber-700'
                            }`}>{{
                              order_placed: 'Order Placed', verified: 'Verified', in_production: 'In Production',
                              printed: 'Printed', ready_to_ship: 'Ready to Ship', out_for_delivery: 'Out for Delivery',
                              delivered: 'Delivered', cancelled: 'Cancelled'
                            }[order.status as string] || order.status?.replace(/_/g, ' ')}</span>
                            <div className={`w-12 h-12 border-2 border-z-border flex items-center justify-center bg-z-paper group-hover:bg-z-ink group-hover:text-z-paper transition-all ${isExpanded ? 'rotate-90 bg-z-ink text-z-paper' : ''}`}>
                              <ChevronRight className="w-6 h-6" />
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-10 pt-10 border-t-2 border-z-border border-dashed overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            {/* Order Progress Roadmap */}
                            {!isCancelled && !isDelivered && (
                              <div className="mb-10">
                                <h4 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-z-ink mb-6 underline">ORDER_PROGRESS_</h4>
                                <div className="flex items-center gap-0 overflow-x-auto pb-2">
                                  {ORDER_STEPS.map((step, idx) => {
                                    const isCompleted = idx <= currentStepIdx;
                                    const isCurrent = idx === currentStepIdx;
                                    return (
                                      <React.Fragment key={step}>
                                        <div className="flex flex-col items-center min-w-[80px]">
                                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-mono font-black transition-all ${
                                            isCurrent ? 'bg-z-ink text-white border-z-ink scale-110' :
                                            isCompleted ? 'bg-green-500 text-white border-green-500' :
                                            'bg-z-paper text-z-muted border-z-border/40'
                                          }`}>
                                            {isCompleted && !isCurrent ? '✓' : idx + 1}
                                          </div>
                                          <p className={`text-[8px] font-mono font-bold uppercase mt-2 text-center leading-tight ${
                                            isCurrent ? 'text-z-ink' : isCompleted ? 'text-green-600' : 'text-z-muted'
                                          }`}>{STEP_LABELS[step]}</p>
                                        </div>
                                        {idx < ORDER_STEPS.length - 1 && (
                                          <div className={`flex-1 h-[2px] min-w-[20px] ${idx < currentStepIdx ? 'bg-green-500' : 'bg-z-border/30'}`} />
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {isDelivered && (
                              <div className="mb-8">
                                {/* Show completed roadmap */}
                                <h4 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-z-ink mb-6 underline">ORDER_PROGRESS_</h4>
                                <div className="flex items-center gap-0 overflow-x-auto pb-2 mb-6">
                                  {ORDER_STEPS.map((step, idx) => (
                                    <React.Fragment key={step}>
                                      <div className="flex flex-col items-center min-w-[80px]">
                                        <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-mono font-black bg-green-500 text-white border-green-500">
                                          ✓
                                        </div>
                                        <p className="text-[8px] font-mono font-bold uppercase mt-2 text-center leading-tight text-green-600">{STEP_LABELS[step]}</p>
                                      </div>
                                      {idx < ORDER_STEPS.length - 1 && (
                                        <div className="flex-1 h-[2px] min-w-[20px] bg-green-500" />
                                      )}
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Tracking Info */}
                            {order.courier_name && order.tracking_id && isDelivered && (
                              <div className="mb-8 p-5 border-2 border-blue-300 bg-blue-50">
                                <p className="text-[11px] font-mono font-black text-blue-800 uppercase mb-2">Your order has been shipped via {order.courier_name}</p>
                                <p className="text-[12px] font-mono font-bold text-blue-900">Tracking #: {order.tracking_id}</p>
                                <a href={order.courier_tracking_url ? order.courier_tracking_url.replace('{tracking_id}', order.tracking_id) : `https://www.google.com/search?q=${encodeURIComponent(order.courier_name)}+tracking+${encodeURIComponent(order.tracking_id)}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white text-[10px] font-mono font-black uppercase hover:bg-blue-700 transition-all active:scale-95">
                                  Track Package →
                                </a>
                              </div>
                            )}

                            {isCancelled && (
                              <div className="mb-8 p-4 border-2 border-red-300 bg-red-50 text-red-700">
                                <p className="text-[11px] font-mono font-black uppercase">This order has been cancelled.</p>
                              </div>
                            )}

                            {/* Cancel Button */}
                            {canCancel && (
                              <div className="mb-8">
                                <button onClick={handleCancel} className="px-5 py-2 border-2 border-red-400 text-red-500 text-[10px] font-mono font-black uppercase hover:bg-red-500 hover:text-white transition-all active:scale-95">
                                  Cancel Order
                                </button>
                                <p className="text-[9px] font-mono text-z-muted mt-2">Cancellation is only available before production begins.</p>
                              </div>
                            )}

                            {!canCancel && !isCancelled && !isDelivered && (
                              <div className="mb-8 p-3 border-2 border-amber-300 bg-amber-50">
                                <p className="text-[10px] font-mono font-bold text-amber-700 uppercase flex items-center gap-2">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Order cannot be cancelled at this stage. Please contact support for assistance.
                                </p>
                              </div>
                            )}

                            <h4 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-z-ink mb-6 underline">ORDERED_CONTENTS_</h4>
                            <div className="space-y-4">
                              {items.length > 0 ? items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center bg-z-paper/50 p-4 border border-z-border/50">
                                   <div className="flex items-center gap-6">
                                      <div className="w-12 h-16 bg-z-paper border border-z-border p-1">
                                        <img src={item.image} alt={item.title || item.name} className="w-full h-full object-cover" />
                                      </div>
                                      <div>
                                        <p className="font-display font-black text-[11px] uppercase tracking-tighter text-z-ink">{item.title || item.name}</p>
                                        <p className="text-[9px] font-mono uppercase tracking-widest text-z-muted font-bold">QTY: {item.quantity || 1} // COL: {item.collection || 'N/A'}</p>
                                      </div>
                                   </div>
                                   <p className="font-mono font-black text-sm text-z-ink">&#8377;{item.price.toLocaleString()}</p>
                                </div>
                              )) : (
                                <p className="font-mono text-[10px] uppercase tracking-widest text-z-muted  ">NO_ITEM_DATA_LOGGED_FOR_THIS_TRANSACTION_</p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-z-paper border-2 border-dashed border-z-border p-20 text-center">
                  <p className="font-display font-black text-2xl uppercase tracking-tighter text-z-muted   mb-8 underline underline-offset-8">ARCHIVE_IS_EMPTY</p>
                  <Link to="/collection" className="sticker-btn bg-z-ink text-white inline-block">EXPLORE_THE_DIRECTORY_</Link>
                </div>
              )}
            </section>

             {/* Profile Panel */}
            { (
              <motion.section initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-z-paper border-2 border-z-border p-10 shadow-[8px_8px_0px_0px_var(--color-z-shadow)] relative">
                
                <div className="flex items-center space-x-4 mb-8 pb-4 border-b-2 border-z-border">
                  <User className="w-5 h-5" />
                  <h2 className="section-label">MANAGE_PROFILE_</h2>
                </div>
                <div className="space-y-6 max-w-md">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">NAME</label>
                    <input value={profileName} onChange={e => setProfileName(e.target.value)} className="w-full bg-transparent border-b-2 border-z-border py-3 text-sm font-display font-bold uppercase focus:outline-none focus:border-z-ink" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">PHONE (10 DIGITS)</label>
                    <input value={profilePhone} onChange={e => setProfilePhone(e.target.value.replace(/\D/g, '').slice(0, 10))} className="w-full bg-transparent border-b-2 border-z-border py-3 text-sm font-display font-bold focus:outline-none focus:border-z-ink" placeholder="9876543210" maxLength={10} />

                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">EMAIL</label>
                    <p className="py-3 text-sm font-display font-bold uppercase text-z-muted">{user?.email}</p>
                  </div>
                  {profileMsg && <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-z-ink border-2 border-z-border px-4 py-2 inline-block">{profileMsg}</p>}
                  <button onClick={handleProfileSave} disabled={profileSaving} className="sticker-btn bg-z-ink text-white">
                    {profileSaving ? 'SAVING...' : 'SAVE_PROFILE_'}
                  </button>
                </div>

                {/* Addresses inside Profile */}
                <div className="mt-12 pt-8 border-t-2 border-z-border">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center space-x-4">
                      <MapPin className="w-5 h-5" />
                      <h2 className="section-label">ADDRESS</h2>
                    </div>
                    {!showAddressForm && (
                      <button onClick={() => { resetAddrForm(); setShowAddressForm(true); }} className="flex items-center gap-2 px-4 py-2 border-2 border-z-border font-mono text-[10px] font-bold hover:bg-z-ink hover:text-white transition-all uppercase">
                        <Plus className="w-3 h-3" /> ADD_NEW
                      </button>
                      
                    )}
                  </div>

                  {showAddressForm && (
                    <div className="mb-8 p-6 border-2 border-dashed border-z-border bg-z-paper space-y-4">
                      <button
                          type="button"
                          onClick={handleGetCurrentLocation}
                          disabled={gettingLocation}
                          className="w-full flex items-center justify-center gap-3 border-2 border-z-border px-4 py-3 font-mono text-xs font-bold uppercase hover:bg-z-ink hover:text-white transition-all disabled:opacity-50"
                        >
                          <MapPin className="w-4 h-4" />
                          {gettingLocation
                            ? 'DETECTING_LOCATION...'
                            : 'USE_MY_CURRENT_LOCATION'}
                        </button>

                        {locationError && (
                          <p className="text-xs font-mono mt-3 text-z-muted" role="status">
                            {locationError}
                          </p>
                        )}
                      <p className="text-[10px] font-mono font-black uppercase tracking-widest mb-4">{editingAddress ? 'EDIT_ADDRESS' : 'NEW_ADDRESS'}</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[9px] font-mono uppercase text-z-muted font-black block mb-1">LABEL</label>
                          <input value={addrForm.label} onChange={e => setAddrForm({ ...addrForm, label: e.target.value })} className="w-full border-b-2 border-z-border py-2 text-sm font-bold bg-transparent focus:outline-none" placeholder="Home" />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono uppercase text-z-muted font-black block mb-1">PINCODE (6 DIGITS)</label>
                          <input value={addrForm.pincode} onChange={e => setAddrForm({ ...addrForm, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="w-full border-b-2 border-z-border py-2 text-sm font-bold bg-transparent focus:outline-none" placeholder="560001" maxLength={6} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-mono uppercase text-z-muted font-black block mb-1">ADDRESS LINE 1</label>
                        <input value={addrForm.line1} onChange={e => setAddrForm({ ...addrForm, line1: e.target.value })} className="w-full border-b-2 border-z-border py-2 text-sm font-bold bg-transparent focus:outline-none" placeholder="123, Street Name" />
                      </div>
                      <div>
                        <label className="text-[9px] font-mono uppercase text-z-muted font-black block mb-1">ADDRESS LINE 2</label>
                        <input value={addrForm.line2} onChange={e => setAddrForm({ ...addrForm, line2: e.target.value })} className="w-full border-b-2 border-z-border py-2 text-sm font-bold bg-transparent focus:outline-none" placeholder="Apt, Floor (optional)" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[9px] font-mono uppercase text-z-muted font-black block mb-1">CITY</label>
                          <input value={addrForm.city} onChange={e => setAddrForm({ ...addrForm, city: e.target.value })} className="w-full border-b-2 border-z-border py-2 text-sm font-bold bg-transparent focus:outline-none" placeholder="Bangalore" />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono uppercase text-z-muted font-black block mb-1">STATE</label>
                          <input value={addrForm.state} onChange={e => setAddrForm({ ...addrForm, state: e.target.value })} className="w-full border-b-2 border-z-border py-2 text-sm font-bold bg-transparent focus:outline-none" placeholder="Karnataka" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer mt-2">
                        <input type="checkbox" checked={addrForm.is_default} onChange={e => setAddrForm({ ...addrForm, is_default: e.target.checked })} className="w-4 h-4" />
                        <span className="text-[10px] font-mono font-bold uppercase">SET_AS_DEFAULT</span>
                      </label>
                      <div className="flex gap-4 mt-4">
                        <button onClick={handleAddressSave} disabled={addrSaving} className="sticker-btn bg-z-ink text-white">{addrSaving ? 'SAVING...' : 'SAVE_ADDRESS_'}</button>
                        <button onClick={resetAddrForm} className="px-6 py-2 border-2 border-z-border font-mono text-[10px] font-bold hover:bg-z-ink hover:text-z-paper transition-all uppercase">CANCEL</button>
                      </div>
                    </div>
                  )}

                  {addresses.length > 0 ? (
                    <div className="space-y-4">
                      {addresses.map(addr => (
                        <div key={addr.id} className="flex justify-between items-start p-6 border-2 border-z-border bg-z-paper/50 hover:bg-z-paper transition-all">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-z-ink text-white px-2 py-0.5">{addr.label}</span>
                              {addr.is_default && <span className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase text-z-muted"><Star className="w-3 h-3" />DEFAULT</span>}
                            </div>
                            <p className="text-sm font-display font-bold text-z-ink">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
                            <p className="text-[11px] font-mono text-z-muted uppercase">{addr.city}, {addr.state} - {addr.pincode}</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => startEditAddress(addr)} className="px-3 py-1 border-2 border-z-border text-[9px] font-mono font-bold uppercase hover:bg-z-ink hover:text-white transition-all">EDIT</button>
                            <button onClick={() => handleAddressDelete(addr.id)} className="px-3 py-1 border-2 border-z-border text-[9px] font-mono font-bold uppercase hover:bg-red-600 hover:text-white hover:border-red-600 transition-all">DEL</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !showAddressForm ? (
                    <div className="text-center py-12 border-2 border-dashed border-z-border">
                      <p className="font-display font-black text-xl uppercase tracking-tighter text-z-muted  ">NO_ADDRESS_SAVED</p>
                      <p className="text-[10px] font-mono text-z-muted uppercase mt-2">Add an address to enable checkout</p>
                    </div>
                  ) : null}
                </div>
              </motion.section>
            )}

             {/* Designs */}
             
          </div>
          

          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-12">
            <div className="bg-z-paper p-10 border-2 border-z-border shadow-[12px_12px_0px_0px_var(--color-z-shadow)] sticky top-40 overflow-hidden">
              <h3 className="text-[12px] font-display font-black uppercase tracking-widest text-z-ink mb-12 border-b-2 border-z-border pb-2 inline-block  ">IDENTITY_FILE</h3>
              <div className="space-y-10">
                <div className="flex items-center space-x-6 pb-10 border-b-2 border-dashed border-z-border">
                   <div className="w-16 h-16 bg-z-ink border-2 border-z-border shadow-[4px_4px_0px_0px_var(--color-z-shadow)] flex items-center justify-center text-z-paper text-2xl font-display font-black  ">
                      {(user?.name || user?.email)?.[0]?.toUpperCase()}
                   </div>
                   <div>
                      <p className="text-lg font-display font-black truncate w-40 uppercase tracking-tighter text-z-ink">{user?.name || user?.email.split('@')[0]}</p>
                   </div>
                </div>
                
              </div>
            </div>

            <div className="bg-z-ink p-10 border-2 border-z-border text-z-paper relative shadow-[12px_12px_0px_0px_var(--color-z-shadow)]">
               <div className="relative z-10">
                 <h3 className="font-display font-black text-4xl uppercase tracking-tighter   mb-8 leading-none">JOIN_THE<br/><span className=" ">COLLECTIVE</span></h3>
                 <p className="text-[10px] font-mono font-bold text-z-paper/60 mb-10 leading-relaxed uppercase tracking-widest">Share the vision. Your referral provides 20% off and adds credits to your archive.</p>
                 <button className="sticker-btn bg-z-paper text-z-ink w-full font-black">GENERATE_INVITE_</button>
               </div>
               <div className="absolute -top-12 -right-12 w-48 h-48 border-2 border-white/5 rounded-full pointer-events-none" />
            </div>
          </aside>
        </div>
      </div>

      {/* Cancel Order Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setCancelModal(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-z-paper border-2 border-z-border shadow-[12px_12px_0px_0px_var(--color-z-shadow)] p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setCancelModal(null)} className="absolute top-3 right-3 w-8 h-8 bg-z-ink text-z-paper flex items-center justify-center hover:opacity-80">
              <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-red-100 border-2 border-red-400 rounded-full flex items-center justify-center mb-6">
                <XCircle className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="font-display font-black text-2xl uppercase tracking-tighter text-z-ink mb-4">Cancel Order?</h3>
              <p className="text-[11px] font-mono text-z-muted uppercase leading-relaxed mb-6">
                Are you sure you want to cancel this order? This action cannot be undone.
              </p>
              <div className="w-full border-2 border-amber-300 bg-amber-50 p-4 mb-6 text-left">
                <p className="text-[10px] font-mono font-black uppercase text-amber-800 mb-2">Refund Policy</p>
                <ul className="text-[10px] font-mono text-amber-700 leading-relaxed space-y-1 list-disc pl-4">
                  <li>Full refund will be processed within <span className="font-black">5-7 business days</span>.</li>
                  <li>Refund will be credited to your original payment method.</li>
                  <li>For any queries, contact <span className="font-black">support@postertheory.com</span></li>
                </ul>
              </div>
              <div className="flex gap-3 w-full">
                  <button onClick={() => setCancelModal(null)}
                  className="flex-1 px-6 py-3 border-2 border-z-border font-mono text-[11px] font-black uppercase hover:bg-z-ink hover:text-z-paper transition-all">
                  Keep Order
                </button>
                <button onClick={async () => {
                  setCancelling(true);
                  try {
                    await api.put(`/api/orders/${cancelModal}/cancel`, {}, { headers: { Authorization: `Bearer ${token}` } });
                    setOrders(prev => prev.map(o => o.id === cancelModal ? { ...o, status: 'cancelled' } : o));
                    setCancelModal(null);
                  } catch (err: any) {
                    setCancelModal(null);
                    // Show error inline if needed
                  }
                  setCancelling(false);
                }} disabled={cancelling}
                  className="flex-1 px-6 py-3 bg-red-500 text-white font-mono text-[11px] font-black uppercase hover:bg-red-600 transition-all disabled:opacity-50">
                  {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

