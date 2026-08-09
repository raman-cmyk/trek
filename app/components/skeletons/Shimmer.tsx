import { cn } from "~/lib/cn";

/**
 * The single reusable shimmer block (docs/06 §3.2). A diagonal light gradient
 * sweeps left→right, ~1.4s loop. Warm greys, never blue-grey.
 *
 * Under `prefers-reduced-motion` the global rule in app.css freezes the
 * animation, leaving a static muted block — the spec's required fallback.
 *
 * Every skeleton is built from this block so there is exactly one shimmer
 * implementation in the app.
 */
export function Skeleton({
  className,
  rounded = "md",
}: {
  className?: string;
  rounded?: "none" | "sm" | "md" | "lg" | "full" | "card";
}) {
  const radius = {
    none: "rounded-none",
    sm: "rounded",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
    card: "rounded-[12px]",
  }[rounded];

  return (
    <div
      aria-hidden="true"
      className={cn("animate-shimmer bg-skeleton-base", radius, className)}
      style={{
        backgroundImage:
          "linear-gradient(100deg, var(--color-skeleton-base) 40%, var(--color-skeleton-highlight) 50%, var(--color-skeleton-base) 60%)",
        backgroundSize: "200% 100%",
      }}
    />
  );
}
