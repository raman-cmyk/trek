import { SmartImage } from "~/components/SmartImage";
import { cn } from "~/lib/cn";
import type { Profile } from "~/lib/route-cards";
import { layoutTrail, pickPins, pinSide, trailArea, trailPath, type TrailStop } from "~/lib/trail";
import { Glyph, type ChipGlyph } from "./Chip";

/**
 * A trek drawn on a picture (docs/07 — the image every reference shares):
 * a photograph, a dotted route across it, a few labelled pins.
 *
 * The photograph is optional on purpose. Most guides and many trips have no
 * cover yet, and a blank box was what the site showed for them. Without a
 * photo the scene is a terrain drawing — the contour pattern with the
 * route's own elevation profile — so a trip with no photograph still has a
 * picture that is true.
 *
 * Positions come from `layoutTrail`, in percent, so the same numbers drive
 * the SVG line and the HTML pins and nothing drifts between them.
 */
export function TrailScene({
  photo,
  alt,
  stops,
  profile,
  pins = 4,
  height = "aspect-[16/9]",
  eager = false,
  dim = true,
  draw = true,
  className,
  children,
}: {
  photo?: string | null;
  alt: string;
  stops: TrailStop[];
  /** Accepted for callers that have it; the fallback draws from `stops`. */
  profile?: Profile | null;
  /** How many stops get a label; 0 draws only the line. */
  pins?: number;
  /** Tailwind aspect / height classes for the box. */
  height?: string;
  eager?: boolean;
  /** Scrim at the foot so white type reads over any photo. */
  dim?: boolean;
  /** Animate the line in once. */
  draw?: boolean;
  className?: string;
  /** Anything laid on top: a glass panel, a title, a button. */
  children?: React.ReactNode;
}) {
  // With a caption laid over the foot of the picture, the walk keeps to the
  // upper part so no pin lands on the title.
  const box = children ? { left: 8, right: 92, top: 14, bottom: 58 } : { left: 8, right: 92, top: 16, bottom: 84 };
  const points = layoutTrail(stops, box);
  const labelled = pins > 0 ? pickPins(points, pins) : [];
  const d = trailPath(points);
  const ground = trailArea(points);
  const hasPhoto = Boolean(photo && photo.trim());
  const top = stops.length ? Math.max(...stops.map((s) => s.altitude_m)) : 0;

  return (
    <div className={cn("relative overflow-hidden rounded-photo", height, className)}>
      {hasPhoto ? (
        <SmartImage src={photo!} alt={alt} width={1600} height={900} eager={eager} cover className="absolute inset-0 h-full w-full" />
      ) : (
        // Terrain, not a blank: the contour pattern, and the ground under the
        // walk filled in from the same line the pins sit on.
        <div className="placeholder-contour absolute inset-0" aria-hidden="true" />
      )}

      {dim && hasPhoto && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/15 to-transparent" />
      )}

      {points.length > 1 && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {!hasPhoto && ground && (
            <path d={ground} fill="var(--color-sage)" fillOpacity="0.55" />
          )}
          {/* A soft dark halo under the line, so a white line survives a snowfield. */}
          <path d={d} fill="none" stroke="rgb(18 36 28 / 0.35)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke={hasPhoto ? "#ffffff" : "var(--color-pine)"}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className={cn("trail-line", draw && "trail-line-draw")}
          />
        </svg>
      )}

      {labelled.map((p, i) => {
        const summit = p.stop.altitude_m === top;
        return (
          <TrailPin
            key={p.index}
            x={p.x}
            y={p.y}
            side={pinSide(p)}
            glyph={summit ? "mountain" : i === 0 ? "walk" : i === labelled.length - 1 ? "tent" : "pin"}
            title={p.stop.place}
            sub={`Day ${p.stop.day} · ${p.stop.altitude_m.toLocaleString("en-US")} m`}
            onPhoto={hasPhoto}
            // A phone-width box holds one label comfortably: the top of the
            // walk. The rest come back at tablet width.
            className={summit ? undefined : "hidden sm:flex"}
          />
        );
      })}

      {children}
    </div>
  );
}

/**
 * One labelled point on the scene: a dot on the line, a short stem, a glass
 * pill with a glyph and one or two lines (reference 2's "Garsia Village ·
 * Villa Mexico"). Positioned in percent by the caller.
 */
export function TrailPin({
  x,
  y,
  side = "right",
  glyph = "pin",
  title,
  sub,
  onPhoto = true,
  className,
}: {
  x: number;
  y: number;
  side?: "left" | "right";
  glyph?: ChipGlyph;
  title: string;
  sub?: string;
  onPhoto?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("pointer-events-none absolute z-10 flex items-center", side === "left" && "flex-row-reverse", className)}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: side === "left" ? "translate(-100%, -50%)" : "translate(0, -50%)",
      }}
    >
      <span
        className={cn(
          "block h-2.5 w-2.5 shrink-0 rounded-full ring-2",
          onPhoto ? "bg-chartreuse ring-white" : "bg-card ring-pine",
        )}
        style={{ transform: side === "left" ? "translateX(50%)" : "translateX(-50%)" }}
      />
      <span className={cn("h-px w-3 shrink-0", onPhoto ? "bg-white/80" : "bg-pine/60")} />
      <span
        className={cn(
          "flex max-w-[11rem] items-center gap-1.5 rounded-pill px-2.5 py-1 text-left leading-tight",
          onPhoto ? "glass text-ink" : "border border-line bg-card text-ink shadow-card",
        )}
      >
        <Glyph name={glyph} className="text-moss" />
        <span className="min-w-0">
          <span className="block truncate text-caption font-semibold">{title}</span>
          {sub && <span className="block truncate font-mono text-[10px] text-muted">{sub}</span>}
        </span>
      </span>
    </div>
  );
}
