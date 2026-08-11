import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";

/**
 * Progressive blur-up image (docs/06 §3.5) — critical to the feel.
 *
 * 1. Instantly render a placeholder: a CSS-blurred low-res thumbnail if a
 *    `placeholder` data URI is given, otherwise a solid average-color block.
 * 2. Load the full image lazily (below fold) or eagerly (LCP hero).
 * 3. On load, cross-fade the full image over --dur-base and drop the blur.
 * 4. Explicit width/height always → no layout shift.
 *
 * `avgColor` is a hex computed on upload (ops) and stored per photo.
 */
export function SmartImage({
  src,
  alt,
  width,
  height,
  avgColor = "var(--color-wheat)",
  placeholder,
  eager = false,
  cover = false,
  className,
  imgClassName,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  avgColor?: string;
  /** Optional tiny blurred thumbnail as a data URI. */
  placeholder?: string;
  /** True for above-the-fold LCP images (eager + high priority). */
  eager?: boolean;
  /** Fill the parent box (skip the aspect-ratio lock) — full-bleed heroes. */
  cover?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // No src means NO <img>. `src=""` is not "no image" to a browser — it
  // resolves against the current URL, fetches the HTML page, fails to decode
  // it, and paints the broken-image glyph. Those are the little icons that
  // have been floating around the guide profile, the matcher, the messages
  // thread and the journal: every avatar_url that is null (trekkers, ops, and
  // guides still in review) produced one.
  const hasSrc = typeof src === "string" && src.trim().length > 0;

  // Cached images can finish loading before hydration, so the onLoad event
  // never fires on the client. Reconcile against the actual element state.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  // Without a source, render the placeholder alone: warm wheat and contour
  // lines, the designed empty state, with the alt text still available to
  // assistive tech.
  if (!hasSrc) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={cn("overflow-hidden placeholder-contour", !cover && "relative", className)}
        style={{
          ...(cover ? {} : { aspectRatio: `${width} / ${height}` }),
          backgroundColor: avgColor,
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden",
        // cover mode positions via the caller's className (e.g. absolute inset-0)
        !cover && "relative",
        // Warm wheat + contour lines while empty — never flat grey (§5).
        !loaded && "placeholder-contour",
        className,
      )}
      style={{
        ...(cover ? {} : { aspectRatio: `${width} / ${height}` }),
        backgroundColor: avgColor,
      }}
    >
      {placeholder && !loaded && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? "eager" : "lazy"}
        decoding={eager ? "sync" : "async"}
        fetchPriority={eager ? "high" : undefined}
        onLoad={() => setLoaded(true)}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-base ease-out-soft",
          loaded ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
    </div>
  );
}
