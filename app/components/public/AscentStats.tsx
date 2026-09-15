import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { Glyph, type ChipGlyph } from "~/components/design/Chip";
import { cn } from "~/lib/cn";

/**
 * The five numbers, as a climb.
 *
 * They used to be five identical tiles in a flat green band — same size, same
 * weight, same spacing, read left to right and forgotten. Which is the wrong
 * shape twice over. It says every number matters equally, and they do not:
 * "$0 taken on rescue flights" is a claim about whether you come home, and it
 * was sitting at the same weight as how many districts we cover. And a row of
 * tiles is what every marketplace has; it is the least this company could say
 * about itself in the one band where it says anything at all.
 *
 * So the band is a ridgeline and the numbers are waypoints on it, gaining
 * height left to right, the way a trek profile reads — which is the one chart
 * every person on this site already knows how to read. The summit is the
 * rescue-flight number, because that is the summit.
 *
 * The first waypoint carries real faces rather than a glyph. "49 verified
 * guides" is an abstraction; four people looking at you is the argument this
 * whole company makes, and we already have their photographs on the page.
 *
 * Structure, deliberately: the figures sit in ordinary document flow inside a
 * grid, and the ridge is a decorative SVG behind them. With no JavaScript and
 * no CSS this is still a list of five labelled numbers — it is the primary SEO
 * surface, and it degrades to itself.
 */

export interface AscentStat {
  /** The figure, already formatted — "1,128", "$607". */
  value: string;
  label: string;
  glyph: ChipGlyph;
  href?: string;
  /** The last one gets the summit mark. */
  summit?: boolean;
}

export interface AscentFace {
  slug: string;
  name: string;
  avatar: string | null;
}

/**
 * The ridge, and where the numbers stand on it.
 *
 * These two are one thing and must not drift apart. The SVG is 1000 units wide
 * with y running 0 (top) to 100 (bottom), drawn inside the same max-w-6xl box
 * as the grid and exactly `--ascent-floor` tall — which is also the unit each
 * number is lifted by. So the y of a peak and the lift of the number above it
 * are the same measurement, and the number stands on the line rather than near
 * it.
 *
 * PEAK_X is where each number's foot falls: the left edge of its column plus
 * the small inset that puts the mark under the figure rather than under the
 * column. Five equal columns with a 1rem gutter put those at roughly 0%, 20%,
 * 40%, 61% and 81% of the width, and the gutter is small enough against the
 * container that this holds from 1024px up without recalculating.
 *
 * Which is exactly why the ridge is lg-only. Below that the grid is three
 * columns or two, and one fixed path cannot pass through the feet of both a
 * five-column row and a three-column one. Rather than a line that misses, the
 * smaller layouts get no line and no lift — see --ascent-floor, which is 0
 * until lg for that reason.
 */
const PEAK_Y = [80, 66, 58, 38, 16];

/** Each number's lift off the floor, as a fraction of the ridge's own height. */
const RISE = PEAK_Y.map((y) => (100 - y) / 100);

/**
 * Between the peaks the line wanders, because a ridge does. Evenly stepped it
 * reads as a bar chart, which is the thing this is trying not to be.
 */
const RIDGE_D =
  "M0,88 L13,80 L60,85 L110,76 L160,81 L216,66 L270,72 L320,64 L370,70 " +
  "L419,58 L470,64 L520,55 L570,61 L622,38 L670,45 L720,36 L770,43 " +
  "L825,16 L880,23 L940,14 L1000,9";

