import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import GlitchText from "./GlitchText";
import GlitchOverlay from "./Glitchoverlay";

gsap.registerPlugin(ScrollTrigger);

/* =========================================================
   WALL LAYOUT CONFIG
   Real print sizes drive the proportions of the gallery wall.
   Every frame sits in its own grid cell — never overlapping,
   never rotated — laid out like posters actually hung on a
   wall. Bookmark is intentionally excluded (too narrow/tall
   to read well as a wall poster).
========================================================= */

interface WallPoster {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  /** grid-area name used to place this frame in the wall grid */
  area: string;
}

const WALL_POSTERS: WallPoster[] = [
  { id: "a3", name: "A3", width_mm: 297, height_mm: 420, area: "a3" },
  { id: "a4", name: "A4", width_mm: 210, height_mm: 297, area: "a4" },
  { id: "a5", name: "A5", width_mm: 148, height_mm: 210, area: "a5" },
  { id: "a6", name: "A6", width_mm: 105, height_mm: 148, area: "a6" },
  { id: "polaroid", name: "Polaroid", width_mm: 75, height_mm: 90, area: "polaroid" },
  { id: "pocket", name: "Pocket", width_mm: 50, height_mm: 70, area: "pocket" },
];

/* Desktop: A3 anchors the wall (tall, 2 cols x 3 rows), A4 sits
   beside it (2 cols x 2 rows), A5 fills the top-right column,
   and A6 / Polaroid / Pocket line up along the bottom — a real
   salon-wall arrangement, every frame in its own cell. */
const DESKTOP_AREAS = `
  "a3 a3 a4 a4 a5"
  "a3 a3 a4 a4 a5"
  "a3 a3 a6 polaroid pocket"
`;
const DESKTOP_COLUMNS = "1.5fr 1.5fr 1.05fr 1.05fr 1fr";
const DESKTOP_ROWS = "1.1fr 1.1fr 0.85fr";

/* Mobile/tablet: simplified 3x3 wall — A3 still anchors, the
   rest fall into a clean stacked pattern underneath. */
const MOBILE_AREAS = `
  "a3 a3 a4"
  "a3 a3 a5"
  "a6 polaroid pocket"
`;
const MOBILE_COLUMNS = "repeat(3, 1fr)";
const MOBILE_ROWS = "repeat(3, 1fr)";

/* =========================================================
   POSTER FRAME
   Outer node = GSAP owns it (scroll-in entrance only — no
   rotation, no idle drift, nothing that could ever imply
   overlap). Inner motion.div = a tiny, fixed hover lift.
   The size label lives OUTSIDE the frame as a wall placard,
   so it always fits no matter how small the print is.
========================================================= */

const PosterFrame = React.forwardRef<HTMLDivElement, { poster: WallPoster; onClick: () => void }>(
  ({ poster, onClick }, outerRef) => {
    return (
      <div
        ref={outerRef}
        style={{ gridArea: poster.area, opacity: 0 }}
        className="wall-poster relative flex h-full w-full flex-col items-center justify-end gap-2 sm:gap-3"
      >
        {/* frame + art */}
        <div className="relative flex w-full flex-1 items-end justify-center">
          <motion.div
            onClick={onClick}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            style={{ aspectRatio: `${poster.width_mm} / ${poster.height_mm}` }}
            className="group relative h-full max-h-full w-auto max-w-full cursor-pointer border-2 border-z-paper bg-z-paper shadow-[8px_8px_0px_0px_rgba(255,255,255,0.12)] transition-shadow duration-300 hover:shadow-[12px_12px_0px_0px_rgba(255,255,255,0.18)]"
          >
            {/* registration marks */}
            <span className="absolute -left-1.5 -top-1.5 h-2.5 w-2.5 border-l-2 border-t-2 border-z-paper/60" />
            <span className="absolute -bottom-1.5 -right-1.5 h-2.5 w-2.5 border-b-2 border-r-2 border-z-paper/60" />

            {/* placeholder art — halftone dots, no external image dependency */}
            <div className="relative h-full w-full overflow-hidden bg-z-ink">
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1.5px)",
                  backgroundSize: "8px 8px",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
          </motion.div>
        </div>

        {/* wall placard — always the same size, so it always fits */}
        <div className="pointer-events-none text-center leading-tight">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-z-paper sm:text-xs">
            {poster.name}
          </p>
          <p className="mt-0.5 whitespace-nowrap font-mono text-[8px] tracking-wider text-z-paper/40 sm:text-[10px]">
            {poster.width_mm}&nbsp;&times;&nbsp;{poster.height_mm}mm
          </p>
        </div>
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

  const [isDesktop, setIsDesktop] = useState(false);
  // fires once when the section scrolls into view: bursts the heading's
  // glitch, the full-section overlay, and a brief section-wide shake —
  // then everything settles into its quieter "ambient" flicker state
  const [sectionGlitch, setSectionGlitch] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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

      // gallery-wall entrance — every frame settles into its own grid
      // cell once, in place. No rotation, no idle drift: once it's
      // hung, it stays put, like a real wall.
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

    // subtle parallax drift on the whole collage while scrolling past —
    // the wall moves as one piece, so nothing ever overlaps
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
          in. Matches the "Customize" nav link and the heading above. */}
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

        {/* ================================================= RIGHT — GALLERY WALL ================================================= */}
        <div
          ref={postersWrapRef}
          className="mx-auto h-[420px] w-full max-w-[560px] sm:h-[480px] lg:mx-0 lg:h-[520px]"
        >
          <div
            className="grid h-full w-full gap-4 sm:gap-5 lg:gap-6"
            style={{
              gridTemplateAreas: isDesktop ? DESKTOP_AREAS : MOBILE_AREAS,
              gridTemplateColumns: isDesktop ? DESKTOP_COLUMNS : MOBILE_COLUMNS,
              gridTemplateRows: isDesktop ? DESKTOP_ROWS : MOBILE_ROWS,
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