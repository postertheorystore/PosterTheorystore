import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Heart, ShoppingBag, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import ProductModal from "./ProductModal";
import { useWishlist } from "../context/WishlistContext";

interface ProductProps {
  id: number;
  title: string;
  price?: number;
  image: string;
  collection?: string;
  collection_name?: string;
  description?: string;
  layout?: string;
  available_sizes?: number[];
  available_layouts?: number[];

  // Frame support
  frameColor?: "black" | "white";

  [key: string]: any;
}

export default function ProductCard(props: ProductProps) {
  const {
    id,
    title,
    price,
    image,
    collection_name,
    layout,
    available_sizes,
    frameColor,
  } = props;

  // The product currently shown in the drawer (null = closed).
  // Starts as this card's product; a "You May Also Like" click replaces it.
  const [modalProduct, setModalProduct] = useState<any | null>(null);
  const { isFavourite, toggleFavourite } = useWishlist();

  const liked = isFavourite(id);
  const displayPrice = price;

  const hasFrame = frameColor === "black" || frameColor === "white";

  const frameStyles =
    frameColor === "white"
      ? {
          backgroundColor: "#f0ede8",
          borderColor: "#d8d3ca",
        }
      : {
          backgroundColor: "#1a1a1a",
          borderColor: "#111111",
        };

  const openModal = () => setModalProduct(props);

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.45 }}
        className="group relative grid lg:grid-col-4 p-3 sm:p-4 bg-z-paper transition-colors duration-300 hover:bg-z-paper"
      >
        {/* PRODUCT IMAGE AREA */}
        <div className="relative">

          {/* Wishlist */}
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              await toggleFavourite(id);
            }}
            aria-label={
              liked
                ? "Remove from wishlist"
                : "Add to wishlist"
            }
            className="absolute top-3 right-3 z-30 w-9 h-9 flex items-center justify-center bg-z-paper/90 border border-z-border text-z-ink backdrop-blur-sm opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
          >
            <Heart
              className={`w-4 h-4 transition-all duration-200 ${
                liked ? "fill-current scale-110" : ""
              }`}
            />
          </button>

          {/* POSTER + FRAME */}
          <div
            className={`
              relative aspect-[4/5] overflow-hidden border
              transition-all duration-500 ease-out
              group-hover:shadow-[8px_8px_0px_0px_var(--color-z-shadow)]
              group-hover:-translate-x-1
              group-hover:-translate-y-1
              ${
                hasFrame
                  ? "p-4 sm:p-5 md:p-6"
                  : "p-4 bg-black"
              }
            `}
            style={hasFrame ? frameStyles : undefined}
          >
            {/* Inner mat / poster area */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                openModal();
              }}
              className="relative w-full h-full overflow-hidden bg-white cursor-pointer"
            >
              {image ? (
                <img
                  src={image}
                  alt={title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-z-paper">
                  <span className="font-mono text-[10px] text-z-muted uppercase tracking-widest">
                    No Image
                  </span>
                </div>
              )}

              {/* Subtle image overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500" />

              {/* Quick View */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openModal();
                }}
                className="absolute left-1/2 bottom-5 -translate-x-1/2 translate-y-4 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-400 bg-z-paper text-z-ink border border-z-border px-5 py-2.5 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] whitespace-nowrap shadow-[3px_3px_0px_0px_var(--color-z-shadow)]"
              >
                <Eye className="w-3.5 h-3.5" />
                Quick View
              </button>
            </div>
          </div>

          {/* Layout Badge */}
          {layout && layout !== "Single" && (
            <div className="absolute left-3 top-3 z-20 bg-z-ink text-z-paper px-2.5 py-1 text-[8px] font-mono font-bold uppercase tracking-widest">
              {layout}
            </div>
          )}
        </div>

        {/* PRODUCT INFORMATION */}
        <div className="pt-4 px-0.5 flex flex-col items-center justify-center">

          {/* Collection */}
          <p className="text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-[0.22em] text-z-muted mb-1.5">
            {collection_name || "Poster Theory"}
          </p>

          {/* Product Title */}
          <Link to={`/product/${id}`} className="block">
            <h3 className="font-display font-bold text-sm sm:text-[15px] uppercase tracking-tight leading-tight text-z-ink line-clamp-2 hover:text-z-muted transition-colors">
              {title}
            </h3>
          </Link>

          {/* Price + Action */}
          <div className="flex items-end justify-between gap-3 mt-4">
            <div>
              <p className="font-display font-black text-lg sm:text-xl text-z-ink leading-none">
                {displayPrice != null ? `From ₹${displayPrice}` : "Price unavailable"}
              </p>

              {available_sizes && available_sizes.length > 0 && (
                <p className="text-[8px] font-mono uppercase tracking-[0.12em] text-z-muted mt-1">
                  {available_sizes.length} sizes
                </p>
              )}
            </div>

            {/* Add to Cart */}
            <button
              type="button"
              onClick={openModal}
              className="flex items-center justify-center gap-2 bg-z-ink text-z-paper px-3 sm:px-4 py-2.5 font-mono text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.15em] border border-z-ink hover:bg-transparent hover:text-z-ink transition-all duration-300"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>
        </div>

        {/* Product Number */}
        <div className="absolute top-3 left-3 pointer-events-none">
          <span className="font-mono text-[7px] text-z-muted/60 tracking-widest">
            #{String(id).padStart(3, "0")}
          </span>
        </div>
      </motion.article>

      {/* AnimatePresence lets the drawer play its slide-down exit before unmounting */}
      <AnimatePresence>
        {modalProduct && (
          <ProductModal
            key="product-drawer"
            product={modalProduct}
            onClose={() => setModalProduct(null)}
            onProductSelect={(item) => setModalProduct(item)}
          />
        )}
      </AnimatePresence>
    </>
  );
}