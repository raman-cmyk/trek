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

  // Cached images can finish loading before hydration, so the onLoad event
  // never fires on the client. Reconcile against the actual element state.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

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
