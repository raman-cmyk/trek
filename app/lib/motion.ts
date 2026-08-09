import { useEffect, useState } from "react";

/**
 * Motion tokens (docs/06-interaction-motion-spec.md §2).
 *
 * These mirror the CSS custom properties defined in app/app.css so motion
 * values can also be read from JS (e.g. the finger-tracked <Sheet> drag).
 * The single source of truth for CSS-driven motion stays the stylesheet;
 * this object is for imperative/JS-driven motion only.
 */
export const ease = {
  outSoft: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOutSoft: "cubic-bezier(0.65, 0, 0.35, 1)",
  press: "cubic-bezier(0.4, 0, 0.6, 1)",
} as const;

export const duration = {
  instant: 120,
  quick: 220,
  base: 300,
  slow: 450,
} as const;

/** Press feedback scale (§2). */
export const pressScale = 0.97;

/**
 * `prefers-reduced-motion` (§2) — mandatory. Returns true when the user has
 * requested reduced motion; primitives use it to drop transforms/shimmer and
 * fall back to opacity-only fades.
 *
 * SSR-safe: starts false on the server and first client render (matching
 * markup), then reconciles after mount. Motion-off is the safe post-mount
 * state, so a one-frame flash of motion for reduced-motion users is avoided
 * by only *enabling* motion once we've confirmed it's allowed.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Detects a coarse (touch) pointer so <Sheet> can pick bottom-sheet vs modal. */
export function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}
