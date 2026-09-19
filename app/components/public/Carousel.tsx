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
 *
 * `size="card"` is the same thing at the size of a tile in a grid of twelve:
 * arrows only while the card is hovered or something inside it has focus,
 * smaller dots, the picture requested at card resolution rather than at
 * 1600px, and only the frames actually needed in the DOM.
 */
export function Carousel({
  photos,
  aspect = "16/9",
  rounded = true,
  autoMs = 0,
  size = "hero",
  cover = false,
  className,
  imgClassName,
}: {
  photos: Photo[];
  aspect?: string;
  rounded?: boolean;
  /** Turn itself over every N ms. 0 is off, which is the default. */
  autoMs?: number;
  size?: "hero" | "card";
  /** Crop to fill rather than fit — what a fixed-ratio card tile wants. */
  cover?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  const small = size === "card";
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
      className={cn("group/car relative overflow-hidden", rounded && "rounded-card", className)}
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
      {photos.map((p, idx) =>
        // On a card, only the frame on screen and the one after it exist.
        // Otherwise every frame sits in the DOM at opacity 0 — fine for one
        // hero, and twelve tiles × five photographs on a browse grid, all of
        // them fetched, on the cheap Android phone over 3G that rule 6 is
        // about. The first frame always renders, so the page still shows a
        // photograph with JavaScript off.
        small && idx > Math.max(i, 0) + 1 ? null : (
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
            width={small ? 400 : 1600}
            height={small ? 300 : 900}
            avgColor={p.avgColor}
            cover={cover}
            eager={idx === 0}
            className="h-full w-full"
            imgClassName={imgClassName}
          />
          {p.credit && (
            <span className="absolute bottom-2 left-2 rounded-pill bg-black/40 px-2 py-0.5 text-xs text-white">
              {p.credit}
            </span>
          )}
        </div>
        ),
      )}

      {n > 1 && (
        <>
          {/* z-20: on an OfferingCard the title link stretches an invisible
              ::after over the whole tile, and without this the arrows sit
              under it and every tap opens the trip instead of turning the
              photograph over. */}
          {[-1, 1].map((d) => (
            <button
              key={d}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                go(d);
              }}
              aria-label={d < 0 ? "Previous photo" : "Next photo"}
              className={cn(
                "absolute top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-card/90 text-ink shadow-card hover:bg-card sm:block",
                d < 0 ? "left-2" : "right-2",
                // Out of the way until somebody is actually looking at this
                // card: twelve tiles each wearing two buttons is a control
                // panel, not a grid of photographs.
                small
                  ? "h-7 w-7 text-sm opacity-0 transition-opacity duration-quick group-hover/car:opacity-100 focus-visible:opacity-100"
                  : "h-8 w-8",
              )}
            >
              {d < 0 ? "‹" : "›"}
            </button>
          ))}
          {/* On a card the guide chip overlaps the bottom edge of the
              photograph by twelve pixels and was sitting on top of the dots. */}
          <div
            className={cn(
              "absolute left-1/2 z-20 flex -translate-x-1/2 gap-1.5",
              small ? "bottom-5" : "bottom-2",
            )}
          >
            {photos.slice(0, 5).map((_, d) => (
              <span
                key={d}
                className={cn(
                  "rounded-full bg-white shadow-card transition-all",
                  small ? "h-1" : "h-1.5",
                  d === Math.min(i, 4)
                    ? cn("opacity-100", small ? "w-3" : "w-4")
                    : cn("opacity-60", small ? "w-1" : "w-1.5"),
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
