import { cn } from "~/lib/cn";
import { Glyph, type ChipGlyph } from "./Chip";

/**
 * What a card shows when there is no photograph (docs/07, principle 3).
 *
 * Most guides and many trips have no picture yet, and a grid of forty
 * identical tan rectangles was what the site showed for them. The contour
 * pattern stays — it is the designed empty state — and one mark on it says
 * what kind of thing this is: the guide's initial, the trip's glyph. Never
 * flat, never grey, never a broken-image icon.
 */
export function Fallback({
  initial,
  glyph,
  className,
}: {
  /** A single letter — a person. */
  initial?: string | null;
  /** A kind — a trip, a route, a journal. */
  glyph?: ChipGlyph;
  className?: string;
}) {
  const letter = (initial ?? "").trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className={cn("placeholder-contour absolute inset-0 flex items-center justify-center", className)}
    >
      {letter ? (
        <span className="font-display text-[5rem] leading-none text-pine/25 sm:text-[6rem]">{letter}</span>
      ) : glyph ? (
        <Glyph name={glyph} className="h-14 w-14 text-pine/25" />
      ) : null}
    </div>
  );
}
