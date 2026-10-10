import React, { useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import GlitchText from "./GlitchText";
import GlitchOverlay from "./Glitchoverlay";

gsap.registerPlugin(ScrollTrigger);

/* =========================================================
   WALL LAYOUT — follows the hand-drawn sketch

        ┌──────────┬───────────────────┐
        │          │        A4         │
        │          ├────────┬──────────┤
        │    A3    │        │    A6    │
        │          │   A5   ├─────┬────┤
        │          │        │Pckt │Pol.│
        └──────────┴────────┴─────┴────┘

   Every frame fills its own grid cell, so nothing overlaps
   and nothing is rotated. The cell proportions were worked
   out from the real sizes so each frame still reads close to
   its true shape (A3 tall, A5 portrait, Polaroid squarer than
   Pocket) — A4 and A6 are landscape, exactly as sketched.
   Bookmark is intentionally excluded.
========================================================= */

interface WallPoster {
  id: string;
  name: string;
  /** real print size in mm (from DEFAULT_SIZES) — used for the label */
  width_mm: number;
  height_mm: number;
  /** grid-area name used to place this frame in the wall grid */
  area: string;
  /** printed-area inset in % — Polaroid / Pocket get a thicker bottom border */
  inset: { top: number; right: number; bottom: number; left: number };
}

const WALL_POSTERS: WallPoster[] = [
  { id: "a3", name: "A3", width_mm: 297, height_mm: 420, area: "a3", inset: { top: 3, right: 4, bottom: 3, left: 4 } },
  { id: "a4", name: "A4", width_mm: 210, height_mm: 297, area: "a4", inset: { top: 4, right: 3, bottom: 4, left: 3 } },
  { id: "a5", name: "A5", width_mm: 148, height_mm: 210, area: "a5", inset: { top: 3, right: 5, bottom: 3, left: 5 } },
  { id: "a6", name: "A6", width_mm: 105, height_mm: 148, area: "a6", inset: { top: 5, right: 4, bottom: 5, left: 4 } },
  { id: "pocket", name: "Pocket", width_mm: 50, height_mm: 70, area: "pocket", inset: { top: 5, right: 7, bottom: 20, left: 7 } },
  { id: "polaroid", name: "Polaroid", width_mm: 75, height_mm: 90, area: "polaroid", inset: { top: 6, right: 7, bottom: 22, left: 7 } },
];

const WALL_AREAS = `
  "a3 a4 a4 a4"
  "a3 a5 a6 a6"
  "a3 a5 pocket polaroid"
`;
// column / row weights = the real proportions of each frame, so the
// whole wall keeps a fixed 599 : 400 shape at every screen size
const WALL_COLUMNS = "283fr 147fr 71fr 83fr";
const WALL_ROWS = "186fr 104fr 100fr";

// 297 -> "29.7", 420 -> "42", 50 -> "5", 75 -> "7.5"
const cm = (mm: number) => `${Math.round(mm) / 10}`;

/* =========================================================
   POSTER FRAME
   Outer node = GSAP owns it (scroll-in entrance only).
   Inner motion.div = a small hover lift.

   The size label is pinned to the frame's bottom-left corner.
   The frame is a CSS size container and the label's font size
   is in `cqw` (container-width units), so the text scales with
   the frame — it fits inside A3 and Pocket alike.
========================================================= */

const PosterFrame = React.forwardRef<HTMLDivElement, { poster: WallPoster; onClick: () => void }>(
  ({ poster, onClick }, outerRef) => {
    const { inset } = poster;

    return (
      <div ref={outerRef} style={{ gridArea: poster.area, opacity: 0 }} className="relative h-full w-full">
        <motion.div
          onClick={onClick}
          whileHover={{ scale: 1.03, zIndex: 20 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          style={{ containerType: "inline-size" }}
          className="group relative h-full w-full cursor-pointer border-2 border-z-paper bg-z-paper shadow-[6px_6px_0px_0px_rgba(255,255,255,0.12)] transition-shadow duration-300 hover:shadow-[10px_10px_0px_0px_rgba(255,255,255,0.18)]"
        >
          {/* registration marks */}
          <span className="absolute -left-1.5 -top-1.5 h-2.5 w-2.5 border-l-2 border-t-2 border-z-paper/60" />
          <span className="absolute -bottom-1.5 -right-1.5 h-2.5 w-2.5 border-b-2 border-r-2 border-z-paper/60" />

          {/* printed area — halftone placeholder, no external image dependency */}
          <div
            className="absolute overflow-hidden bg-z-ink"
            style={{ top: `${inset.top}%`, right: `${inset.right}%`, bottom: `${inset.bottom}%`, left: `${inset.left}%` }}
          >
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1.5px)",
                backgroundSize: "8px 8px",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </div>

          {/* size label — bottom-left corner of the frame */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 z-10 bg-z-paper font-mono uppercase leading-none text-z-ink"
            style={{ padding: "clamp(2px, 3cqw, 9px)" }}
          >
            <p className="font-bold tracking-[0.08em]" style={{ fontSize: "clamp(6px, 8cqw, 15px)" }}>
              {poster.name}
            </p>
            <p className="mt-[0.35em] whitespace-nowrap tracking-wide text-z-ink/60" style={{ fontSize: "clamp(5px, 5.5cqw, 11px)" }}>
              {cm(poster.width_mm)}&times;{cm(poster.height_mm)}cm
            </p>
          </div>
        </motion.div>
      </div>
    );
  }
);
PosterFrame.displayName = "PosterFrame";

/* =========================================================
   CUSTOMIZE SECTION
========================================================= */

const Customize: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const postersWrapRef = useRef<HTMLDivElement>(null);
  const posterOuterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const navigate = useNavigate();

  // fires once when the section scrolls into view: bursts the heading's
  // glitch, the full-section overlay, and a brief section-wide shake —
  // then everything settles into its quieter "ambient" flicker state
  const [sectionGlitch, setSectionGlitch] = useState(false);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      // seamless infinite marquee — track is duplicated once in JSX, loop -50%
      if (marqueeRef.current) {
        gsap.to(marqueeRef.current, { xPercent: -50, duration: 18, ease: "linear", repeat: -1 });
      }

      // staggered fade/rise for the copy column
      if (leftColRef.current) {
        const items = leftColRef.current.querySelectorAll(".reveal-item");
        gsap.set(items, { opacity: 0, y: 24 });

        ScrollTrigger.create({
          trigger: leftColRef.current,
          start: "top 80%",
          once: true,
          onEnter: () => {
            gsap.to(items, { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: "power3.out" });
            setSectionGlitch(true);
          },
        });
      }

      // gallery-wall entrance — every frame settles into its own grid cell
      gsap.set(posterOuterRefs.current, { scale: 0.85, y: 24 });

      ScrollTrigger.create({
        trigger: postersWrapRef.current,
        start: "top 78%",
        once: true,
        onEnter: () => {
          WALL_POSTERS.forEach((_, i) => {
            const el = posterOuterRefs.current[i];
            if (!el) return;
            gsap.to(el, {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: 0.7,
              delay: i * 0.08,
              ease: "power3.out",
            });
          });
        },
      });
    }, section);

    // subtle parallax drift on the whole wall while scrolling past —
    // it moves as one piece, so nothing ever overlaps
    const parallax = gsap.to(postersWrapRef.current, {
      y: -24,
      ease: "none",
      scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 1 },
    });

    requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      ctx.revert();
      parallax.kill();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative m-10 overflow-hidden border-b-2 border-z-border bg-z-ink py-10 text-z-paper sm:py-28"
    >
      {/* whole-section neon glitch — faint scanlines + color bands always
          on, with a short GSAP camera-shake burst once the section scrolls
          in. Matches the "Customize" nav link and the heading below. */}
      <GlitchOverlay ambient burst={sectionGlitch} shakeTargetRef={sectionRef} />

      {/* ================================================= AMBIENT MARQUEE ================================================= */}
      <div className="pointer-events-none absolute left-0 right-0 top-6 select-none overflow-hidden">
        <div ref={marqueeRef} className="flex w-max whitespace-nowrap">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center pr-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="pr-6 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-z-paper/15">
                  Custom Sizes • Your Design • Premium Print •
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] items-center gap-14 px-6 lg:grid-cols-2 lg:gap-20">
        {/* ================================================= LEFT — COPY ================================================= */}
        <div ref={leftColRef}>
          <p className="reveal-item mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-z-paper/50">
            Build Your Own
          </p>

          <GlitchText
            as="h2"
            text="Customize Your Poster"
            ambient
            burst={sectionGlitch}
            className="font-display text-4xl uppercase leading-[1] tracking-tighter text-z-paper sm:text-6xl lg:text-7xl"
          />

          <p className="reveal-item mt-6 max-w-md font-mono text-sm leading-relaxed text-z-paper/60 sm:text-base">
            Pick your size, drop in your design, and we print it exactly your way — from pocket-sized prints to full A3 wall art.
          </p>

          <Link
            to="/customize"
            className="reveal-item group/btn mt-10 inline-flex items-center gap-3 bg-z-paper px-8 py-4 font-mono text-[12px] font-bold uppercase tracking-widest text-z-ink transition-colors hover:bg-z-paper/90"
          >
            <span>Start Customizing</span>
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover/btn:-translate-y-1 group-hover/btn:translate-x-1" />
          </Link>
        </div>

        {/* ================================================= RIGHT — GALLERY WALL (sketch layout) ================================================= */}
        <div
          ref={postersWrapRef}
          className="mx-auto w-full max-w-[600px] lg:mx-0"
          style={{ aspectRatio: "599 / 400" }}
        >
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateAreas: WALL_AREAS,
              gridTemplateColumns: WALL_COLUMNS,
              gridTemplateRows: WALL_ROWS,
              gap: "clamp(6px, 1.2vw, 12px)",
            }}
          >
            {WALL_POSTERS.map((poster, i) => (
              <PosterFrame
                key={poster.id}
                poster={poster}
                onClick={() => navigate(`/customize?size=${encodeURIComponent(poster.name)}`)}
                ref={(el) => {
                  posterOuterRefs.current[i] = el;
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Customize;