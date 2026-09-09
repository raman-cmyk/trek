import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { oklchCss, paletteAt } from "~/lib/climb";
import { normaliseBlock, parsePairs, type RouteBlock } from "~/lib/route-blocks";
import { cn } from "~/lib/cn";

/**
 * A route page, rendered from its blocks.
 *
 * The Langtang page proved the shape: a photograph and a paragraph per day,
 * the page colour climbing with the altitude. This renders that same treatment
 * from data — the `climb_day` block carries the altitude, and the background
 * comes from the same palette function the bespoke page uses, so the two
 * cannot drift into looking like different products.
 *
 * Every block is server-rendered. No block waits on JavaScript to show its
 * words: this is the page Google reads and the page a trekker on 3G in a
 * Kathmandu guesthouse reads, and they should be the same page.
 */
export function RouteBlocks({
  blocks,
  guides,
  stops,
}: {
  blocks: RouteBlock[];
  /** For the "who leads it" block — the page already loads them. */
  guides?: Array<{ slug: string; full_name: string; avatar_url: string | null; home_district: string | null }>;
  /** For the elevation block — the route's own day stops. */
  stops?: Array<{ day: number; place: string; altitude_m: number }>;
}) {
  return (
    <>
      {blocks.map((b) => (
        <Block key={b.id} block={b} guides={guides} stops={stops} />
      ))}
    </>
  );
}

