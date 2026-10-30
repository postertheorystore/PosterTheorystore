import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, ShoppingBag, User, Menu, X, ChevronDown, LogOut, LayoutDashboard, UserCircle, Heart } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Logo from "./Logo";
import GlitchText from "./GlitchText";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";

/* =========================================================
   TYPES
========================================================= */

interface Collection {
  name: string;
  path: string;
  img?: string;
  is_active?: boolean;
}

interface WishlistProduct {
  id: number;
  title: string;
  image: string;
  price?: number;
  collection?: string;
}

interface NavbarProps {
  cartCount?: number;
}

// fallback so the nav never renders empty while the real list loads / if the request fails
const TEMP_COLLECTIONS: Collection[] = [
  { name: "Anime", path: "/collection?collection=Anime" },
  { name: "Movies", path: "/collection?collection=Movies" },
  { name: "Music", path: "/collection?collection=Music" },
  { name: "Minimal", path: "/collection?collection=Minimal" },
  { name: "Typography", path: "/collection?collection=Typography" },
];

const MENU_ITEMS = [
  { name: "Frames", path: "/frames" },
  { name: "Split Posters", path: "/split-posters" },
  { name: "Metalic Posters", path: "/metalic-posters" },
  { name: "Customize", path: "/customize" },
  { name: "Buy in Bulk", path: "/bulk-inquiry" },
  { name: "Reviews", path: "/reviews" },
];

const HELP_ITEMS: [string, string][] = [
  ["Terms & Conditions", "/help#terms"],
  ["Privacy Policy", "/help#privacy"],
  ["Shipping Policy", "/help#shipping-policy"],
  ["Return & Refund Policy", "/help#return-policy"],
  ["Cancellation Policy", "/help#cancellation"],
];

// ⚠️ change this if your product page route is different
const productPath = (id: number | string) => `/product/${id}`;

/* =========================================================
   PRODUCT LIST CACHE
   The wishlist panel needs product details for the saved ids. The list is
   fetched once and shared (60s TTL) so hovering never spams the API.
========================================================= */
let productsCache: { at: number; data: any[] } | null = null;
let productsInflight: Promise<any[]> | null = null;

const fetchAllProducts = async (force = false): Promise<any[]> => {
  if (!force && productsCache && Date.now() - productsCache.at < 60_000) return productsCache.data;
  if (productsInflight) return productsInflight;

  productsInflight = api
    .get("/api/products")
    .then((res) => {
      const data = Array.isArray(res.data) ? res.data : res.data?.products || [];
      productsCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      productsInflight = null;
    });

  return productsInflight;
};

const normalizeProduct = (p: any): WishlistProduct => ({
  id: Number(p.id),
  title: p.title || p.name || "Untitled",
  image: p.image || p.img || p.images?.[0] || "",
  price: typeof p.price === "number" ? p.price : Number(p.price) || undefined,
  collection: p.collection,
});

