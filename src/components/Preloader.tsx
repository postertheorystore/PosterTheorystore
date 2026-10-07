import React, { useEffect, useState } from "react";
import {
  LOGO_PATHS,
  LOGO_VIEWBOX,
  LOGO_X_MAX,
  LOGO_X_MIN,
} from "./logoPaths";

interface PreloaderProps {
  isLoading: boolean;
  /**
   * Minimum time (ms) the loader stays up so the drawing always finishes,
   * even if the page is ready sooner. Default 3600.
   */
  minDuration?: number;
}

const EXIT_MS = 900;

const Preloader: React.FC<PreloaderProps> = ({
  isLoading,
  minDuration = 3600,
}) => {
  const [phase, setPhase] = useState<"show" | "exit" | "gone">(
    isLoading ? "show" : "gone"
  );
  const [minElapsed, setMinElapsed] = useState(false);

  // Show again if loading restarts after the loader was hidden
  useEffect(() => {
    if (isLoading && phase !== "show") {
      setMinElapsed(false);
      setPhase("show");
    }
  }, [isLoading, phase]);

  // Minimum-duration timer: depends only on `phase`, NOT on isLoading,
  // so it keeps running when the page finishes loading early.
  useEffect(() => {
    if (phase !== "show") return;
    const t = window.setTimeout(() => setMinElapsed(true), minDuration);
    return () => window.clearTimeout(t);
  }, [phase, minDuration]);

  // Leave only when the page is ready AND the drawing has finished
  useEffect(() => {
    if (!isLoading && minElapsed && phase === "show") setPhase("exit");
  }, [isLoading, minElapsed, phase]);

  useEffect(() => {
    if (phase !== "exit") return;
    const t = window.setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Lock scroll while the loader is on screen
  useEffect(() => {
    if (phase === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  if (phase === "gone") return null;

  const exiting = phase === "exit";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`pt-root fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-black transition-opacity ease-out ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
      style={{
        transitionDuration: `${EXIT_MS}ms`,
        backgroundImage:
          "radial-gradient(ellipse at 50% 45%, #141414 0%, #070707 45%, #000 80%)",
        ["--dur" as string]: `${minDuration}ms`,
      }}
    >
      <style>{css}</style>

      {/* Soft ambient glow behind the logo */}
      <div
        aria-hidden
        className="pt-glow pointer-events-none absolute h-[60vmin] w-[60vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 65%)",
        }}
      />

      {/* Logo */}
      <div
        className={`relative w-[min(78vw,520px)] transition-all ease-in ${
          exiting ? "scale-105 blur-[6px]" : "scale-100 blur-0"
        }`}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      >
        <svg
          viewBox={LOGO_VIEWBOX}
          className="block h-auto w-full"
          fill="none"
          aria-hidden
        >
          <defs>
            {/* Silver base with a bright highlight band that sweeps across */}
            <linearGradient
              id="pt-metal"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="700"
              y2="0"
            >
              <stop offset="0" stopColor="#cfcfcf" />
              <stop offset="0.5" stopColor="#ffffff" />
              <stop offset="1" stopColor="#cfcfcf" />
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                values="-760 0; 1900 0; 1900 0"
                keyTimes="0; 0.62; 1"
                dur="4.2s"
                begin="3.2s"
                repeatCount="indefinite"
              />
            </linearGradient>
          </defs>

          {LOGO_PATHS.map((p, i) => {
            const norm = Math.min(
              1,
              Math.max(0, (p.x - LOGO_X_MIN) / (LOGO_X_MAX - LOGO_X_MIN))
            );

            if (p.kind === "halo") {
              return (
                <path
                  key={i}
                  d={p.d}
                  fill="#000"
                  className="pt-halo"
                />
              );
            }

            const delay = 0.35 + norm * 1.1; // left → right, like handwriting
            return (
              <path
                key={i}
                d={p.d}
                pathLength={1}
                fill="url(#pt-metal)"
                stroke="#d9c8a2"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pt-ink"
                style={
                  {
                    ["--draw-delay" as string]: `${delay.toFixed(2)}s`,
                    ["--fill-delay" as string]: `${(delay + 1.5).toFixed(2)}s`,
                  } as React.CSSProperties
                }
              />
            );
          })}
        </svg>
      </div>

      {/* Progress hairline + label */}
      <div className="pt-meta mt-10 flex flex-col items-center gap-4">
        <div className="relative h-px w-40 overflow-hidden bg-white/10">
          <div className="pt-bar absolute inset-0 origin-left bg-gradient-to-r from-white/0 via-[#d9c8a2] to-white" />
        </div>
        <span className="text-[10px] font-light uppercase tracking-[0.45em] text-white/40">
          Loading
        </span>
      </div>
    </div>
  );
};

const css = `
.pt-ink {
  fill-opacity: 0;
  stroke-opacity: 1;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation:
    pt-draw 1.9s cubic-bezier(.65, 0, .35, 1) var(--draw-delay) forwards,
    pt-fill 1s ease-out var(--fill-delay) forwards;
}
.pt-halo {
  fill-opacity: 0;
  animation: pt-fade .9s ease-out 2.1s forwards;
}
.pt-glow {
  opacity: 0;
  animation: pt-fade 2.4s ease-out .2s forwards, pt-breathe 5s ease-in-out 2.6s infinite;
}
.pt-meta {
  opacity: 0;
  animation: pt-fade .9s ease-out .8s forwards;
}
.pt-bar {
  transform: scaleX(0);
  animation: pt-progress var(--dur) cubic-bezier(.6, 0, .2, 1) forwards;
}

@keyframes pt-draw  { to { stroke-dashoffset: 0; } }
@keyframes pt-fill  { to { fill-opacity: 1; stroke-opacity: 0; } }
@keyframes pt-fade  { to { opacity: 1; fill-opacity: 1; } }
@keyframes pt-progress { to { transform: scaleX(1); } }
@keyframes pt-breathe {
  0%, 100% { transform: scale(1);    opacity: 1; }
  50%      { transform: scale(1.08); opacity: .75; }
}

@media (prefers-reduced-motion: reduce) {
  .pt-ink  { animation: none; fill-opacity: 1; stroke-opacity: 0; stroke-dashoffset: 0; }
  .pt-halo { animation: none; fill-opacity: 1; }
  .pt-glow, .pt-meta { animation: none; opacity: 1; }
  .pt-bar  { animation: none; transform: scaleX(1); }
  .pt-root animateTransform { display: none; }
}
`;

export default Preloader;