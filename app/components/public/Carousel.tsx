import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { SmartImage } from "~/components/SmartImage";

export interface Photo {
  url: string;
  alt: string;
  credit?: string | null;
  avgColor?: string;
}

/**
 * Photo carousel with dot pagination (docs/06 §7). Arrows on desktop hover,
 * swipeable on touch. Dots cap at 5 with edge-shrinking. SSR renders the first
 * image so the page has complete HTML with JS disabled.
 */
export function Carousel({
  photos,
  aspect = "16/9",
  rounded = true,
  autoMs = 0,
}: {
  photos: Photo[];
  aspect?: string;
  rounded?: boolean;
  /** Turn itself over every N ms. 0 is off, which is the default. */
  autoMs?: number;
}) {
  const [i, setI] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const n = photos.length;
  const go = (d: number) => setI((p) => (p + d + n) % n);

  // Turning over on its own, but only when there is more than one picture,
  // only when nobody is looking at a particular one, and never for somebody
  // who has asked their machine to stop things moving (docs/06).
  const still = useRef(false);
  useEffect(() => {
    still.current =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);
  useEffect(() => {
    if (!autoMs || n < 2 || held || still.current) return;
    const id = setInterval(() => setI((p) => (p + 1) % n), autoMs);
    return () => clearInterval(id);
  }, [autoMs, n, held]);

  if (photos.length === 0) return null;

  return (
    <div
      className={cn("relative overflow-hidden", rounded && "rounded-card")}
      style={{ aspectRatio: aspect }}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      onTouchStart={(e) => {
        setHeld(true);
        setTouchX(e.touches[0].clientX);
      }}
      onTouchEnd={(e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        setTouchX(null);
      }}
    >
      {photos.map((p, idx) => (
        <div
          key={idx}
          className={cn(
            "absolute inset-0 transition-opacity duration-base ease-out-soft",
            idx === i ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <SmartImage
            src={p.url}
            alt={p.alt}
            width={1600}
            height={900}
            avgColor={p.avgColor}
            eager={idx === 0}
            className="h-full w-full"
          />
          {p.credit && (
            <span className="absolute bottom-2 left-2 rounded-pill bg-black/40 px-2 py-0.5 text-xs text-white">
              {p.credit}
            </span>
          )}
        </div>
      ))}

      {n > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 rounded-full bg-card/90 text-ink shadow-card hover:bg-card sm:block"
          >
            ‹
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 rounded-full bg-card/90 text-ink shadow-card hover:bg-card sm:block"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.slice(0, 5).map((_, d) => (
              <span
                key={d}
                className={cn(
                  "h-1.5 rounded-full bg-white transition-all",
                  d === Math.min(i, 4) ? "w-4 opacity-100" : "w-1.5 opacity-60",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
