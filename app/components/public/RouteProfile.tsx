import { profilePath, type Profile } from "~/lib/route-cards";

/**
 * The real shape of a trek, drawn from its day stops.
 *
 * Two variants, because the card has two backgrounds: `paper` is the whole
 * visual when a route has no photograph, and `photo` is the same line laid
 * along the bottom of one — a white ridge that reads over anything.
 */
export function RouteProfile({
  profile,
  variant = "paper",
  height = 132,
  bold = false,
  className,
  label,
}: {
  profile: Profile;
  variant?: "paper" | "photo";
  height?: number;
  bold?: boolean;
  className?: string;
  label: string;
}) {
  const W = 600;
  const { line, area, summit } = profilePath(profile, W, height);
  const photo = variant === "photo";
  // Unique per render target: two cards for the same route (featured and in
  // the grid) would otherwise share a gradient id and the second would win.
  const uid = `${label.replace(/\W+/g, "")}-${variant}-${height}`;

  return (
    <svg
      className={className ?? "block h-auto w-full"}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={`rp-${uid}`} x1="0" y1="0" x2="0" y2="1">
          {photo ? (
            <>
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="var(--color-sage)" stopOpacity="0.95" />
              <stop offset="55%" stopColor="var(--color-fern)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--color-moss)" stopOpacity="0.12" />
            </>
          )}
        </linearGradient>
      </defs>

      {!photo &&
        [0.33, 0.66].map((g) => {
          const y = 16 + g * (height - 26);
          return (
            <line
              key={g}
              x1={8}
              x2={W - 8}
              y1={y}
              y2={y}
              stroke="var(--color-line)"
              strokeWidth="1"
              strokeDasharray="2 5"
            />
          );
        })}

      <path d={area} fill={`url(#rp-${uid})`} />
      <path
        d={line}
        fill="none"
        stroke={photo ? "#ffffff" : "var(--color-pine)"}
        strokeWidth={bold ? 2.6 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={summit.x}
        cy={summit.y}
        r={bold ? 4.5 : 3.6}
        fill={photo ? "var(--color-chartreuse)" : "var(--color-card)"}
        stroke={photo ? "#ffffff" : "var(--color-pine)"}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Difficulty as four triangles, filled to the grade.
 *
 * A word alone ("strenuous") means nothing until you have read three of them;
 * the peaks are comparable at a glance down a column of cards.
 */
export function GradeGlyph({ level, label }: { level: number; label: string }) {
  return (
    <span className="flex items-end gap-[3px]" role="img" aria-label={label}>
      {[1, 2, 3, 4].map((i) => {
        const on = i <= level;
        const size = 7 + i * 2;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
            <polygon
              points="5,1 9,9 1,9"
              fill={on ? "var(--color-ink)" : "none"}
              stroke={on ? "var(--color-ink)" : "var(--color-line)"}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
}
