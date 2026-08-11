/**
 * The route profile as actually walked, from the altitudes the guide recorded
 * day by day. Pure SVG, no library, no client JS — it is a small chart, not an
 * application.
 *
 * Days with no recorded altitude are absent from `points` rather than
 * interpolated: this page's entire job is "this really happened", and a
 * smoothed-over number is the wrong kind of convenient.
 */
export function ElevationStrip({
  points,
  className,
}: {
  points: { day: number; m: number }[];
  className?: string;
}) {
  if (points.length < 3) return null;

  const W = 720;
  const H = 150;
  const padX = 8;
  const padTop = 18;
  const padBottom = 26;

  const days = points.map((p) => p.day);
  const alts = points.map((p) => p.m);
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const maxAlt = Math.max(...alts);
  // Floor the baseline a little under the lowest point so the line has room.
  const minAlt = Math.min(...alts) * 0.92;

  const x = (d: number) =>
    padX + ((d - minDay) / Math.max(1, maxDay - minDay)) * (W - padX * 2);
  const y = (m: number) =>
    padTop + (1 - (m - minAlt) / Math.max(1, maxAlt - minAlt)) * (H - padTop - padBottom);

  const line = points.map((p) => `${x(p.day).toFixed(1)},${y(p.m).toFixed(1)}`).join(" ");
  const area = `${padX},${H - padBottom} ${line} ${(W - padX).toFixed(1)},${H - padBottom}`;
  const peak = points.reduce((a, b) => (b.m > a.m ? b : a));

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Elevation profile: day ${minDay} to day ${maxDay}, highest point ${maxAlt.toLocaleString("en-US")} metres on day ${peak.day}.`}
      >
        <polygon points={area} fill="var(--color-sage)" opacity="0.28" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-pine)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p) => {
          const isPeak = p.day === peak.day;
          return (
            <g key={p.day}>
              <circle
                cx={x(p.day)}
                cy={y(p.m)}
                r={isPeak ? 4 : 2.5}
                fill={isPeak ? "var(--color-chartreuse)" : "var(--color-pine)"}
                stroke="var(--color-paper)"
                strokeWidth={isPeak ? 1.5 : 0}
              />
              <text
                x={x(p.day)}
                y={H - 8}
                textAnchor="middle"
                className="fill-[var(--color-muted)] font-mono"
                fontSize="10"
              >
                {p.day}
              </text>
            </g>
          );
        })}
        <text
          x={x(peak.day)}
          y={Math.max(11, y(peak.m) - 9)}
          textAnchor={peak.day > (minDay + maxDay) / 2 ? "end" : "start"}
          className="fill-[var(--color-ink)] font-mono"
          fontSize="11"
        >
          {peak.m.toLocaleString("en-US")} m
        </text>
      </svg>
      <figcaption className="mt-1 font-mono text-caption text-muted">
        day →&nbsp; altitude as recorded on the trail
      </figcaption>
    </figure>
  );
}