export function AscentStats({
  stats,
  faces,
}: {
  stats: AscentStat[];
  /** A handful of real guides for the first waypoint. */
  faces: AscentFace[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);

  // The ridge draws itself once, when the band is reached. An observer rather
  // than a scroll handler: this fires twice in the life of the page instead of
  // on every frame, which matters on the phone this is mostly read on.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      setLit(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLit(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      aria-label="Guides of Nepal in numbers"
      className="border-y border-line bg-mist pb-4"
    >
      <div // No bottom padding, on purpose. The ridge strip is pinned to this box's
        // bottom edge and each number is lifted off that same edge, so any
        // padding here would push every number up by it and leave the feet
        // hanging above the line — which is exactly what it did.
        className="relative mx-auto max-w-6xl overflow-hidden px-4 pb-0 pt-9 lg:pt-12">
        {/* The ridge is a floor, not a backdrop. It occupies a fixed strip at
            the bottom of the band and every number stands on top of its own
            point — the first attempt drew it full-bleed behind everything and
            the line went straight through four of the five labels.

            Fixed pixel height, not a percentage, because the lift applied to
            each number is computed from the same number in CSS. If these two
            stop agreeing the numbers float off the line. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-4 bottom-0 hidden h-[var(--ascent-floor)] lg:block"
        >
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id="ascent-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-sage)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-sage)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Contour rules, under the line only — as faint as paper grain. */}
            {[76, 52, 28].map((y) => (
              <line
                key={y}
                x1="0"
                x2="1000"
                y1={y}
                y2={y}
                stroke="var(--color-sage)"
                strokeWidth="0.6"
                strokeDasharray="2 8"
                opacity="0.55"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={`${RIDGE_D} L1000,100 L0,100 Z`} fill="url(#ascent-fill)" />
            <path
              d={RIDGE_D}
              fill="none"
              stroke="var(--color-moss)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={cn("ascent-ridge", lit && "is-drawn")}
            />
          </svg>
        </div>

        <ol className="relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:items-end lg:grid-cols-5">
          {stats.map((s, i) => (
            <Waypoint
              key={s.label}
              stat={s}
              rise={RISE[i] ?? 0}
              index={i}
              lit={lit}
              faces={i === 0 ? faces : undefined}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function Waypoint({
  stat,
  rise,
  index,
  lit,
  faces,
}: {
  stat: AscentStat;
  rise: number;
  index: number;
  lit: boolean;
  faces?: AscentFace[];
}) {
  const body = (
    <>
      {/* The mark on the ridge: faces where we have them, the glyph otherwise,
          and a ring on the summit so the eye lands there last and stays. */}
      {faces?.length ? (
        <span className="mb-2 flex items-center -space-x-2">
          {faces.slice(0, 4).map((f) => (
            <SmartImage
              key={f.slug}
              src={f.avatar ?? ""}
              alt=""
              width={30}
              height={30}
              cover
              className="h-[30px] w-[30px] rounded-full ring-2 ring-mist"
              imgClassName="rounded-full"
            />
          ))}
        </span>
      ) : (
        <span
          className={cn(
            "mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full",
            stat.summit
              ? "bg-pine text-chartreuse ring-4 ring-chartreuse/25"
              : "bg-card text-moss",
          )}
        >
          <Glyph name={stat.glyph} />
        </span>
      )}
      <span
        className={cn(
          "block font-mono leading-none text-ink",
          stat.summit ? "text-[2rem] lg:text-4xl" : "text-2xl lg:text-[1.75rem]",
        )}
      >
        {stat.value}
      </span>
      <span className="mt-1.5 block text-[13px] uppercase leading-tight tracking-[0.07em] text-muted">
        {stat.label}
      </span>
    </>
  );

  return (
    <li
      // How high this number stands. A bottom margin rather than a transform,
      // so the items still occupy real space in the row and nothing overlaps a
      // neighbour at an awkward width. The multiplier is the ridge's own
      // height, so the foot below lands on the line rather than near it.
      style={{
        marginBottom: `calc(var(--ascent-floor) * ${rise})`,
        animationDelay: lit ? `${index * 70}ms` : undefined,
      }}
      className={cn("ascent-waypoint group relative lg:pb-5", lit && "is-lit")}
    >
      {stat.href ? (
        <Link
          to={stat.href}
          prefetch="intent"
          className="block transition-colors duration-instant hover:text-moss"
        >
          {body}
        </Link>
      ) : (
        <div>{body}</div>
      )}

      {/* The foot: a hairline dropping to the ridge and a marker sitting on
          it, so each number is visibly standing on the line rather than
          floating above it. The summit's is filled. */}
      <span aria-hidden className="pointer-events-none absolute bottom-0 left-[0.9rem] hidden flex-col items-center lg:flex">
        <span className="h-3.5 w-px bg-moss/35" />
        <span
          className={cn(
            "-mb-[3.5px] h-[7px] w-[7px] rounded-full",
            stat.summit ? "bg-pine ring-4 ring-chartreuse/30" : "bg-moss/70",
          )}
        />
      </span>
    </li>
  );
}
