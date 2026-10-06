import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import api from '../lib/api';
import { Link } from 'react-router-dom';
import Hero from '../components/Hero';
import SaleAnnouncement from '../components/SaleAnnouncement';
import ProductCard from '../components/ProductCard';
import Collections from '../components/Collections';
import PosterLayouts from '../components/PosterLayouts';
import HowItWorks from '../components/HowItWorks';
import About from '../components/About';
import { Truck, Shield, RotateCcw, Palette } from 'lucide-react';
import gsap from "gsap";
import Customize from '../components/Customize';
import { ScrollTrigger } from "gsap/ScrollTrigger";
import TextReveal from '../components/Textreveal';
import PromotionalPopup from '../components/PromotionalPopUp';

gsap.registerPlugin(ScrollTrigger);

interface SectionConfig {
  limit: number;
  enabled: boolean;
}

export default function Home() {
  const [newArrivals, setNewArrivals] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [featured, setFeatured] = useState<any[]>([]);
  const [bestsellers, setBestsellers] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [aboutImage, setAboutImage] = useState('');
  const [showPromotion, setShowPromotion] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [sectionLimits, setSectionLimits] = useState<Record<string, SectionConfig>>({
    new_arrivals: { limit: 8, enabled: true },
    trending: { limit: 8, enabled: true },
    featured: { limit: 8, enabled: true },
    bestseller: { limit: 8, enabled: true },
  });


 

useEffect(() => {
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  window.scrollTo(0, 0);

  return () => {
    window.history.scrollRestoration = "auto";
  };
}, []);

  useEffect(() => {
  Promise.all([
    api.get('/api/products/collections'),
    api.get('/api/products/homepage'),
  ])
    .then(([catRes, hpRes]) => {
      const dbCats = Array.isArray(catRes.data) ? catRes.data : [];

      const savedCats: any[] =
        hpRes.data?.collection_images?.collections || [];

      const merged = dbCats.map((c: any) => {
        const saved = savedCats.find((s: any) => s.name === c.name);

        return {
          name: c.name,
          img: saved?.img || '',
          path: `/collection?collection=${c.name}`,
        };
      });

      setCollections(merged);

      if (hpRes.data?.about_image?.url) {
        setAboutImage(hpRes.data.about_image.url);
      }

      const limits: Record<string, SectionConfig> = {
        new_arrivals: hpRes.data?.new_arrivals || {
          limit: 8,
          enabled: true,
        },

        trending: hpRes.data?.trending || {
          limit: 8,
          enabled: true,
        },

        featured: hpRes.data?.featured || {
          limit: 8,
          enabled: true,
        },

        bestseller: hpRes.data?.bestseller || {
          limit: 8,
          enabled: true,
        },
      };

      setSectionLimits(limits);
      setPageReady(true);

      // -------------------------
      // New Arrivals - AUTOMATIC
      // -------------------------
      if (limits.new_arrivals.enabled) {
        api
          .get(
            `/api/products/new-arrivals?limit=${limits.new_arrivals.limit}`
          )
          .then((r) => {
            setNewArrivals(
              Array.isArray(r.data) ? r.data : []
            );
          })
          .catch((err) => {
            console.error("Failed to load new arrivals:", err);
            setNewArrivals([]);
          });
      }

      // -------------------------
      // Trending - AUTOMATIC
      // -------------------------
      if (limits.trending.enabled) {
        api
          .get(
            `/api/products/trending?limit=${limits.trending.limit}`
          )
          .then((r) => {
            setTrending(
              Array.isArray(r.data) ? r.data : []
            );
          })
          .catch((err) => {
            console.error("Failed to load trending products:", err);
            setTrending([]);
          });
      }

      // -------------------------
      // Featured
      // -------------------------
      if (limits.featured.enabled) {
        api
          .get(
            `/api/products?filter=featured&limit=${limits.featured.limit}`
          )
          .then((r) => {
            setFeatured(
              Array.isArray(r.data) ? r.data : []
            );
          })
          .catch((err) => {
            console.error("Failed to load featured products:", err);
            setFeatured([]);
          });
      }
      // -------------------------
      // Bestsellers - AUTOMATIC
      // -------------------------
      if (limits.bestseller.enabled) {
        api
          .get(
            `/api/products/bestsellers?limit=${limits.bestseller.limit}`
          )
          .then((r) => {
            setBestsellers(
              Array.isArray(r.data) ? r.data : []
            );
          })
          .catch((err) => {
            console.error("Failed to load bestsellers:", err);
            setBestsellers([]);
          });
      }

      // -------------------------
      // Fallback: Collections
      // -------------------------
      api
        .get('/api/products/collections')
        .then((r) => {
          if (Array.isArray(r.data)) {
            setCollections(
              r.data.map((c: any) => ({
                name: c.name,
                img: '',
                path: `/collection?collection=${c.name}`,
              }))
            );
          }
        })
        .catch(() => {
          setCollections([]);
        });

      // -------------------------
      // Fallback: New Arrivals - AUTOMATIC
      // -------------------------
      api
        .get('/api/products/new-arrivals?limit=8')
        .then((r) => {
          setNewArrivals(
            Array.isArray(r.data) ? r.data : []
          );
        })
        .catch(() => {
          setNewArrivals([]);
        });

      // -------------------------
      // Fallback: Trending - AUTOMATIC
      // -------------------------
      api
        .get('/api/products/trending?limit=8')
        .then((r) => {
          setTrending(
            Array.isArray(r.data) ? r.data : []
          );
        })
        .catch(() => {
          setTrending([]);
        });

      // -------------------------
      // Fallback: Featured
      // -------------------------
      api
        .get('/api/products?filter=featured&limit=8')
        .then((r) => {
          setFeatured(
            Array.isArray(r.data) ? r.data : []
          );
        })
        .catch(() => {
          setFeatured([]);
        });

     // -------------------------
    // Fallback: Bestsellers - AUTOMATIC
    // -------------------------
    api
      .get('/api/products/bestsellers?limit=8')
      .then((r) => {
        setBestsellers(
          Array.isArray(r.data) ? r.data : []
        );
      })
      .catch(() => {
        setBestsellers([]);
      });

      setPageReady(true);
    });
}, []);

  const ProductMarquee = ({ items, title, subtitle, link }: { items: any[]; title: string; subtitle: string; link: string }) => (
    <section className="py-16 sm:py-24 border-b-2 border-z-border overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-6 mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          {/* <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-z-muted font-bold mb-2">{subtitle}</p> */}
          <TextReveal as="h2" className="font-display  text-3xl sm:text-5xl uppercase tracking-tighter text-z-ink">{title}</TextReveal>
        </div>
        <Link to={link} className="text-[12px] font-mono font-bold uppercase tracking-widest text-z-ink border-b-2 border-z-ink hover:text-z-muted hover:border-z-muted transition-colors pb-1">
          View All →
        </Link>
      </div>
      <div className="group pb-4">
        <div className="flex gap-6 animate-marquee-scroll hover:[animation-play-state:paused] md:[animation-play-state:running] [animation-play-state:paused] md:animate-marquee-scroll overflow-x-auto md:overflow-visible scrollbar-hide px-6 md:px-0 items-stretch">
          {[...items, ...items].map((p: any, idx: number) => (
            <div key={`${p.id}-${idx}`} className="w-36 sm:w-48 md:w-56 shrink-0">
              <ProductCard {...p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  return (
    <div className=" sm:pt-20">
      <Hero />
      <SaleAnnouncement />
 

      {/* Shop by Collection — Marquee */}
      {collections.length > 0 && (
        <section className="sm: border-z-border overflow-hidden ">
          
          {/* <div className="max-w-[1440px] mx-auto px-6 mb-10">
            <div className="text-center">
              <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-z-muted font-bold mb-2">Browse By</p>
              <h2 className="font-display font-black text-3xl sm:text-5xl uppercase tracking-tighter text-z-ink">Collections</h2>
            </div>
          </div>
          <div className="group pb-4">
            <div className="flex gap-6 animate-marquee-scroll hover:[animation-play-state:paused] md:[animation-play-state:running] [animation-play-state:paused] md:animate-marquee-scroll overflow-x-auto md:overflow-visible scrollbar-hide px-6 md:px-0 items-stretch">
              {[...collections, ...collections].map((cat, idx) => (
                <Link key={idx} to={cat.path} className="shrink-0 group/card flex flex-col items-center">
                  <div className="w-36 sm:w-48 md:w-56 aspect-[3/4] overflow-hidden border-2 border-z-border group-hover/card:border-z-ink transition-all relative">
                    {cat.img ? (
                      <img src={cat.img} alt={cat.name} loading="eager" className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-z-border/10 flex items-center justify-center">
                        <span className="font-display font-black text-4xl text-z-ink/10 uppercase">{cat.name[2]}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="font-display font-bold text-base sm:text-lg uppercase tracking-tighter text-white">{cat.name}</h3>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          <div className="text-center mt-10">
            <Link to="/collection" className="inline-block px-8 py-3 bg-z-ink text-white font-mono text-[12px] font-bold uppercase tracking-widest hover:bg-z-ink/80 transition-colors">
              View All Collections
            </Link>
          </div> */}
          <Collections collections={collections}/>
        </section>
      )}

      <div><Customize/></div>
      



      
      {/* <section className="py-12 sm:py-24 px-4 sm:px-6 border-b-2 border-z-border">
        <div className="max-w-[1440px] mx-auto">
          <div className="text-center mb-8 sm:mb-14">
            <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.3em] text-z-muted font-bold mb-2">Simple Process</p>
            <h2 className="font-display font-black text-2xl sm:text-5xl uppercase tracking-tighter text-z-ink">How It Works</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8">
            {[
              { step: '01', title: 'Browse', desc: 'Explore our curated collections' },
              { step: '02', title: 'Choose', desc: 'Pick size, layout & style' },
              { step: '03', title: 'Order', desc: 'Secure checkout' },
              { step: '04', title: 'Delivered', desc: 'Shipped to your door' },
            ].map((item) => (
              <div key={item.step} className="text-center p-4 sm:p-6 border-2 border-z-border hover:border-z-ink transition-colors group">
                <span className="font-display font-black text-2xl sm:text-4xl text-z-ink/10 group-hover:text-z-ink/30 transition-colors">{item.step}</span>
                <h3 className="font-display font-bold text-base sm:text-xl uppercase tracking-tighter text-z-ink mt-2 sm:mt-3 mb-1 sm:mb-2">{item.title}</h3>
                <p className="text-[9px] sm:text-[11px] font-mono text-z-muted uppercase leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section> */}

      {/* Bestsellers — Grid */}
      {sectionLimits.bestseller.enabled && bestsellers.length > 0 && (
        <ProductMarquee items={bestsellers} title="Bestsellers" subtitle="Most Loved" link="/collection?status=Bestseller" />
      )}

      {/* New Arrivals */}
      {sectionLimits.new_arrivals.enabled && newArrivals.length > 0 && (
        <ProductMarquee items={newArrivals} title="New Arrivals" subtitle="Just Dropped" link="/collection?status=New Arrival" />
      )}

      <section className=" sm:py-24 px-4 sm:px-6  border-z-border">
        <HowItWorks/>

      </section>

      {/* Custom Print CTA 
      <section   className=" sm:py-24  sm:px-6">
        <div className="max-w-[1440px] mx-auto">
          <div className="bg-z-ink text-z-paper p-6 sm:p-16 flex flex-col md:flex-row items-center gap-6 sm:gap-16">
            <div className="flex-1">
              <p  className="text-[11px] font-mono uppercase tracking-[0.3em] text-z-paper/50 mb-4">Custom Print Studio</p>
              <h2 className="font-display font-black text-3xl sm:text-5xl uppercase tracking-tighter leading-[0.9] mb-6">
                Your Image.<br/>Our Print.
              </h2>
              <p className="font-mono text-[12px] text-z-paper/70 uppercase leading-relaxed mb-8 max-w-md">
                Upload any image and we'll print it on premium 300 GSM matte paper. Available in A3, A4, A5, A6, Polaroid & Pocket sizes with single or multi-panel layouts.
              </p>
              <Link to="/customize" className="inline-block bg-white text-z-ink px-8 py-3 font-mono text-[12px] font-bold uppercase tracking-widest hover:bg-white/90 transition-colors">
                Start Creating →
              </Link>
            </div>
            <div className="flex gap-3 shrink-0 items-end">
              <div className="w-20 sm:w-28 aspect-[210/297] bg-white/10 border border-white/20 flex items-center justify-center">
                <span className="font-display font-black text-xl text-white/20">A3</span>
              </div>
              <div className="w-16 sm:w-24 aspect-[210/297] bg-white/10 border border-white/20 flex items-center justify-center">
                <span className="font-display font-black text-lg text-white/20">A4</span>
              </div>
              <div className="w-14 sm:w-20 aspect-[210/297] bg-white/10 border border-white/20 flex items-center justify-center">
                <span className="font-display font-black text-base text-white/20">A5</span>
              </div>
              <div className="w-12 sm:w-16 aspect-[210/297] bg-white/10 border border-white/20 flex items-center justify-center">
                <span className="font-display font-black text-sm text-white/20">A6</span>
              </div>
            </div>
          </div>
        </div>
      </section>*/}

      {/* Trending — Grid */}
      {sectionLimits.trending.enabled && trending.length > 0 && (
        <ProductMarquee items={trending} title="Trending Now" subtitle="Popular Picks" link="/collection?status=Trending"
/>
      )}

      

      <div>
        <About aboutImage={aboutImage}  pageReady={pageReady}/>
      </div>
      <div><button type="button" onClick={() => setShowPromotion(true)} className="fixed bottom-6 right-6 z-[100] px-5 py-3 bg-z-ink text-z-paper border-2 border-z-paper font-mono text-[10px] font-bold uppercase tracking-widest shadow-[5px_5px_0px_0px_var(--color-z-shadow)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
  View Promotion
</button></div>

<PromotionalPopup
  open={showPromotion}
  onClose={() => setShowPromotion(false)}
/>

      {/* About */}

    </div>
  );
}
