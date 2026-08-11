import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";

/**
 * A horizontal row of cards that admits it scrolls.
 *
 * The old rows clipped their last card flat against the viewport edge with no
 * arrow, no fade and no hint — which reads as a layout bug, not as "there is
 * more this way". Three affordances, all of which have to agree with the
 * actual scroll position:
 *
 *   · a gradient mask on whichever edge has content behind it
 *   · arrows, shown only on pointer devices and only when they would do
 *     something
 *   · snap points, so a nudge lands on a card edge rather than mid-card
 *
 * The scroll state is read from the element, never assumed: a row that fits
 * its container gets no arrows and no fade at all.
 */
export function Rail({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  /** For the arrows' accessible names — "Scroll {label} left". */
  label?: string;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const n = el.current;
    if (!n) return;
    const max = n.scrollWidth - n.clientWidth;
    // 2px of slack: sub-pixel layout leaves scrollLeft at 0.5 at rest.
    setEdges({ left: n.scrollLeft > 2, right: n.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const n = el.current;
    if (!n) return;
    measure();
    n.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(n);
    return () => {
      n.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);

  const nudge = (dir: 1 | -1) => {
    const n = el.current;
    if (!n) return;
    // Most of a screenful, so a click always clears at least one whole card
    // but never jumps past something unseen.
    n.scrollBy({ left: dir * n.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      {/* Masks sit above the cards and below the arrows, and never eat clicks. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-paper to-transparent transition-opacity duration-slow",
          edges.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-paper to-transparent transition-opacity duration-slow",
          edges.right ? "opacity-100" : "opacity-0",
        )}
      />

      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          onClick={() => nudge(side === "left" ? -1 : 1)}
          aria-label={`Scroll ${label ?? "row"} ${side}`}
          tabIndex={edges[side] ? 0 : -1}
          className={cn(
            "absolute top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full",
            "border border-line bg-paper text-ink shadow-sm transition-opacity duration-slow",
            "hover:border-sage md:flex",
            side === "left" ? "-left-3" : "-right-3",
            edges[side] ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d={side === "left" ? "M12.5 4L6.5 10l6 6" : "M7.5 4l6 6-6 6"}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}

      <div
        ref={el}
        className={cn(
          "flex snap-x snap-mandatory items-stretch overflow-x-auto scroll-pl-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
