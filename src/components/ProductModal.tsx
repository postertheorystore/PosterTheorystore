import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, ShoppingBag, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence, useDragControls, type Variants } from 'motion/react';
import { useCart } from '../context/CartContext';
import { useCustomizeConfig } from '../hooks/useCustomizeConfig';

import api from '../lib/api';

interface Props {
  product: any;
  onClose: () => void;
  onProductSelect?: (product: any) => void;
}

type Config = ReturnType<typeof useCustomizeConfig>;

const SINGLE_ONLY_SIZES = ['Polaroid', 'Pocket'];
const BOOKMARK_SIZES = ['Bookmark'];
const NO_FRAME_SIZES = [...SINGLE_ONLY_SIZES, ...BOOKMARK_SIZES];

/* ---------- animation variants ---------- */
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.12 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

/* ---------- small UI helpers ---------- */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <motion.div variants={rise} className="py-4 border-b border-z-border/20">
      <span className="text-[9px] font-mono font-black uppercase tracking-widest text-z-muted mb-2 block">{label}</span>
      {children}
      {hint && <p className="text-[9px] font-mono text-z-muted mt-2 leading-relaxed">{hint}</p>}
    </motion.div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-2 text-[10px] font-mono font-black uppercase border-2 transition-all ${
        active
          ? 'bg-z-ink text-z-paper border-z-ink'
          : 'border-z-border text-z-ink hover:border-z-ink hover:shadow-[3px_3px_0px_0px_var(--color-z-shadow)] hover:-translate-x-0.5 hover:-translate-y-0.5'
      }`}
    >
      {children}
    </motion.button>
  );
}

const getItemImage = (item: any): string =>
  item?.image ||
  (Array.isArray(item?.images) ? item.images.find((u: string) => u?.startsWith('http')) : '') ||
  '';

/* =====================================================================
   Outer shell: portal, backdrop, bottom sheet, Escape, scroll lock, drag
   ===================================================================== */
export default function ProductModal({ product, onClose, onProductSelect }: Props) {
  // Loaded once here so swapping products doesn't refetch the config
  const config = useCustomizeConfig();
  const dragControls = useDragControls();

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock background scroll (and avoid layout shift from the vanishing scrollbar)
  useEffect(() => {
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-hidden" role="dialog" aria-modal="true" aria-label={product.title}>
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <motion.div
        className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-6xl h-[92vh] flex-col overflow-hidden bg-z-paper border-2 border-b-0 border-z-border rounded-t-2xl shadow-[0_-8px_0_0_var(--color-z-shadow)]"
        style={{ height: '92dvh' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) onClose();
        }}
      >
        {/* Handle + header (drag from here so inner scrolling is never hijacked) */}
        <div
          className="shrink-0 border-b-2 border-z-border cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => dragControls.start(e)}
        >
          <div className="flex justify-center pt-2 pb-1">
            <span className="h-1.5 w-12 rounded-full bg-z-ink/30" />
          </div>
          <div className="flex items-center justify-between px-4 sm:px-6 pb-2">
            <p className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-z-muted truncate">
              Poster Theory <span className="mx-1">/</span> {product.collection_name || 'Poster'}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 shrink-0 bg-z-ink text-z-paper flex items-center justify-center hover:opacity-80 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Keyed by product id: switching to a similar product remounts the details,
            which resets every selection, reloads similar products and returns the
            scroll area to the top, while the sheet itself stays open. */}
        <motion.div
          key={product.id}
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <ProductDetails product={product} config={config} onClose={onClose} onProductSelect={onProductSelect} />
        </motion.div>
      </motion.div>
    </div>,
    document.body
  );
}

/* =====================================================================
   Product details: all original state, pricing and cart logic lives here
   ===================================================================== */
function ProductDetails({
  product,
  config,
  onClose,
  onProductSelect,
}: {
  product: any;
  config: Config;
  onClose: () => void;
  onProductSelect?: (product: any) => void;
}) {
  const { addToCart } = useCart();
  const { sizes, layouts, sizePrices, portraitOnly, framePricing, materialPricing } = config;

  const [similarProducts, setSimilarProducts] = useState<any[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  const [selectedSize, setSelectedSize] = useState('A4');
  const [selectedLayout, setSelectedLayout] = useState('Single');
  const [printStyle, setPrintStyle] = useState<'full-bleed' | 'white-margin'>('full-bleed');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    product.orientation === 'landscape' ? 'landscape' : 'portrait'
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [currentImg, setCurrentImg] = useState(0);
  const [selectedMaterial, setSelectedMaterial] = useState('PAPER POSTER');
  const [metallicThickness, setMetallicThickness] = useState<'0.45mm' | '1mm'>('0.45mm');
  const [withFrame, setWithFrame] = useState(false);
  const [frameColor, setFrameColor] = useState<'Black' | 'White'>('Black');

  const images: string[] = useMemo(() => {
    const imgs = Array.isArray(product.images) ? product.images.filter((u: string) => u?.startsWith('http')) : [];
    if (imgs.length === 0 && product.image) return [product.image];
    return imgs;
  }, [product]);

  /* ---------- similar products ---------- */
  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;

    const loadSimilarProducts = async () => {
      try {
        setSimilarLoading(true);
        const { data } = await api.get(`/api/products/${product.id}/similar?limit=6`);
        if (!cancelled) setSimilarProducts(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load similar products:', error);
        if (!cancelled) setSimilarProducts([]);
      } finally {
        if (!cancelled) setSimilarLoading(false);
      }
    };

    loadSimilarProducts();
    return () => {
      cancelled = true;
    };
  }, [product?.id]);

  /* ---------- derived option state (unchanged) ---------- */
  const productOrientation: string = product.orientation || 'both';
  const canChooseOrientation =
    productOrientation === 'both' && !portraitOnly.includes(selectedSize) && !BOOKMARK_SIZES.includes(selectedSize);
  const isBookmark = BOOKMARK_SIZES.includes(selectedSize);
  const isNoFrame = NO_FRAME_SIZES.includes(selectedSize);

  const selectedLayoutObj = layouts.find((l) => l.name === selectedLayout);
  const panelCount = selectedLayoutObj?.panel_count || 1;
  const isSingleOnly = [...SINGLE_ONLY_SIZES, ...BOOKMARK_SIZES].includes(selectedSize);

  const productSizeIds: number[] = Array.isArray(product.available_sizes) ? product.available_sizes : [];
  const productLayoutIds: number[] = Array.isArray(product.available_layouts) ? product.available_layouts : [];

  const availableSizes = useMemo(() => {
    if (productSizeIds.length === 0) return [];
    return sizes.filter((s) => s.id != null && productSizeIds.includes(s.id));
  }, [sizes, productSizeIds]);

  // Without Frame: hide frame_only sizes. With Frame: hide sizes with no frame_pricing entry.
  const visibleSizes = useMemo(() => {
    if (withFrame) return availableSizes.filter((s) => framePricing.some((f) => f.size_name === s.name));
    return availableSizes.filter((s) => !s.frame_only);
  }, [availableSizes, withFrame, framePricing]);

  const availableLayouts = useMemo(() => {
    if (productLayoutIds.length === 0) return [];
    let filtered = layouts.filter((l) => l.id != null && productLayoutIds.includes(l.id));
    if (isSingleOnly) filtered = filtered.filter((l) => l.panel_count === 1);
    return filtered;
  }, [layouts, productLayoutIds, isSingleOnly]);

  useEffect(() => {
    if (availableSizes.length > 0 && !visibleSizes.find((s) => s.name === selectedSize)) {
      setSelectedSize(visibleSizes[0]?.name ?? availableSizes[0].name);
    }
  }, [visibleSizes]);

  // Auto-enable frame when a frame-only size is selected
  useEffect(() => {
    const sizeObj = availableSizes.find((s) => s.name === selectedSize);
    if (sizeObj?.frame_only && !withFrame) setWithFrame(true);
  }, [selectedSize, availableSizes]);

  useEffect(() => {
    if (availableLayouts.length > 0 && !availableLayouts.find((l) => l.name === selectedLayout)) {
      setSelectedLayout(availableLayouts[0].name);
    }
  }, [availableLayouts]);

  useEffect(() => {
    if (panelCount > 1) setPrintStyle('full-bleed');
    else if (SINGLE_ONLY_SIZES.includes(selectedSize)) setPrintStyle('white-margin');
  }, [panelCount, selectedSize]);

  useEffect(() => {
    if (portraitOnly.includes(selectedSize) || BOOKMARK_SIZES.includes(selectedSize)) setOrientation('portrait');
    else if (productOrientation === 'portrait') setOrientation('portrait');
    else if (productOrientation === 'landscape') setOrientation('landscape');
  }, [selectedSize, portraitOnly, productOrientation]);

  // Reset frame when size changes and frame not available
  const frameEntry = framePricing.find((f) => f.size_name === selectedSize);
  const frameAvailable = !!frameEntry;
  useEffect(() => {
    if (!frameAvailable) setWithFrame(false);
  }, [frameAvailable]);

  /* ---------- pricing (unchanged) ---------- */
  const materialExtra = materialPricing.find((m) => m.material === selectedMaterial)?.extra_price ?? 0;

  // Price = (size base price + frame + material) × panel count
  const sizeBasePrice = sizePrices[selectedSize] || 0;
  const frameCost = !isNoFrame && withFrame && frameEntry ? frameEntry.price : 0;
  const pricePerSheet = sizeBasePrice + (isNoFrame ? 0 : frameCost) + (isNoFrame ? 0 : materialExtra);
  const price = pricePerSheet * panelCount;

  const nextImg = () => setCurrentImg((prev) => (prev + 1) % images.length);
  const prevImg = () => setCurrentImg((prev) => (prev - 1 + images.length) % images.length);

  const handleAddToCart = () => {
    addToCart({
      id: product.id,
      title: product.title,
      price,
      image: images[0],
      collection: product.collection_name || '',
      size: `${selectedSize} ${orientation} - ${selectedLayout}`,
      quantity,
      customSpecs: {
        size: selectedSize,
        orientation,
        layout: selectedLayout,
        panelCount,
        printStyle,
        unitCount: quantity,
        material: selectedMaterial,
        frame: withFrame ? frameColor : 'None',
      },
    });
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      onClose();
    }, 1200);
  };

  // The priced material list (shown with a frame) replaces the simple toggle, so only one is visible
  const showPricedMaterials = !isNoFrame && withFrame && materialPricing.length > 0;
  const total = price * quantity;

  return (
    <>
      {/* ---------------- Scrollable content ---------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="grid grid-cols-1 md:grid-cols-12 md:gap-8 p-4 sm:p-6">
          {/* Gallery (sticky on desktop, thumbnails on the left like a marketplace page) */}
          <div className="md:col-span-7 md:sticky md:top-2 self-start">
            <div className="flex flex-col-reverse md:flex-row gap-3">
              {images.length > 1 && (
                <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:overflow-x-hidden md:max-h-[55vh] pb-1 md:pb-0">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onMouseEnter={() => setCurrentImg(idx)}
                      onClick={() => setCurrentImg(idx)}
                      className={`shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-2 overflow-hidden transition-all ${
                        currentImg === idx
                          ? 'border-z-ink shadow-[3px_3px_0px_0px_var(--color-z-shadow)]'
                          : 'border-z-border/30 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="relative flex-1 flex items-center justify-center p-3 sm:p-4 bg-gray-50 dark:bg-z-ink/5 border-2 border-z-border">
  {/* Fixed-size frame: every product renders at the same size regardless of image dimensions */}
  <div className="relative h-[46vh] md:h-[60vh] aspect-[4/5] max-w-full overflow-hidden bg-white border border-z-border/30">
    <AnimatePresence mode="wait">
      <motion.img
        key={currentImg}
        src={images[currentImg]}
        alt={product.title}
        initial={{ opacity: 0, scale: 1.03 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </AnimatePresence>
  </div>

  {images.length > 1 && (
    <>
      <button
        type="button"
        onClick={prevImg}
        aria-label="Previous image"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-z-paper border-2 border-z-border flex items-center justify-center hover:bg-z-ink hover:text-z-paper transition-all"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={nextImg}
        aria-label="Next image"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-z-paper border-2 border-z-border flex items-center justify-center hover:bg-z-ink hover:text-z-paper transition-all"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      <span className="absolute bottom-2 right-2 bg-z-ink text-z-paper px-2 py-0.5 text-[9px] font-mono">
        {currentImg + 1} / {images.length}
      </span>
    </>
  )}
</div>
            </div>
          </div>

          {/* Options column */}
          <motion.div
            className="md:col-span-5 flex flex-col mt-5 md:mt-0 min-w-0"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            {/* Title + price */}
            <motion.div variants={rise} className="pb-4 border-b-2 border-z-border">
              <p className="text-[10px] font-mono text-z-muted uppercase tracking-widest mb-1">
                {product.collection_name || 'Poster'}
              </p>
              <h2 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-tighter leading-none text-z-ink break-words">
                {product.title}
              </h2>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <motion.span
                  key={price}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="font-display font-black text-3xl text-z-ink"
                >
                  &#8377;{price}
                </motion.span>
                <span className="text-[9px] font-mono uppercase text-z-muted">
                  {selectedSize} · {selectedLayout}
                  {panelCount > 1 ? ` · ${panelCount} panels` : ''}
                </span>
              </div>
            </motion.div>

            {/* Frame (first, because it filters the available sizes) */}
            {!isNoFrame && (
              <Field label="Frame">
                <div className="flex flex-wrap gap-2">
                  <Chip active={!withFrame} onClick={() => setWithFrame(false)}>Without Frame</Chip>
                  <Chip active={withFrame} onClick={() => setWithFrame(true)}>With Frame</Chip>
                </div>
              </Field>
            )}

            {/* Size */}
            {availableSizes.length > 0 && (
              <Field label="Size">
                <div className="flex flex-wrap gap-2">
                  {visibleSizes.map((s) => (
                    <Chip key={s.name} active={selectedSize === s.name} onClick={() => setSelectedSize(s.name)}>
                      {s.name}
                    </Chip>
                  ))}
                  {visibleSizes.length === 0 && (
                    <p className="text-[10px] font-mono text-z-muted">No sizes available for this option</p>
                  )}
                </div>
              </Field>
            )}

            {/* Layout */}
            {availableLayouts.length > 1 && (
              <Field label="Layout">
                <div className="flex flex-wrap gap-2">
                  {availableLayouts.map((l) => (
                    <Chip key={l.name} active={selectedLayout === l.name} onClick={() => setSelectedLayout(l.name)}>
                      {l.name}
                    </Chip>
                  ))}
                </div>
              </Field>
            )}

            {/* Print style */}
            {panelCount <= 1 && !SINGLE_ONLY_SIZES.includes(selectedSize) && !isBookmark && (
              <Field label="Print Style">
                <div className="flex flex-wrap gap-2">
                  <Chip active={printStyle === 'full-bleed'} onClick={() => setPrintStyle('full-bleed')}>Borderless</Chip>
                  <Chip active={printStyle === 'white-margin'} onClick={() => setPrintStyle('white-margin')}>White Margin</Chip>
                </div>
              </Field>
            )}

            {/* Orientation */}
            {canChooseOrientation && (
              <Field label="Orientation">
                <div className="flex flex-wrap gap-2">
                  {(['portrait', 'landscape'] as const).map((o) => (
                    <Chip key={o} active={orientation === o} onClick={() => setOrientation(o)}>{o}</Chip>
                  ))}
                </div>
              </Field>
            )}

            {/* Material (simple toggle) */}
            {!showPricedMaterials && (
              <Field label="Material">
                <div className="flex flex-wrap gap-2">
                  <Chip active={selectedMaterial === 'PAPER POSTER'} onClick={() => setSelectedMaterial('PAPER POSTER')}>
                    Paper Poster
                  </Chip>
                  <Chip
                    active={selectedMaterial === 'METALLIC POSTER'}
                    onClick={() => {
                      setSelectedMaterial('METALLIC POSTER');
                      setMetallicThickness('0.45mm');
                    }}
                  >
                    Metal Poster
                  </Chip>
                </div>
              </Field>
            )}

            {/* Material (priced, only with a frame) */}
            {showPricedMaterials && (
              <Field
                label="Material"
                hint={
                  selectedMaterial === 'METALLIC POSTER'
                    ? 'Metal poster — Premium metal posters with a sleek finish and long-lasting durability'
                    : 'Art poster — High-quality paper prints with vibrant colors and sharp details'
                }
              >
                <div className="flex flex-wrap gap-2">
                  {materialPricing.map((m) => (
                    <Chip key={m.material} active={selectedMaterial === m.material} onClick={() => setSelectedMaterial(m.material)}>
                      {m.material}
                      {m.extra_price > 0 && <span className="ml-1 opacity-70">+&#8377;{m.extra_price}</span>}
                    </Chip>
                  ))}
                </div>
              </Field>
            )}

            {/* Metallic thickness */}
            {selectedMaterial === 'METALLIC POSTER' && (
              <Field label="Metallic Thickness">
                <div className="flex flex-wrap gap-2">
                  {(['0.45mm', '1mm'] as const).map((t) => (
                    <Chip key={t} active={metallicThickness === t} onClick={() => setMetallicThickness(t)}>
                      {t === '0.45mm' ? '0.45 mm' : '1 mm'}
                    </Chip>
                  ))}
                </div>
              </Field>
            )}

            {/* Frame color */}
            {!isNoFrame && withFrame && (
              <>
                {frameEntry ? (
                  <Field
                    label="Frame Color"
                    hint={`1 inch frame · Matt finish · +₹${frameEntry.price}`}
                  >
                    <div className="flex flex-wrap gap-2">
                      {(['Black', 'White'] as const).map((color) => (
                        <Chip key={color} active={frameColor === color} onClick={() => setFrameColor(color)}>
                          {color} Matt
                        </Chip>
                      ))}
                    </div>
                  </Field>
                ) : (
                  <motion.p variants={rise} className="text-[10px] font-mono text-z-muted py-4">
                    Frame not available for selected size
                  </motion.p>
                )}
              </>
            )}

            {/* Price breakdown ("buy box") */}
            <motion.div
              variants={rise}
              className="mt-5 border-2 border-z-border p-4 space-y-1.5 shadow-[4px_4px_0px_0px_var(--color-z-shadow)]"
            >
              <p className="text-[9px] font-mono font-black uppercase tracking-widest text-z-ink mb-2">Price Breakdown</p>
              <div className="flex justify-between text-[10px] font-mono text-z-muted uppercase">
                <span>Size ({selectedSize})</span><span>&#8377;{sizeBasePrice}</span>
              </div>
              {!isNoFrame && frameCost > 0 && (
                <div className="flex justify-between text-[10px] font-mono text-z-muted uppercase">
                  <span>Frame ({frameColor} Matt)</span><span>+&#8377;{frameCost}</span>
                </div>
              )}
              {!isNoFrame && materialExtra > 0 && (
                <div className="flex justify-between text-[10px] font-mono text-z-muted uppercase">
                  <span>Material ({selectedMaterial})</span><span>+&#8377;{materialExtra}</span>
                </div>
              )}
              {selectedMaterial === 'METALLIC POSTER' && (
                <div className="flex justify-between text-[10px] font-mono text-z-muted uppercase">
                  <span>Thickness</span><span>{metallicThickness}</span>
                </div>
              )}
              {panelCount > 1 && (
                <div className="flex justify-between text-[10px] font-mono text-z-muted uppercase">
                  <span>× {panelCount} panels</span><span>= &#8377;{price}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline text-[10px] font-mono text-z-muted uppercase border-t border-z-border/30 pt-2">
                <span>× {quantity} qty</span>
                <span className="text-lg font-display font-black text-z-ink">&#8377;{total}</span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* ---------------- You May Also Like ---------------- */}
        {(similarLoading || similarProducts.length > 0) && (
          <div className="border-t-2 border-z-border px-4 sm:px-6 py-6">
            <div className="mb-4">
              <h3 className="font-display font-black text-base sm:text-lg uppercase tracking-tight text-z-ink">
                You May Also Like
              </h3>
              <p className="text-[9px] font-mono text-z-muted uppercase mt-1">More from this category</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              {similarLoading && similarProducts.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                   <div key={i} className="aspect-[4/5] border-2 border-z-border/20 bg-z-ink/5 animate-pulse" />
                  ))
                : similarProducts.map((item, i) => (
                    <motion.button
                      key={item.id}
                      type="button"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.3 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onProductSelect?.(item)}
                      className="group text-left min-w-0"
                    >
                     <div className="aspect-[4/5] bg-white border-2 border-z-border overflow-hidden transition-all duration-300 group-hover:shadow-[4px_4px_0px_0px_var(--color-z-shadow)] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5">
                      <img
                        src={getItemImage(item)}
                        alt={item.title}  
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                      <p className="mt-2 text-[10px] font-mono font-black uppercase text-z-ink truncate">{item.title}</p>
                      <p className="text-[10px] font-mono text-z-muted mt-0.5">
                        {item.price != null ? `From ₹${item.price}` : 'Price unavailable'}
                      </p>
                    </motion.button>
                  ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------------- Fixed action bar (never overlaps content) ---------------- */}
      <div className="shrink-0 border-t-2 border-z-border bg-z-paper px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center justify-between sm:justify-start gap-5 sm:flex-1">
            <div className="min-w-0">
              <p className="text-[9px] font-mono uppercase text-z-muted">Total · {quantity} × &#8377;{price}</p>
              <motion.p
                key={total}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="font-display font-black text-2xl leading-none text-z-ink"
              >
                &#8377;{total}
              </motion.p>
            </div>

            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 border-2 border-z-border flex items-center justify-center hover:bg-z-ink hover:text-z-paper transition-colors"
              >
                <Minus className="w-3 h-3" />
              </motion.button>
              <span className="text-[14px] font-mono font-black text-z-ink w-8 text-center">{quantity}</span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-9 h-9 border-2 border-z-border flex items-center justify-center hover:bg-z-ink hover:text-z-paper transition-colors"
              >
                <Plus className="w-3 h-3" />
              </motion.button>
            </div>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleAddToCart}
            className={`w-full sm:w-72 py-3.5 text-[11px] font-mono font-black uppercase flex items-center justify-center gap-2 transition-all shadow-[4px_4px_0px_0px_var(--color-z-shadow)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] ${
              added ? 'bg-green-500 text-white' : 'bg-z-ink text-z-paper'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={added ? 'added' : 'idle'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                {added ? <Check className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                {added ? 'Added!' : 'Add to Cart'}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </>
  );
}