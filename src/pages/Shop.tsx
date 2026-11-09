  import React, { useEffect, useState, useMemo, useRef } from 'react';
  import api from '../lib/api';
  import { useCart } from '../context/CartContext';
  import { useNavigate } from 'react-router-dom';
  import { useSearchParams, useLocation } from 'react-router-dom';
  import ProductCard from '../components/ProductCard';
  import { SlidersHorizontal, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
  import mockUp from '../assets/Mocup-A4.png'


  const STATUS_FLAGS = [
    { key: 'is_featured', label: 'Featured' },
    { key: 'is_trending', label: 'Trending' },
    { key: 'is_new_arrival', label: 'New Arrival' },
    { key: 'is_bestseller', label: 'Bestseller' },
  ];

  const PAGE_SIZE = 20;

  function FilterGroup({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="border-b border-z-border/20 pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between mb-3 group">
          <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted font-black group-hover:text-z-ink transition-colors">{title}</h4>
          {open ? <ChevronUp className="w-3 h-3 text-z-muted" /> : <ChevronDown className="w-3 h-3 text-z-muted" />}
        </button>
        {open && <div className="flex flex-wrap gap-1.5">{children}</div>}
      </div>
    );
  }

  function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button onClick={onClick}
        className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase border transition-all active:scale-95 ${active ? 'bg-z-ink text-z-paper border-z-ink' : 'bg-z-paper text-z-ink border-z-border/50 hover:border-z-ink'}`}>
        {children}
      </button>
    );
  }

  export default function Shop() {
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [collections, setCollections] = useState<any[]>([]);
    const [layouts, setLayouts] = useState<any[]>([]);
    const [sizes, setSizes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [localSearch, setLocalSearch] = useState('');
    const [showSearchDrop, setShowSearchDrop] = useState(false);
    const searchRef = useRef<HTMLFormElement>(null);
    const [searchParams, setSearchParams] = useSearchParams();

    const { cart } = useCart();
    const navigate = useNavigate();

    //New Algs States
    const [trendingProducts, setTrendingProducts] = useState<any[]>([]);
    const [newArrivalProducts, setNewArrivalProducts] = useState<any[]>([]);
    const [bestsellerProducts, setBestsellerProducts] = useState<any[]>([]);

    const collectionFilter = searchParams.get('collection');
    const layoutFilter = searchParams.get('layout');
    const statusFilter = searchParams.get('status');
    const sizeFilter = searchParams.get('size');
    const orientationFilter = searchParams.get('orientation');
    const searchQuery = searchParams.get('q');
    const tagQuery = searchParams.get('tag');

    const frameFilter = searchParams.get("frame");


    const location = useLocation();

    const promotionSelection = location.state?.promotionSelection as
  | {
      size: string;
      promotionId: number;
      quantity?: number;
    }
  | undefined;

  const [promotionSettings, setPromotionSettings] = useState<{
  id: number;
  buy_quantity: number;
  free_quantity: number;
  is_active: boolean;
} | null>(null);

useEffect(() => {
  if (!promotionSelection) return;

  let cancelled = false;

  api.get('/api/orders/promotion')
    .then(res => {
      if (!cancelled) {
        setPromotionSettings(res.data.promotion ?? null);
      }
    })
    .catch(error => {
      console.error('Failed to verify promotion:', error);
      if (!cancelled) setPromotionSettings(null);
    });

  return () => {
    cancelled = true;
  };
}, [promotionSelection?.promotionId]);

const eligibleQuantity = useMemo(() => {
  if (!promotionSelection) return 0;

  const targetSize = promotionSelection.size.trim().toUpperCase();

  return cart.reduce((total, item) => {
    if (item.promotionFree) return total;

    const material = String(item.customSpecs?.material || '')
      .trim()
      .toUpperCase();

    const frame = String(item.customSpecs?.frame || 'None')
      .trim()
      .toLowerCase();

    const isCustomPaper =
      item.isCustom === true &&
      (material === 'PAPER' || material === 'PAPER POSTER') &&
      (frame === 'none' || frame === '') &&
      ![7, 8].includes(Number(item.sizeId));

    const isCataloguePaper =
      item.priceCategory === 'print_only' &&
      ![7, 8].includes(Number(item.sizeId));

    const itemSize = String(
      item.customSpecs?.size || item.size || ''
    ).trim().toUpperCase();

    if (
      itemSize !== targetSize ||
      (!isCustomPaper && !isCataloguePaper)
    ) {
      return total;
    }

    return total + item.quantity;
  }, 0);
}, [cart, promotionSelection?.size]);

    const unlockedFreeQuantity =
      promotionSelection &&
      promotionSettings?.is_active &&
      promotionSettings.id === promotionSelection.promotionId &&
      promotionSettings.buy_quantity > 0 &&
      promotionSettings.free_quantity > 0
        ? Math.floor(
            eligibleQuantity /
            (promotionSettings.buy_quantity + promotionSettings.free_quantity)
          ) * promotionSettings.free_quantity
        : 0;

    const verifiedPromotionSelection =
      promotionSelection && unlockedFreeQuantity > 0
        ? {
            ...promotionSelection,
            quantity: unlockedFreeQuantity,
          }
        : undefined;

    // Close search dropdown on outside click
    useEffect(() => {
      const handler = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchDrop(false); };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Autocomplete suggestions from loaded products
    const searchSuggestions = useMemo(() => {
      if (!localSearch.trim()) return [];
      const q = localSearch.toLowerCase();
      const results: { label: string; type: string }[] = [];
      const seen = new Set<string>();
      if (q.startsWith('#')) {
        const tag = q.slice(1);
        if (!tag) return [];
        for (const p of allProducts) {
          for (const t of (p.tags || [])) {
            if (t.toLowerCase().includes(tag) && !seen.has(t.toLowerCase())) {
              seen.add(t.toLowerCase());
              results.push({ label: t, type: '#tag' });
              if (results.length >= 15) return results;
            }
          }
        }
      } else {
        for (const p of allProducts) {
          if (p.title?.toLowerCase().includes(q) && !seen.has(p.title.toLowerCase())) {
            seen.add(p.title.toLowerCase());
            results.push({ label: p.title, type: 'title' });
            if (results.length >= 15) return results;
          }
        }
        for (const p of allProducts) {
          for (const t of (p.tags || [])) {
            if (t.toLowerCase().includes(q) && !seen.has(`#${t.toLowerCase()}`)) {
              seen.add(`#${t.toLowerCase()}`);
              results.push({ label: t, type: '#tag' });
              if (results.length >= 15) return results;
            }
          }
        }
      }
      return results;
    }, [localSearch, allProducts]);

    const handleLocalSearch = (e: React.FormEvent) => {
      e.preventDefault();
      if (!localSearch.trim()) return;
      const q = localSearch.trim();
      if (q.startsWith('#')) setFilter('tag', q.slice(1));
      else setFilter('q', q);
      setLocalSearch('');
      setShowSearchDrop(false);
    };

    const selectSuggestion = (s: { label: string; type: string }) => {
      if (s.type === '#tag') setFilter('tag', s.label);
      else setFilter('q', s.label);
      setLocalSearch('');
      setShowSearchDrop(false);
    };

    useEffect(() => {
      Promise.all([
        api.get('/api/products/collections'),
        api.get('/api/products/layouts'),
        api.get('/api/products/customize-config'),
      ]).then(([colRes, layRes, cfgRes]) => {
        setCollections(Array.isArray(colRes.data) ? colRes.data : []);
        setLayouts(Array.isArray(layRes.data) ? layRes.data : []);
        setSizes(Array.isArray(cfgRes.data?.sizes) ? cfgRes.data.sizes : []);
      }).catch(() => {});
    }, []);

  useEffect(() => {
    setLoading(true);

    Promise.all([
      api.get('/api/products'),
      api.get('/api/products/trending?limit=20'),
      api.get('/api/products/new-arrivals?limit=20'),
      api.get('/api/products/bestsellers?limit=20'),
    ])
      .then(([productsRes, trendingRes, newArrivalsRes, bestsellersRes]) => {
        setAllProducts(
          Array.isArray(productsRes.data)
            ? productsRes.data
            : []
        );

        setTrendingProducts(
          Array.isArray(trendingRes.data)
            ? trendingRes.data
            : []
        );

        setNewArrivalProducts(
          Array.isArray(newArrivalsRes.data)
            ? newArrivalsRes.data
            : []
        );

        setBestsellerProducts(
            Array.isArray(bestsellersRes.data)
              ? bestsellersRes.data
              : []
          );
      })
      .catch((err) => {
        console.error("Failed to load products:", err);

        setAllProducts([]);
        setTrendingProducts([]);
        setNewArrivalProducts([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

    // Client-side filtering (server already ensures status='active')
  const filtered = useMemo(() => {
    let data =
      statusFilter === 'Trending'
        ? trendingProducts
        : statusFilter === 'New Arrival'
          ? newArrivalProducts
          : statusFilter === 'Bestseller'
            ? bestsellerProducts
            : allProducts;
      if (collectionFilter) data = data.filter(p => p.collection_name === collectionFilter || p.collection_slug === collectionFilter);
      if (layoutFilter) {
        const match = layouts.find(l => l.name === layoutFilter);
        if (match) data = data.filter(p => p.available_layouts?.includes(match.id));
      }
      if (sizeFilter) {
        const match = sizes.find(s => s.name === sizeFilter);
        if (match) data = data.filter(p => p.available_sizes?.includes(match.id));
      }
    
      if (orientationFilter) data = data.filter(p => p.orientation === orientationFilter || p.orientation === 'both');
      if (
        statusFilter &&
        statusFilter !== 'Trending' &&
        statusFilter !== 'New Arrival'
      ) {
        const flag = STATUS_FLAGS.find(
          f => f.label === statusFilter
        );

        if (flag) {
          data = data.filter(p => p[flag.key]);
        }
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        data = data.filter(p => p.title?.toLowerCase().includes(q) || (p.tags || []).some((t: string) => t.toLowerCase().includes(q)));
      }
      if (tagQuery) {
        const t = tagQuery.toLowerCase();
        data = data.filter(p => (p.tags || []).some((tag: string) => tag.toLowerCase().includes(t)));
      }
      return data;
    }, [allProducts, trendingProducts,  newArrivalProducts, bestsellerProducts,collectionFilter, layoutFilter, statusFilter, sizeFilter, orientationFilter, searchQuery, tagQuery, layouts, sizes]);

    const promotionFiltered = useMemo(() => {
  if (!promotionSelection) return filtered;

  const targetSize = promotionSelection.size.trim().toUpperCase();

  const matchingSize = sizes.find(
    size => String(size.name).trim().toUpperCase() === targetSize
  );

  if (!matchingSize) return [];

  return filtered.filter(product =>
    Array.isArray(product.available_sizes) &&
    product.available_sizes.map(Number).includes(Number(matchingSize.id))
  );
}, [filtered, promotionSelection?.size, sizes]);

const paginated = useMemo(
  () => promotionFiltered.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  ),
  [promotionFiltered, page]
);

const totalPages = Math.ceil(promotionFiltered.length / PAGE_SIZE);

    // Reset page when filters change
    useEffect(() => { setPage(1); }, [collectionFilter, layoutFilter, statusFilter, sizeFilter, orientationFilter, searchQuery, tagQuery, frameFilter]);

    const setFilter = (key: string, value: string | null) => {
      const newParams = new URLSearchParams(searchParams);
      if (!value || newParams.get(key) === value) newParams.delete(key);
      else newParams.set(key, value);
      setSearchParams(newParams);
    };
    const excludedSizes = ['7x5', '4x4'];

    const clearAll = () => setSearchParams({});
    const activeCount = [collectionFilter, layoutFilter, statusFilter, sizeFilter, orientationFilter, tagQuery,frameFilter,].filter(Boolean).length;

    const FilterContent = () => (
      <>
        <FilterGroup title="Collection">
          <FilterPill active={!collectionFilter} onClick={() => setFilter('collection', null)}>All</FilterPill>
          {collections.map(c => (
            <FilterPill key={c.id} active={collectionFilter === c.name} onClick={() => setFilter('collection', c.name)}>{c.name}</FilterPill>
          ))}
        </FilterGroup>

      

        <FilterGroup title="Paper Size">
          <FilterPill
            active={!sizeFilter}
            onClick={() => setFilter('size', null)}
          >
            All
          </FilterPill>

          {sizes
            .filter(s => !excludedSizes.includes(s.name))
            .map(s => (
              <FilterPill
                key={s.id}
                active={sizeFilter === s.name}
                onClick={() => setFilter('size', s.name)}
              >
                {s.name}
              </FilterPill>
            ))}
        </FilterGroup>

        <FilterGroup title="Orientation">
          <FilterPill active={!orientationFilter} onClick={() => setFilter('orientation', null)}>All</FilterPill>
          <FilterPill active={orientationFilter === 'portrait'} onClick={() => setFilter('orientation', 'portrait')}>Portrait</FilterPill>
          <FilterPill active={orientationFilter === 'landscape'} onClick={() => setFilter('orientation', 'landscape')}>Landscape</FilterPill>
        </FilterGroup>

        

        <FilterGroup title="Frames">
          {/* FRAMES */}
        <FilterPill
      active={!frameFilter}
      onClick={() => setFilter('frame', null)}
    >
      None
    </FilterPill>

    <FilterPill
      active={frameFilter === 'black'}
      onClick={() => setFilter('frame', 'black')}
    >
      Black Matt
    </FilterPill>

    <FilterPill
      active={frameFilter === 'white'}
      onClick={() => setFilter('frame', 'white')}
    >
      White Matt
    </FilterPill>

        </FilterGroup>


        <FilterGroup title="Status">
          <FilterPill active={!statusFilter} onClick={() => setFilter('status', null)}>All</FilterPill>
          {STATUS_FLAGS.map(f => (
            <FilterPill key={f.key} active={statusFilter === f.label} onClick={() => setFilter('status', f.label)}>{f.label}</FilterPill>
          ))}
        </FilterGroup>


        
      </>
    );

    return (
      <div className="pt-24 sm:pt-40 pb-16 sm:pb-32 min-h-screen">

        
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12">
          <header className="mb-8 sm:mb-16 flex flex-col xl:flex-row xl:items-end justify-between border-b-4 border-z-border pb-6 sm:pb-12 gap-4 sm:gap-8">
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold  text-4xl sm:text-8xl lg:text-9xl uppercase tracking-tighter leading-none  ">
                <span >Collections</span>
              </h1>
              <p className="text-[14px] sm:text-[30px] font-mono text-red-500 uppercase mt-2 sm:mt-4 tracking-widest">All A series Sizes</p>
            </div>
            {/* Inline search */}
            <form onSubmit={handleLocalSearch} className="relative" ref={searchRef}>
              <input type="text" placeholder="Search title or #tag..."
                value={localSearch}
                onChange={e => { setLocalSearch(e.target.value); setShowSearchDrop(true); }}
                onFocus={() => setShowSearchDrop(true)}
                className="bg-z-paper border-2 border-z-border px-4 py-2 pl-10 text-[11px] font-mono font-bold uppercase tracking-widest focus:outline-none focus:border-z-ink transition-all w-64 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] focus:shadow-none focus:translate-x-[2px] focus:translate-y-[2px]" />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-z-ink" />
              {showSearchDrop && searchSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-z-paper border-2 border-z-border shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] z-50 max-h-64 overflow-y-auto">
                  {searchSuggestions.map((s, i) => (
                    <button key={i} type="button" onClick={() => selectSuggestion(s)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-mono hover:bg-z-ink hover:text-z-paper transition-colors border-b border-z-border/10 last:border-0">
                      <span className="font-bold truncate">{s.type === '#tag' ? `#${s.label}` : s.label}</span>
                      <span className="text-[8px] font-black uppercase opacity-50 shrink-0 ml-3">{s.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </form>
          </header>

          <div className="flex gap-8">
            {/* Desktop Sidebar */}
            <aside className={`hidden lg:block sticky top-32 self-start transition-all duration-300 ${sidebarOpen ? 'w-64 min-w-[16rem]' : 'w-10 min-w-[2.5rem]'}`}>
              {sidebarOpen ? (
                <div className="bg-z-paper border-2 border-z-border p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
                  <div className="flex items-center justify-between mb-5 pb-3 border-b-2 border-z-border">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-z-ink" />
                      <span className="text-[11px] uppercase tracking-widest font-black text-z-ink font-display">Filters</span>
                      {activeCount > 0 && <span className="w-5 h-5 bg-z-ink text-z-paper text-[9px] font-mono font-black flex items-center justify-center">{activeCount}</span>}
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-z-ink hover:text-z-paper transition-all" title="Collapse">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {activeCount > 0 && (
                    <button onClick={clearAll} className="w-full mb-4 py-1.5 text-[9px] font-mono font-black uppercase tracking-wider text-z-muted border border-z-border/30 hover:border-z-ink hover:text-z-ink transition-all">
                      Clear All Filters
                    </button>
                  )}

                  <FilterContent />
                </div>
              ) : (
                <button onClick={() => setSidebarOpen(true)}
                  className="w-10 h-10 bg-z-paper border-2 border-z-border flex items-center justify-center shadow-[4px_4px_0px_0px_var(--color-z-shadow)] hover:bg-z-ink hover:text-z-paper transition-all"
                  title="Show Filters">
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              )}
            </aside>

            {/* Product Grid */}
            <div className="flex-1 min-w-0">

              {promotionSelection && (
  <div className="mb-6 border-2 border-z-border bg-z-paper p-5">
    <p className="font-display font-black text-xl uppercase">
      Choose Your Free Posters
    </p>

    <p className="font-mono text-xs uppercase mt-2">
      Size: {promotionSelection.size}
    </p>

    {verifiedPromotionSelection ? (
      <p className="font-mono text-xs font-bold mt-2">
        {unlockedFreeQuantity} FREE POSTERS AVAILABLE
      </p>
    ) : (
      <p className="font-mono text-xs text-red-600 mt-2">
        No free posters currently unlocked for this size.
      </p>
    )}

    <button
      type="button"
      onClick={() => navigate('/cart')}
      className="mt-4 border-2 border-z-border px-5 py-2 font-mono text-xs font-bold uppercase"
    >
      Back to Cart
    </button>
  </div>
)}
              {/* Active filters bar */}
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {collectionFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-z-ink text-z-paper text-[9px] font-mono uppercase">
                      {collectionFilter} <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setFilter('collection', null)} />
                    </span>
                  )}
                  {sizeFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-z-ink text-z-paper text-[9px] font-mono uppercase">
                      {sizeFilter} <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setFilter('size', null)} />
                    </span>
                  )}
                  {/* Frame */}
                  {frameFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-z-ink text-z-paper text-[9px] font-mono uppercase">
                      {frameFilter === 'black' ? 'Black Matt' : 'White Matt'}
                      <X
                        className="w-2.5 h-2.5 cursor-pointer"
                        onClick={() => setFilter('frame', null)}
                      />
                    </span>
                  )}
                  {orientationFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-z-ink text-z-paper text-[9px] font-mono uppercase">
                      {orientationFilter} <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setFilter('orientation', null)} />
                    </span>
                  )}
                  {layoutFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-z-ink text-z-paper text-[9px] font-mono uppercase">
                      {layoutFilter} <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setFilter('layout', null)} />
                    </span>
                  )}
                  {statusFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-z-ink text-z-paper text-[9px] font-mono  uppercase">
                      {statusFilter} <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setFilter('status', null)} />
                    </span>
                  )}
                  {tagQuery && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-z-ink text-z-paper text-[9px] font-mono uppercase">
                      #{tagQuery} <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setFilter('tag', null)} />
                    </span>
                  )}
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-z-ink text-z-paper text-[9px] font-mono uppercase">
                      "{searchQuery}" <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setFilter('q', null)} />
                    </span>
                  )}
                </div>
                {!loading && (
                  <span className="text-[11px] font-mono font-bold text-z-muted uppercase">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              {/* Grid */}
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-12">
                  {[1,2,3,4,5,6,7,8].map(i => (
                    <div key={i} className="animate-pulse">
                      <div className="aspect-[200/240] bg-z-border/10  border-z-border mb-4" />
                      <div className="h-3 bg-z-border/10 border border-z-border w-2/3 mb-2" />
                      <div className="h-3 bg-z-border/10 border border-z-border w-1/3" />
                    </div>
                  ))}
                </div>
              ) : paginated.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4  gap-y-12 ">
                    {paginated.map((p: any) => (
                      <ProductCard
                          key={p.id}
                          {...p}
                          promotionSelection={verifiedPromotionSelection}
                          frameColor={
                            frameFilter === "black" || frameFilter === "white"
                              ? frameFilter
                              : undefined
                          }
                        />
                    ))}
                  </div>
                  {totalPages > 0 && (
                    <div className="flex items-center justify-center gap-3 mt-12 ">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        className="px-4 py-2 text-[11px] font-mono  uppercase border-2 border-z-border disabled:opacity-30 hover:bg-z-ink hover:text-z-paper transition-all active:scale-95">Prev</button>
                      <span className="text-[11px] font-mono font-black text-z-ink">{page} / {totalPages}</span>
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="px-4 py-2 text-[11px] font-mono uppercase border-2 border-z-border disabled:opacity-30 hover:bg-z-ink hover:text-z-paper transition-all active:scale-95">Next</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-32 text-center bg-z-paper border-4 border-dashed border-z-border">
                  <p className="font-display  text-4xl text-z-muted uppercase  ">No results found.</p>
                  <p className="font-mono text-[12px] font-bold text-z-muted mt-4 uppercase tracking-[0.3em]">Try adjusting your filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile: Floating Filter Button */}
        <button onClick={() => setMobileSheetOpen(true)}
          className="lg:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-z-ink text-z-paper border-2 border-z-border rounded-full flex items-center justify-center shadow-[4px_4px_0px_0px_var(--color-z-shadow)] active:scale-95 transition-all">
          <SlidersHorizontal className="w-5 h-5" />
          {activeCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-z-orange text-white text-[9px] font-mono font-black rounded-full flex items-center justify-center">{activeCount}</span>}
        </button>

        {/* Mobile: Bottom Sheet */}
        {mobileSheetOpen && (
          <div className="lg:hidden fixed inset-0 z-[200]" onClick={() => setMobileSheetOpen(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="absolute bottom-0 left-0 right-0 bg-z-paper border-t-2 border-z-border rounded-t-2xl max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-z-paper pt-3 pb-2 px-6 border-b border-z-border/30 z-10">
                <div className="w-10 h-1 bg-z-border/40 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-z-ink" />
                    <span className="text-[12px] uppercase tracking-widest font-black text-z-ink font-display">Filters</span>
                    {activeCount > 0 && <span className="w-5 h-5 bg-z-ink text-z-paper text-[9px] font-mono font-black flex items-center justify-center">{activeCount}</span>}
                  </div>
                  <button onClick={() => setMobileSheetOpen(false)} className="p-2 hover:bg-z-ink hover:text-z-paper transition-all">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {activeCount > 0 && (
                  <button onClick={clearAll} className="w-full mb-5 py-2 text-[10px] font-mono  uppercase tracking-wider text-z-muted border-2 border-z-border/30 hover:border-z-ink hover:text-z-ink transition-all">
                    Clear All Filters
                  </button>
                )}
                <FilterContent />
              </div>

              <div className="sticky bottom-0 bg-z-paper border-t-2 border-z-border p-4">
                <button onClick={() => setMobileSheetOpen(false)} className="w-full py-3 bg-z-ink text-z-paper text-[11px] font-mono  uppercase tracking-widest active:scale-95 transition-all">
                  Show {filtered.length} Result{filtered.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
