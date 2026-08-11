import { useMemo, useState } from "react";

export interface DayStop {
  day: number;
  place: string;
  altitude_m: number;
  lng?: number;
  lat?: number;
  note?: string;
}

/**
 * The route profile, scrubbable.
 *
 * Move along it and the day, the village and the altitude change appear
 * underneath. It renders as a static SVG first — the whole profile is legible
 * with no JavaScript at all, which matters because route pages are the SEO
 * surface and are read by people on slow connections.
 *
 * Pointer events rather than mouse events so a thumb on a phone works the same
 * as a cursor.
 */
export function ElevationScrubber({
  stops,
  onDayChange,
  activeDay,
}: {
  stops: DayStop[];
  /** Lets a parent (the map) follow the scrub. */
  onDayChange?: (day: number | null) => void;
  activeDay?: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const day = hover ?? activeDay ?? null;

  const { pts, minAlt, maxAlt, W, H, x, y } = useMemo(() => {
    const W = 800;
    const H = 220;
    const padX = 10;
    const padTop = 24;
    const padBottom = 34;
    const alts = stops.map((s) => s.altitude_m);
    const maxAlt = Math.max(...alts);
    const minAlt = Math.min(...alts);
    const span = Math.max(1, maxAlt - minAlt);
    const x = (i: number) => padX + (i / Math.max(1, stops.length - 1)) * (W - padX * 2);
    const y = (m: number) => padTop + (1 - (m - minAlt) / span) * (H - padTop - padBottom);
    return {
      pts: stops.map((s, i) => ({ ...s, cx: x(i), cy: y(s.altitude_m) })),
      minAlt,
      maxAlt,
      W,
      H,
      x,
      y,
    };
  }, [stops]);

  if (stops.length < 2) return null;

  const line = pts.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(" ");
  const area = `${pts[0].cx},${H - 34} ${line} ${pts[pts.length - 1].cx},${H - 34}`;
  const idx = day == null ? -1 : pts.findIndex((p) => p.day === day);
  const active = idx >= 0 ? pts[idx] : null;
  const prev = idx > 0 ? pts[idx - 1] : null;
  const delta = active && prev ? active.altitude_m - prev.altitude_m : null;

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.cx - rel);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(pts[best].day);
    onDayChange?.(pts[best].day);
  }

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => {
          setHover(null);
          onDayChange?.(null);
        }}
        role="img"
        aria-label={`Elevation profile over ${stops.length} days, from ${minAlt} to ${maxAlt} metres.`}
      >
        <polygon points={area} fill="var(--color-sage)" opacity="0.3" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-pine)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {active && (
          <line
            x1={active.cx}
            x2={active.cx}
            y1={16}
            y2={H - 34}
            stroke="var(--color-moss)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        {pts.map((p) => (
          <circle
            key={p.day}
            cx={p.cx}
            cy={p.cy}
            r={active?.day === p.day ? 5 : 2.5}
            fill={active?.day === p.day ? "var(--color-chartreuse)" : "var(--color-pine)"}
            stroke="var(--color-paper)"
            strokeWidth={active?.day === p.day ? 1.5 : 0}
          />
        ))}
        {/* Day ruler — every day for short routes, every third for long ones. */}
        {pts.map((p, i) =>
          pts.length <= 12 || i % 3 === 0 || active?.day === p.day ? (
            <text
              key={"t" + p.day}
              x={p.cx}
              y={H - 14}
              textAnchor="middle"
              fontSize="10"
              className={
                active?.day === p.day ? "fill-[var(--color-ink)]" : "fill-[var(--color-muted)]"
              }
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {p.day}
            </text>
          ) : null,
        )}
      </svg>

      {/* The readout. Reserves its own height so scrubbing does not reflow. */}
      <figcaption className="mt-1 flex min-h-[2.75rem] flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line pt-2">
        {active ? (
          <>
            <span className="font-mono text-sm text-muted">Day {active.day}</span>
            <span className="font-medium text-ink">{active.place}</span>
            <span className="font-mono text-sm text-ink">
              {active.altitude_m.toLocaleString("en-US")} m
            </span>
            {delta != null && delta !== 0 && (
              <span
                className={
                  "font-mono text-sm " + (delta > 0 ? "text-moss" : "text-muted")
                }
              >
                {delta > 0 ? "↑" : "↓"} {Math.abs(delta).toLocaleString("en-US")} m
              </span>
            )}
            {active.note && (
              <span className="w-full text-caption text-muted">{active.note}</span>
            )}
          </>
        ) : (
          <span className="text-caption text-muted">
            Drag along the profile to see each day, the village and the climb.
          </span>
        )}
      </figcaption>
    </figure>
  );
}
