import { NUMBERED } from "~/lib/apply-flow";
import { cn } from "~/lib/cn";

/**
 * Progress as a climb, not a bar.
 *
 * A progress bar says "you are 40% of the way through a chore". This page is
 * asking a mountain guide for ten minutes, and the site already draws
 * elevation profiles everywhere else — so the five steps are waypoints
 * gaining height, in the one chart every person on this site reads fluently.
 *
 * It is an ordered list underneath, so with no CSS and no JavaScript it is
 * still "01 YOU, 02 YOUR WORK…" with the current one marked. The line is a
 * decorative SVG behind it.
 */
export function TrailProgress({ current, className }: { current: number; className?: string }) {
  const n = NUMBERED.length;
  // Waypoints climb left to right, with a little unevenness so it reads as
  // terrain rather than as a ramp.
  const height = [18, 42, 34, 66, 88];
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (i: number) => 100 - height[i];
  const line = NUMBERED.map((_, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(i)}`).join(" ");
  const doneTo = Math.min(current, n) - 1;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-12 w-full"
      >
        <path d={line} fill="none" stroke="var(--color-line)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {doneTo > 0 && (
          <path
            d={NUMBERED.slice(0, doneTo + 1).map((_, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(i)}`).join(" ")}
            fill="none"
            stroke="var(--color-pine)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <ol className="relative grid grid-cols-5 gap-1 pt-12">
        {NUMBERED.map((s, i) => {
          const done = s.index < current;
          const here = s.index === current;
          return (
            <li key={s.id} className="flex flex-col items-center gap-1.5 text-center">
              <span
                aria-hidden="true"
                className={cn(
                  "-mt-[1.6rem] block h-2.5 w-2.5 rounded-full ring-2 ring-paper transition-colors duration-quick",
                  here ? "bg-chartreuse" : done ? "bg-pine" : "border border-line bg-paper",
                )}
                style={{ transform: `translateY(${-(height[i] - 18) * 0.42}px)` }}
              />
              <span
                className={cn(
                  "font-mono text-[10px] uppercase leading-tight tracking-[0.08em] sm:text-caption",
                  here ? "text-ink" : done ? "text-moss" : "text-muted",
                )}
              >
                <span className="block">{String(s.index).padStart(2, "0")}</span>
                <span className="hidden sm:block">{s.label}</span>
              </span>
              {here && <span className="sr-only">(current step)</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