function Block({
  block,
  guides,
  stops,
}: {
  block: RouteBlock;
  guides?: Array<{ slug: string; full_name: string; avatar_url: string | null; home_district: string | null }>;
  stops?: Array<{ day: number; place: string; altitude_m: number }>;
}) {
  const d = normaliseBlock(block.kind, block.data);

  switch (block.kind) {
    case "hero":
      return (
        <section className="relative isolate overflow-hidden">
          {d.image && (
            <SmartImage
              src={d.image}
              alt=""
              width={1600}
              height={900}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {/* A scrim, not a tint: the words sit on a fixed dark ground, so a
              bright photograph and a dark one read the same. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />
          <div className="relative mx-auto max-w-4xl px-4 py-24 sm:py-32">
            {d.eyebrow && (
              <p className="label text-white/80">{d.eyebrow}</p>
            )}
            <h1 className="mt-2 font-display text-4xl text-white sm:text-6xl">{d.title}</h1>
            {d.standfirst && (
              <p className="mt-3 max-w-2xl text-lg leading-relaxed text-white/90">
                {d.standfirst}
              </p>
            )}
          </div>
        </section>
      );

    case "prose":
      return (
        <Wrap>
          {d.heading && <h2 className="font-display text-2xl text-ink">{d.heading}</h2>}
          <div className="mt-2 space-y-4">
            {String(d.body ?? "")
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((p: string, i: number) => (
                <p key={i} className="text-[17px] leading-relaxed text-ink">
                  {p}
                </p>
              ))}
          </div>
        </Wrap>
      );

    case "stats":
      return (
        <Wrap>
          {d.heading && <h2 className="mb-3 font-display text-2xl text-ink">{d.heading}</h2>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {parsePairs(d.items).map(([label, value]) => (
              <div key={label} className="rounded-card border border-border bg-card p-3">
                <dt className="text-caption text-ink-soft">{label}</dt>
                <dd className="mt-0.5 font-mono text-lg text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Wrap>
      );

    case "climb_day": {
      // The same palette the bespoke Langtang page uses, from the same
      // function — a second implementation would drift within a month.
      const p = paletteAt(Number(d.altitude) || 0);
      const bg = oklchCss(p.bg);
      const fg = oklchCss(p.fg);
      return (
        <section style={{ backgroundColor: bg, color: fg }}>
          <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-sm opacity-70">Day {d.day}</span>
              <span className="font-mono text-sm opacity-70">
                {Number(d.altitude).toLocaleString("en-US")} m
              </span>
            </div>
            <h2 className="mt-1 font-display text-3xl sm:text-4xl">{d.place}</h2>
            {d.image && (
              <SmartImage
                src={d.image}
                alt={d.place}
                width={1400}
                height={900}
                className="mt-5 aspect-[3/2] w-full rounded-card object-cover"
              />
            )}
            {d.text && (
              <p className="mt-5 max-w-2xl text-[17px] leading-relaxed opacity-90">{d.text}</p>
            )}
          </div>
        </section>
      );
    }

    case "itinerary":
      return (
        <Wrap>
          {d.heading && <h2 className="mb-3 font-display text-2xl text-ink">{d.heading}</h2>}
          <ol className="divide-y divide-border rounded-card border border-border bg-card">
            {parsePairs(d.days).map(([label, text], i) => (
              <li key={i} className="flex flex-wrap gap-x-3 gap-y-0.5 p-3">
                <span className="w-20 shrink-0 font-mono text-caption text-ink-soft">{label}</span>
                <span className="min-w-0 flex-1 text-sm text-ink">{text}</span>
              </li>
            ))}
          </ol>
        </Wrap>
      );

    case "elevation": {
      const points = (stops ?? []).filter((s) => Number.isFinite(s.altitude_m));
      if (points.length < 2) return null;
      const max = Math.max(...points.map((s) => s.altitude_m));
      const min = Math.min(...points.map((s) => s.altitude_m));
      const span = Math.max(1, max - min);
      const path = points
        .map((s, i) => {
          const x = (i / (points.length - 1)) * 100;
          const y = 100 - ((s.altitude_m - min) / span) * 100;
          return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
      return (
        <Wrap>
          {d.heading && <h2 className="font-display text-2xl text-ink">{d.heading}</h2>}
          {d.note && <p className="mt-1 text-sm text-ink-soft">{d.note}</p>}
          <figure className="mt-3 overflow-hidden rounded-card border border-border bg-card p-4">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-40 w-full sm:h-56"
              role="img"
              aria-label={`Elevation from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")} metres`}
            >
              <path d={`${path} L100,100 L0,100 Z`} className="fill-mist" />
              <path d={path} className="stroke-moss" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
            <figcaption className="mt-2 flex justify-between font-mono text-caption text-ink-soft">
              <span>{points[0].place}</span>
              <span>{max.toLocaleString("en-US")} m</span>
              <span>{points[points.length - 1].place}</span>
            </figcaption>
          </figure>
        </Wrap>
      );
    }

    case "gallery": {
      const photos = parsePairs(d.photos);
      return (
        <Wrap>
          {d.heading && <h2 className="mb-3 font-display text-2xl text-ink">{d.heading}</h2>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map(([src, caption], i) => (
              <figure key={i}>
                <SmartImage
                  src={src}
                  alt={caption}
                  width={800}
                  height={600}
                  className="aspect-[4/3] w-full rounded-card object-cover"
                />
                {caption && (
                  <figcaption className="mt-1 text-caption text-ink-soft">{caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </Wrap>
      );
    }

    case "quote":
      return (
        <Wrap>
          <figure className="rounded-card bg-mist p-6">
            <blockquote className="font-display text-2xl leading-snug text-ink">
              “{d.text}”
            </blockquote>
            <figcaption className="mt-3 text-sm text-ink-soft">
              {d.who}
              {d.role ? ` · ${d.role}` : ""}
            </figcaption>
          </figure>
        </Wrap>
      );

    case "faq": {
      const items = parsePairs(d.items);
      return (
        <Wrap>
          {d.heading && <h2 className="mb-3 font-display text-2xl text-ink">{d.heading}</h2>}
          <div className="divide-y divide-border rounded-card border border-border bg-card">
            {items.map(([q, a], i) => (
              <details key={i} className="group p-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-start justify-between gap-3 text-sm font-medium text-ink">
                  {q}
                  <span aria-hidden="true" className="shrink-0 text-ink-soft group-open:rotate-180">
                    ⌄
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{a}</p>
              </details>
            ))}
          </div>
        </Wrap>
      );
    }

    case "guides": {
      const list = guides ?? [];
      if (list.length === 0) return null;
      return (
        <Wrap>
          <h2 className="font-display text-2xl text-ink">
            {d.heading || "The guides who walk it"}
          </h2>
          {d.note && <p className="mt-1 text-sm text-ink-soft">{d.note}</p>}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((g) => (
              <li key={g.slug}>
                <Link
                  to={`/guides/${g.slug}`}
                  className="flex items-center gap-3 rounded-card border border-border bg-card p-3 hover:border-moss"
                >
                  <SmartImage
                    src={g.avatar_url ?? ""}
                    alt=""
                    width={48}
                    height={48}
                    className="h-11 w-11 shrink-0 rounded-full"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{g.full_name}</span>
                    {g.home_district && (
                      <span className="block truncate text-caption text-ink-soft">
                        {g.home_district}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Wrap>
      );
    }

    default:
      return null;
  }
}

function Wrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mx-auto max-w-4xl px-4 py-10", className)}>{children}</section>
  );
}
