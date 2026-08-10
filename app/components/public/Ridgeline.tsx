/**
 * The signature — the ridgeline (Brand System §6).
 *
 * ONE hand-cut mountain silhouette, used in exactly three places and nowhere
 * else: under hero/profile-header photos, at pine/mist → paper section joins,
 * and (flipped) above the footer. One path only — repetition is what makes it
 * a signature. Do not generate variants.
 */
export function Ridgeline({
  fill = "paper",
  flip = false,
  className = "",
}: {
  /** Token name for the cut colour — the surface the ridgeline reveals. */
  fill?: "paper" | "pine" | "mist";
  /** Flip vertically for section-top / above-footer placements. */
  flip?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`block w-full ${className}`}
      style={{
        height: "clamp(40px, 6vw, 120px)",
        marginTop: flip ? 0 : "-1px",
        marginBottom: flip ? "-1px" : 0,
        transform: flip ? "scaleY(-1)" : undefined,
      }}
    >
      <path
        d="M0,120 L0,64 C120,64 180,18 268,20 C356,22 402,72 494,70
           C586,68 640,30 742,34 C844,38 892,78 986,74
           C1080,70 1140,26 1246,30 C1352,34 1392,66 1440,62
           L1440,120 Z"
        fill={`var(--color-${fill})`}
      />
    </svg>
  );
}