export default function Navbar({ cartCount = 0 }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [collections, setCollections] = useState<Collection[]>(TEMP_COLLECTIONS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);

  // wishlist panel data
  const { favourites, toggleFavourite } = useWishlist();
  const [wishlistProducts, setWishlistProducts] = useState<WishlistProduct[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  /* =========================================================
     AUTH — comes from AuthContext (single source of truth).
     Because the login page updates the same context, the navbar
     switches from "Login" to "Profile" instantly, no refresh needed.
  ========================================================= */
  const auth = useAuth() as any;
  const user = auth?.user ?? null;
  const authLoading: boolean = Boolean(auth?.loading ?? auth?.isLoading ?? false);
  const isAdmin = Boolean(user?.is_admin) || user?.role === "admin";

  const searchRef = useRef<HTMLInputElement>(null);
  const collectionsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const wishlistRef = useRef<HTMLDivElement>(null);
  const wishlistCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerType = useRef<string>("mouse");

  const navigate = useNavigate();
  const location = useLocation();

  /* =========================================================
     COLLECTIONS — pulled from the backend
  ========================================================= */
  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/products/collections")
      .then((res) => {
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : [];
        if (data.length === 0) return; // keep fallback rather than rendering an empty nav
        setCollections(
          data.map((c: any) => ({
            name: c.name,
            path: `/collection?collection=${encodeURIComponent(c.name)}`,
            is_active: c.is_active,
          }))
        );
      })
      .catch((err) => {
        console.error("Failed to fetch collections:", err);
        // TEMP_COLLECTIONS stays as the fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================
     WISHLIST — resolve saved ids to products
     The badge uses favourites.length (instant). Product details are
     only fetched when there is an id we don't already have.
  ========================================================= */
  const favouriteKey = useMemo(() => [...favourites].map(Number).sort((a, b) => a - b).join(","), [favourites]);

  useEffect(() => {
    if (favourites.length === 0) {
      setWishlistProducts([]);
      return;
    }

    let cancelled = false;
    const ids = favourites.map(Number);

    const resolve = (all: any[]) => {
      const byId = new Map(all.map((p) => [Number(p.id), p]));
      // keep the order the user saved them in
      return ids.filter((id) => byId.has(id)).map((id) => normalizeProduct(byId.get(id)));
    };

    // show whatever we already know instantly (no spinner when removing an item)
    if (productsCache) {
      setWishlistProducts(resolve(productsCache.data));
      const missing = ids.some((id) => !productsCache!.data.some((p) => Number(p.id) === id));
      if (!missing) return;
    }

    setWishlistLoading(true);
    fetchAllProducts(Boolean(productsCache))
      .then((all) => {
        if (!cancelled) setWishlistProducts(resolve(all));
      })
      .catch((err) => console.error("Failed to fetch wishlist products:", err))
      .finally(() => {
        if (!cancelled) setWishlistLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favouriteKey]);

  /* ---- wishlist hover helpers (small delay so the pointer can cross the gap) ---- */
  const cancelWishlistClose = () => {
    if (wishlistCloseTimer.current) {
      clearTimeout(wishlistCloseTimer.current);
      wishlistCloseTimer.current = null;
    }
  };

  const openWishlist = () => {
    cancelWishlistClose();
    setWishlistOpen(true);
    setUserMenuOpen(false);
    setCollectionsOpen(false);
    setAboutOpen(false);
  };

  const scheduleWishlistClose = () => {
    cancelWishlistClose();
    wishlistCloseTimer.current = setTimeout(() => setWishlistOpen(false), 160);
  };

  useEffect(() => cancelWishlistClose, []);

  /* =========================================================
     LOGOUT
  ========================================================= */
  const handleLogout = useCallback(() => {
    const confirmed = window.confirm("Are you sure you want to logout?");
    if (!confirmed) return;

    setUserMenuOpen(false);
    setMobileOpen(false);

    if (typeof auth?.logout === "function") {
      // AuthContext clears token + user -> navbar updates immediately
      auth.logout();
      navigate("/");
    } else {
      // fallback if the context has no logout(): clear token and hard reload
      localStorage.removeItem("token");
      window.location.assign("/");
    }
  }, [auth, navigate]);

  /* =========================================================
     SCROLL STATE
  ========================================================= */
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [searchOpen]);

  /* =========================================================
     CLOSE EVERYTHING ON ROUTE CHANGE
  ========================================================= */
  useEffect(() => {
    setMobileOpen(false);
    setCollectionsOpen(false);
    setUserMenuOpen(false);
    setAboutOpen(false);
    setWishlistOpen(false);
  }, [location.pathname, location.search]);

  // lock body scroll while the mobile menu is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  /* =========================================================
     CLICK OUTSIDE + ESCAPE — closes whichever dropdown is open
  ========================================================= */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (collectionsRef.current && !collectionsRef.current.contains(target)) setCollectionsOpen(false);
      if (userRef.current && !userRef.current.contains(target)) setUserMenuOpen(false);
      if (aboutRef.current && !aboutRef.current.contains(target)) setAboutOpen(false);
      if (wishlistRef.current && !wishlistRef.current.contains(target)) setWishlistOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setCollectionsOpen(false);
      setUserMenuOpen(false);
      setAboutOpen(false);
      setWishlistOpen(false);
      setSearchOpen(false);
      setMobileOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const activeCollections = collections.filter((c) => c.is_active !== false);
  const wishlistCount = favourites.length;

  // shared dropdown entrance — brutalist: quick, hard snap rather than a soft ease
  const dropdownMotion = {
    initial: { opacity: 0, y: 8, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.98 },
    transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const },
  };

  // wishlist panel drops in from the top edge instead of rising from below
  const wishlistMotion = {
    initial: { opacity: 0, y: -14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -14 },
    transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
  };

  // shared classes for every flat, sharp-edged dropdown row (collections + user menu)
  const dropdownRow = "group/item flex items-center justify-between gap-2 px-4 py-3 border-l-2 border-transparent text-[10px] font-mono font-bold uppercase tracking-widest text-white/60 hover:text-white hover:border-white hover:bg-white/5 transition-all";

  const mobileRow = "block py-3 text-[11px] font-mono font-bold uppercase tracking-widest text-white/70 hover:text-white";

  return (
    <>
      <header className={`fixed border-dashed border-b border-white top-0 left-0 right-0 z-[100] transition-all duration-300 ${scrolled ? "bg-black/95 backdrop-blur-xl border-b-0" : "bg-black "}`}>
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 ">
          <div className="h-[80px] flex items-center justify-between relative">
            {/* LEFT — LOGO */}
            <div className="flex items-center shrink-0">
              <Link to="/" className="block hover:opacity-80 transition-opacity">
                <Logo size="nav" />
              </Link>
            </div>

            {/* CENTER — DESKTOP MENU */}
            <nav className="hidden xl:flex items-center justify-center gap-5 2xl:gap-7 absolute left-1/2 -translate-x-1/2">
              {/* COLLECTIONS DROPDOWN */}
              <div ref={collectionsRef} className="relative" onMouseEnter={() => setHoveredNav("collections")} onMouseLeave={() => setHoveredNav(null)}>
                <button onClick={() => setCollectionsOpen((v) => !v)} aria-haspopup="true" aria-expanded={collectionsOpen} className="relative flex items-center gap-1 py-2 text-[10px] 2xl:text-[11px] font-mono font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors whitespace-nowrap">
                  Collections
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${collectionsOpen ? "rotate-180" : ""}`} />
                  {hoveredNav === "collections" && <motion.span layoutId="nav-hover-underline" className="absolute left-0 right-0 -bottom-1 h-[2px] bg-white" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                </button>

                <AnimatePresence>
                  {collectionsOpen && (
                    <motion.div {...dropdownMotion} className="absolute top-full left-1/2 -translate-x-1/2 mt-5 w-52 bg-black border-2 border-white/15 shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)] p-2">
                      <Link to={"/collection"} onClick={() => setCollectionsOpen(false)} className={dropdownRow}>
                        <span className="group-hover/item:translate-x-1 transition-transform">All Collections</span>
                        <span className="opacity-0 -translate-x-1 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all">→</span>
                      </Link>
                      {activeCollections.map((collection, i) => (
                        <motion.div key={collection.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03, duration: 0.15 }}>
                          <Link to={collection.path} onClick={() => setCollectionsOpen(false)} className={dropdownRow}>
                            <span className="group-hover/item:translate-x-1 transition-transform">{collection.name}</span>
                            <span className="opacity-0 -translate-x-1 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all">→</span>
                          </Link>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* MAIN LINKS — shared sliding underline on hover. "Customize" gets the
                  neon glitch treatment so it stands out against the black & white site. */}
              {MENU_ITEMS.map((item) => (
                <div key={item.name} className="relative" onMouseEnter={() => setHoveredNav(item.name)} onMouseLeave={() => setHoveredNav(null)}>
                  <Link to={item.path} className="relative block py-2 text-[10px] 2xl:text-[11px] font-mono font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors whitespace-nowrap">
                    {item.name === "Customize" ? (
                      <GlitchText text={item.name} as="span" ambient />
                    ) : (
                      item.name
                    )}
                    {hoveredNav === item.name && <motion.span layoutId="nav-hover-underline" className="absolute left-0 right-0 -bottom-1 h-[2px] bg-white" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                  </Link>
                </div>
              ))}

              {/* HELP CENTER DROPDOWN */}
              <div ref={aboutRef} className="relative">
                <button onClick={() => setAboutOpen((v) => !v)} aria-haspopup="true" aria-expanded={aboutOpen} className="relative flex items-center gap-1 py-2 text-[10px] 2xl:text-[11px] whitespace-nowrap font-mono font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors">
                  HELP CENTER
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${aboutOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {aboutOpen && (
                    <motion.div {...dropdownMotion} className="absolute top-full left-1/2 -translate-x-1/2 mt-5 w-64 bg-black border-2 border-white/15 shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)] p-2">
                      <Link to="/help#about" onClick={() => setAboutOpen(false)} className={dropdownRow}>
                        <span>About Poster Theory</span>
                      </Link>

                      <div className="my-1 border-t border-white/10" />

                      {HELP_ITEMS.map(([name, path]) => (
                        <Link key={name} to={path} onClick={() => setAboutOpen(false)} className={dropdownRow}>
                          <span>{name}</span>
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </nav>

            {/* RIGHT — ACTIONS */}
            <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
              {/* SEARCH */}
              <motion.div layout className="flex items-center">
                <AnimatePresence mode="wait">
                  {searchOpen ? (
                    <motion.div initial={{ width: 40, opacity: 0 }} animate={{ width: 190, opacity: 1 }} exit={{ width: 40, opacity: 0 }} transition={{ duration: 0.25 }} className="h-9 flex items-center border border-white/20 bg-white/5">
                      <Search className="w-4 h-4 text-white/50 ml-3 shrink-0" />
                      <input ref={searchRef} type="text" placeholder="SEARCH..." className="w-full bg-transparent outline-none border-none px-2 text-[10px] font-mono uppercase tracking-widest text-white placeholder:text-white/30" />
                      <button onClick={() => setSearchOpen(false)} aria-label="Close search" className="mr-2 text-white/50 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setSearchOpen(true)} aria-label="Search" className="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                      <Search className="w-[18px] h-[18px]" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* WISHLIST — count badge always visible, hover (or tap) opens the panel from the top */}
              <div
                ref={wishlistRef}
                className="relative"
                onPointerEnter={(e) => {
                  lastPointerType.current = e.pointerType;
                  if (e.pointerType === "mouse") openWishlist();
                }}
                onMouseLeave={scheduleWishlistClose}
                onMouseEnter={cancelWishlistClose}
              >
                <button
                  onPointerDown={(e) => {
                    lastPointerType.current = e.pointerType;
                  }}
                  onClick={() => {
                    // mouse: hover already opened it, so a click must not close it. touch/keyboard: toggle.
                    if (lastPointerType.current === "mouse") openWishlist();
                    else wishlistOpen ? setWishlistOpen(false) : openWishlist();
                  }}
                  aria-label={`Wishlist, ${wishlistCount} saved`}
                  aria-haspopup="true"
                  aria-expanded={wishlistOpen}
                  className="relative w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                >
                  <Heart className={`w-[18px] h-[18px] transition-all ${wishlistCount > 0 ? "fill-white text-white" : ""}`} />
                  {wishlistCount > 0 && <span className="absolute top-0 right-0 min-w-[15px] h-[15px] px-1 flex items-center justify-center bg-white text-black text-[8px] font-mono font-bold rounded-full">{wishlistCount}</span>}
                </button>

                <AnimatePresence>
                  {wishlistOpen && (
                    // outer wrapper has top padding so there is no dead gap between the icon and the panel
                    <div className="absolute top-full right-[-8px] sm:right-0 pt-[22px] w-[calc(100vw-1rem)] sm:w-[400px] max-w-[400px]">
                      <motion.div {...wishlistMotion} className="bg-black border-2 border-white/15 shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                          <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-white">
                            <Heart className="w-3.5 h-3.5" />
                            Wishlist
                          </div>
                          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/40">{wishlistCount} SAVED</span>
                        </div>

                        {wishlistCount === 0 ? (
                          <div className="px-4 py-10 text-center">
                            <Heart className="w-6 h-6 mx-auto mb-4 text-white/30" />
                            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40 mb-5">Wishlist is empty</p>
                            <Link to="/collection" onClick={() => setWishlistOpen(false)} className="inline-block px-4 py-2 border border-white/30 text-[10px] font-mono font-bold uppercase tracking-widest text-white/70 hover:bg-white hover:text-black transition-all">
                              Explore collections
                            </Link>
                          </div>
                        ) : wishlistLoading && wishlistProducts.length === 0 ? (
                          <div className="px-4 py-10 text-center text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Loading...</div>
                        ) : (
                          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-white/5 p-2">
                            {wishlistProducts.map((product) => (
                              <li key={product.id} className="group/wish flex items-center gap-3 px-2 py-2 hover:bg-white/5 transition-colors">
                                <Link to={productPath(product.id)} onClick={() => setWishlistOpen(false)} className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-12 h-16 shrink-0 border border-white/15 bg-white/5 overflow-hidden">
                                    {product.image && <img src={product.image} alt={product.title} loading="lazy" className="w-full h-full object-cover" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-[11px] font-mono font-bold uppercase tracking-widest text-white">{product.title}</p>
                                    {product.collection && <p className="truncate text-[9px] font-mono uppercase tracking-widest text-white/40 mt-1">{product.collection}</p>}
                                    {product.price !== undefined && <p className="text-[11px] font-mono font-bold text-white/70 mt-1">&#8377;{product.price.toLocaleString()}</p>}
                                  </div>
                                </Link>
                                <button onClick={() => toggleFavourite(product.id)} aria-label={`Remove ${product.title} from wishlist`} className="shrink-0 w-8 h-8 flex items-center justify-center text-white/40 hover:text-white border border-transparent hover:border-white/30 transition-all">
                                  <X className="w-4 h-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* CART */}
              <Link to="/cart" aria-label={`Shopping cart, ${cartCount} items`} className="relative w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <ShoppingBag className="w-[18px] h-[18px]" />
                {cartCount > 0 && <span className="absolute top-0 right-0 min-w-[15px] h-[15px] px-1 flex items-center justify-center bg-white text-black text-[8px] font-mono font-bold rounded-full">{cartCount}</span>}
              </Link>

              {/* USER — auth-aware dropdown: guest -> login/signup, user -> profile, admin -> profile + admin panel */}
              <div ref={userRef} className="relative hidden sm:block">
                <button onClick={() => { setUserMenuOpen((v) => !v); setWishlistOpen(false); }} aria-label="Account" aria-haspopup="true" aria-expanded={userMenuOpen} className="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                  <User className="w-[18px] h-[18px]" />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div {...dropdownMotion} className="absolute top-full right-0 mt-5 w-48 bg-black border-2 border-white/15 shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)] p-2">
                      {authLoading ? (
                        <div className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-white/40">Loading...</div>
                      ) : user ? (
                        <>
                          <div className="px-4 pt-2 pb-3 mb-1 border-b border-white/10 text-[9px] font-mono uppercase tracking-widest text-white/40 truncate">{user.name || user.email || "Account"}</div>

                          {isAdmin && (
                            <Link to="/admin" onClick={() => setUserMenuOpen(false)} className={dropdownRow}>
                              <span className="flex items-center gap-2 group-hover/item:translate-x-1 transition-transform">
                                <LayoutDashboard className="w-3.5 h-3.5" />Admin Panel
                              </span>
                            </Link>
                          )}

                          <Link to="/dashboard" onClick={() => setUserMenuOpen(false)} className={dropdownRow}>
                            <span className="flex items-center gap-2 group-hover/item:translate-x-1 transition-transform">
                              <UserCircle className="w-3.5 h-3.5" />Profile
                            </span>
                          </Link>

                          <button onClick={handleLogout} className={`w-full ${dropdownRow}`}>
                            <span className="flex items-center gap-2 group-hover/item:translate-x-1 transition-transform">
                              <LogOut className="w-3.5 h-3.5" />Logout
                            </span>
                          </button>
                        </>
                      ) : (
                        <>
                          <Link to="/login" onClick={() => setUserMenuOpen(false)} className={dropdownRow}>
                            <span className="group-hover/item:translate-x-1 transition-transform">Login</span>
                            <span className="opacity-0 -translate-x-1 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all">→</span>
                          </Link>
                          <Link to="/signup" onClick={() => setUserMenuOpen(false)} className={dropdownRow}>
                            <span className="group-hover/item:translate-x-1 transition-transform">Sign Up</span>
                            <span className="opacity-0 -translate-x-1 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all">→</span>
                          </Link>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* MOBILE MENU TOGGLE */}
              <button onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu" aria-expanded={mobileOpen} className="xl:hidden w-9 h-9 flex items-center justify-center text-white/80 hover:text-white transition-colors">
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* MOBILE MENU */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="xl:hidden overflow-hidden border-t border-white/10 bg-black">
              <nav className="px-5 py-5 space-y-1 max-h-[calc(100vh-80px)] overflow-y-auto">
                {/* MOBILE COLLECTIONS */}
                <button onClick={() => setCollectionsOpen(!collectionsOpen)} className="w-full flex items-center justify-between py-3 text-left text-[11px] font-mono font-bold uppercase tracking-widest text-white/70 hover:text-white">
                  <span>Collections</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${collectionsOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {collectionsOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-4 border-l border-white/10">
                      {activeCollections.map((collection) => (
                        <Link key={collection.name} to={collection.path} onClick={() => { setCollectionsOpen(false); setMobileOpen(false); }} className="block py-2 text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white">
                          {collection.name}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {MENU_ITEMS.map((item) => (
                  <Link key={item.name} to={item.path} onClick={() => setMobileOpen(false)} className={`${mobileRow} border-b border-white/5`}>
                    {item.name === "Customize" ? <GlitchText text={item.name} as="span" ambient /> : item.name}
                  </Link>
                ))}

                {/* MOBILE HELP CENTER */}
                <div className="pt-3 mt-3 border-t border-white/10">
                  <p className="py-2 text-[9px] font-mono font-bold uppercase tracking-widest text-white/30">Help Center</p>
                  <Link to="/help#about" onClick={() => setMobileOpen(false)} className="block py-2 text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white">About Poster Theory</Link>
                  {HELP_ITEMS.map(([name, path]) => (
                    <Link key={name} to={path} onClick={() => setMobileOpen(false)} className="block py-2 text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white">{name}</Link>
                  ))}
                </div>

                {/* MOBILE ACCOUNT — same auth rules as the desktop dropdown */}
                <div className="pt-3 mt-3 border-t border-white/10 space-y-1">
                  {authLoading ? null : user ? (
                    <>
                      {isAdmin && <Link to="/admin" onClick={() => setMobileOpen(false)} className={mobileRow}>Admin Panel</Link>}
                      <Link to="/dashboard" onClick={() => setMobileOpen(false)} className={mobileRow}>Profile</Link>
                      <button onClick={handleLogout} className={`w-full text-left ${mobileRow}`}>Logout</button>
                    </>
                  ) : (
                    <>
                      <Link to="/login" onClick={() => setMobileOpen(false)} className={mobileRow}>Login</Link>
                      <Link to="/signup" onClick={() => setMobileOpen(false)} className={mobileRow}>Sign Up</Link>
                    </>
                  )}
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}