import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { TierBadge } from "~/components/public/bits";
import { RouteMap } from "~/components/public/RouteMap";
import type { DayStop } from "~/components/public/ElevationScrubber";
import { useMoney } from "~/lib/currency-context";
import { CLIMB_INK, CLIMB_PAPER, altAtScroll, oklchCss, paletteAt } from "~/lib/climb";
import {
  altitudesFor,
  normaliseBlock,
  parsePairs,
  type RouteBlock,
} from "~/lib/route-blocks";
import { cn } from "~/lib/cn";

/**
 * A route page, rendered from its blocks — and it climbs.
 *
 * The Langtang page proved the shape: one photograph and one paragraph per
 * day, the page colour cooling from forest green to alpine white as you gain
 * height, an altimeter that reads your position. That page is a TypeScript
 * constant; this is the same page from data. Not an imitation of it: the
 * same palette function, the same scroll engine, the same day frame, so a
 * page somebody builds in the console and the reference page cannot drift
 * into looking like two products.
 *
 * Every block is a `data-rest` section painted from the altitude it sits at,
 * so the colour carries between the days rather than snapping to white under
 * every paragraph. With JavaScript off each section keeps its own static
 * stop: a readable, ordered, server-rendered document — the page Google
 * reads and the page a trekker on 3G reads are the same page.
 */

export interface RoutePageData {
  name: string;
  region: string | null;
  summary: string | null;
  typical_days: number;
  max_altitude_m: number | null;
  distance_km: number | null;
  difficulty: string | null;
  season_months: number[] | null;
  month_profile: Array<{ m: number; crowds: number; weather: number; note: string }> | null;
  day_stops: DayStop[] | null;
}

export interface RouteGuide {
  slug: string;
  name: string;
  avatar: string | null;
  tier: number;
  treks: number;
}

export interface RouteOffering {
  id: string;
  slug: string;
  kind: string;
  title: string;
  days: number;
  guide_name: string;
  guide_slug: string;
  guide_day_rate_usd_cents: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function RouteBlocks({
  blocks,
  route,
  permits,
  offerings,
  guides,
}: {
  blocks: RouteBlock[];
  route: RoutePageData;
  permits: Array<{ name: string; cost_usd_cents: number; issuing_body?: string | null }>;
  offerings: RouteOffering[];
  guides: RouteGuide[];
}) {
  const alts = altitudesFor(blocks);
  const days = blocks.filter((b) => b.kind === "climb_day");
  const climbs = days.length > 0;

  // The altimeter's own profile: the trailhead, then every day.
  const railAlts = [alts[0] ?? 1400, ...days.map((b) => Number(b.data?.altitude) || 0)];
  const startPlace =
    String(blocks.find((b) => b.kind === "hero")?.data?.eyebrow ?? "") ||
    route.region ||
    "Trailhead";

  let prevAlt = railAlts[0];

  return (
    <ClimbShell enabled={climbs} railAlts={railAlts} startPlace={startPlace}>
      {blocks.map((b, i) => {
        const alt = alts[i];
        const from = prevAlt;
        if (b.kind === "climb_day") prevAlt = Number(b.data?.altitude) || prevAlt;
        return (
          <Block
            key={b.id}
            block={b}
            alt={alt}
            altFrom={from}
            eager={i < 2}
            route={route}
            permits={permits}
            offerings={offerings}
            guides={guides}
          />
        );
      })}
    </ClimbShell>
  );
}

/* ── The shell: palette engine and altimeter ───────────────────────────── */

function ClimbShell({
  enabled,
  railAlts,
  startPlace,
  children,
}: {
  enabled: boolean;
  railAlts: number[];
  startPlace: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const dayRef = useRef<HTMLSpanElement>(null);
  const altMobileRef = useRef<HTMLSpanElement>(null);
  const dayMobileRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);

  // The engine, lifted from the Langtang page: a passive, rAF-throttled
  // scroll listener interpolates altitude from the viewport's focal point and
  // writes five CSS custom properties on the container — nothing that
  // triggers layout. Reduced motion snaps per section instead.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-alt-from]"));
    if (sections.length === 0) return;

    let segs: Array<{ altFrom: number; altTo: number; top: number; height: number; day: string; place: string }> = [];
    const measure = () => {
      segs = sections.map((b) => {
        const r = b.getBoundingClientRect();
        return {
          altFrom: Number(b.dataset.altFrom),
          altTo: Number(b.dataset.altTo),
          top: r.top + window.scrollY,
          height: r.height,
          day: b.dataset.day ?? "",
          place: b.dataset.place ?? "",
        };
      });
    };
    measure();

    const paperCss = oklchCss(CLIMB_PAPER);
    const inkCss = oklchCss(CLIMB_INK);
    let lastLabel = "";
    const apply = (alt: number, seg?: { day: string; place: string }) => {
      const p = paletteAt(alt);
      const s = container.style;
      s.setProperty("--live-bg", oklchCss(p.bg));
      s.setProperty("--live-fg", oklchCss(p.fg));
      s.setProperty("--live-accent", oklchCss(p.accent));
      const fgIsPaper = p.fg[0] > 0.5;
      s.setProperty("--hud-bg", fgIsPaper ? paperCss : inkCss);
      s.setProperty("--hud-fg", fgIsPaper ? inkCss : paperCss);
      const altText = `${alt.toLocaleString("en-US")} m`;
      if (altRef.current) altRef.current.textContent = altText;
      if (altMobileRef.current) altMobileRef.current.textContent = altText;
      if (seg) {
        const label = seg.day
          ? `DAY ${seg.day.padStart(2, "0")} · ${seg.place.toUpperCase()}`
          : seg.place.toUpperCase();
        if (label !== lastLabel) {
          lastLabel = label;
          if (dayRef.current) dayRef.current.textContent = label;
          if (dayMobileRef.current) dayMobileRef.current.textContent = seg.day ? `DAY ${seg.day.padStart(2, "0")}` : "";
        }
      }
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      container.classList.add("climb-snap");
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const b = e.target as HTMLElement;
            apply(Number(b.dataset.altTo), { day: b.dataset.day ?? "", place: b.dataset.place ?? "" });
          }
        },
        { threshold: 0.45 },
      );
      sections.forEach((b) => io.observe(b));
      return () => io.disconnect();
    }

    let raf = 0;
    const lo = Math.min(...railAlts);
    const hi = Math.max(...railAlts);
    const frame = () => {
      raf = 0;
      const focal = window.scrollY + window.innerHeight * 0.5;
      const alt = altAtScroll(segs, focal);
      const seg =
        segs.find((x) => focal >= x.top && focal < x.top + x.height) ??
        segs[focal < segs[0].top ? 0 : segs.length - 1];
      apply(alt, seg);
      if (dotRef.current && segs.length) {
        const start = segs[0].top;
        const end = segs[segs.length - 1].top + segs[segs.length - 1].height;
        const prog = Math.max(0, Math.min(1, (focal - start) / (end - start)));
        const x = 4 + ((alt - lo) / Math.max(1, hi - lo)) * 20;
        dotRef.current.setAttribute("cx", x.toFixed(1));
        dotRef.current.setAttribute("cy", (6 + prog * 148).toFixed(1));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      measure();
      onScroll();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    frame();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, railAlts]);

  if (!enabled) {
    // No days to climb: a plain page in the site's own colours.
    return <div className="bg-paper text-ink">{children}</div>;
  }

  const railLo = Math.min(...railAlts);
  const railHi = Math.max(...railAlts);
  const railPts = railAlts
    .map((a, i) => {
      const y = 6 + (i / Math.max(1, railAlts.length - 1)) * 148;
      const x = 4 + ((a - railLo) / Math.max(1, railHi - railLo)) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const start = paletteAt(railAlts[0]);

  return (
    <div
      ref={containerRef}
      className="climb"
      style={
        {
          background: `var(--live-bg, ${oklchCss(start.bg)})`,
          color: `var(--live-fg, ${oklchCss(start.fg)})`,
        } as React.CSSProperties
      }
    >
      <style>{`
        .climb section[data-rest] { background: var(--live-bg, var(--sbg)); color: var(--live-fg, var(--sfg)); }
        .climb-snap, .climb-snap section[data-rest] { transition: background-color 400ms ease, color 400ms ease; }
        .climb .cv-auto { content-visibility: auto; contain-intrinsic-size: auto 100vh; }
      `}</style>

      {/* The altimeter. Desktop: a rail with the whole walk's profile and a
          dot for where you are. Mobile: a pill. Both sit on the inverted
          surface so their contrast never depends on the ramp. */}
      <div aria-hidden="true" className="fixed left-4 top-1/2 z-30 hidden -translate-y-1/2 lg:block">
        <div
          className="rounded-md px-2.5 py-3"
          style={{ background: "var(--hud-bg, oklch(0.975 0.012 120))", color: "var(--hud-fg, oklch(0.16 0.015 240))" }}
        >
          <svg width="28" height="160" viewBox="0 0 28 160" className="block">
            <polyline points={railPts} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
            <circle ref={dotRef} cx="4" cy="6" r="3.5" fill="currentColor" />
          </svg>
          <p className="mt-2 w-[7.5rem] whitespace-normal font-mono text-[10px] leading-snug tracking-[0.08em]">
            <span ref={dayRef}>{startPlace.toUpperCase()}</span>
          </p>
          <p className="font-mono text-sm tracking-tight">
            <span ref={altRef}>{railAlts[0].toLocaleString("en-US")} m</span>
          </p>
        </div>
      </div>
      <div aria-hidden="true" className="fixed right-3 top-16 z-30 lg:hidden">
        <p
          className="rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.06em]"
          style={{ background: "var(--hud-bg, oklch(0.975 0.012 120))", color: "var(--hud-fg, oklch(0.16 0.015 240))" }}
        >
          <span ref={dayMobileRef} /> <span ref={altMobileRef}>{railAlts[0].toLocaleString("en-US")} m</span>
        </p>
      </div>

      {children}
    </div>
  );
}

/** Static SSR palette for a resting section — the no-JavaScript colour. */
function sv(alt: number): React.CSSProperties {
  const p = paletteAt(alt);
  return {
    "--sbg": oklchCss(p.bg),
    "--sfg": oklchCss(p.fg),
    "--saccent": oklchCss(p.accent),
  } as React.CSSProperties;
}

/* ── One block ─────────────────────────────────────────────────────────── */

function Block({
  block,
  alt,
  altFrom,
  eager,
  route,
  permits,
  offerings,
  guides,
}: {
  block: RouteBlock;
  alt: number;
  altFrom: number;
  eager: boolean;
  route: RoutePageData;
  permits: Array<{ name: string; cost_usd_cents: number; issuing_body?: string | null }>;
  offerings: RouteOffering[];
  guides: RouteGuide[];
}) {
  const d = normaliseBlock(block.kind, block.data);
  const { m } = useMoney();

  // A resting section: painted from its altitude, text at the pole that
  // clears 4.5:1 against it — proven per stop in climb.test.ts.
  const Rest = ({
    place,
    className,
    children,
  }: {
    place: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <section
      data-rest
      data-alt-from={alt}
      data-alt-to={alt}
      data-place={place}
      style={sv(alt)}
      className={cn("px-4 py-16 sm:py-20", className)}
    >
      {children}
    </section>
  );

  const paragraphs = (text: unknown) =>
    String(text ?? "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

  switch (block.kind) {
    /* ── The opening: one viewport, the photograph, the name ─────────── */
    case "hero":
      return (
        <section
          data-rest
          data-alt-from={alt}
          data-alt-to={alt}
          data-place={d.eyebrow || route.region || "Trailhead"}
          style={sv(alt)}
          className="relative isolate flex min-h-[100svh] items-end"
        >
          {d.image && (
            <img
              src={d.image}
              alt=""
              fetchPriority="high"
              className="absolute inset-0 -z-10 h-full w-full object-cover"
            />
          )}
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
          <div className="mx-auto w-full max-w-6xl px-4 pb-14 text-white">
            {d.eyebrow && <p className="label text-white/70">{d.eyebrow}</p>}
            <h1 className="mt-2 max-w-[16ch] font-display text-5xl leading-[0.98] sm:text-7xl lg:text-8xl">
              {d.title || route.name}
            </h1>
            <p className="mt-4 font-mono text-sm text-white/85">
              {route.typical_days} days
              {route.max_altitude_m ? ` · to ${route.max_altitude_m.toLocaleString("en-US")} m` : ""}
              {route.distance_km ? ` · ${route.distance_km} km` : ""}
            </p>
            {(d.standfirst || route.summary) && (
              <p className="mt-4 max-w-[52ch] text-body-l text-white/90">
                {d.standfirst || route.summary}
              </p>
            )}
            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-white/60">
              Scroll to climb ↓
            </p>
          </div>
        </section>
      );

    /* ── A day: one viewport, the number huge, the place, the words ───── */
    case "climb_day": {
      const altitude = Number(d.altitude) || alt;
      const delta = altitude - altFrom;
      const isTop = altitude === route.max_altitude_m;
      return (
        <section
          data-alt-from={altFrom}
          data-alt-to={altitude}
          data-day={String(d.day)}
          data-place={d.place}
          className={cn(
            "relative isolate flex items-end",
            isTop ? "min-h-[120svh]" : "min-h-[100svh]",
            !eager && "cv-auto",
          )}
        >
          {d.image ? (
            <img
              src={d.image}
              alt={`Day ${d.day} — ${d.place}, ${altitude.toLocaleString("en-US")} m`}
              loading={eager ? undefined : "lazy"}
              className={cn("absolute inset-0 -z-10 h-full w-full object-cover", isTop && "object-top")}
            />
          ) : (
            // No photograph yet: the palette itself, so the day still reads
            // as a place rather than a hole in the page.
            <div aria-hidden className="absolute inset-0 -z-10" style={{ background: oklchCss(paletteAt(altitude).bg) }} />
          )}
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
          <div className={cn("mx-auto w-full max-w-6xl px-4 text-white", isTop ? "pb-20" : "pb-12")}>
            <p
              aria-hidden
              className={cn(
                "select-none font-mono leading-[0.85] tracking-tighter",
                isTop ? "text-[34vw] opacity-95 sm:text-[17rem]" : "text-[22vw] opacity-85 sm:text-[10rem]",
              )}
            >
              {String(d.day).padStart(2, "0")}
            </p>
            <h2 className="sr-only">
              Day {d.day} — {d.place}
            </h2>
            <p className={cn("font-display leading-none", isTop ? "text-5xl sm:text-7xl" : "text-3xl sm:text-5xl")}>
              {d.place}
            </p>
            <p className="mt-2 font-mono text-sm text-white/85">
              {altitude.toLocaleString("en-US")} m ·{" "}
              {delta >= 0 ? `↑ ${delta.toLocaleString("en-US")}` : `↓ ${Math.abs(delta).toLocaleString("en-US")}`} m
              {isTop && " · the top"}
            </p>
            {d.text && (
              <p className={cn("mt-3 max-w-[46ch] text-white/90", isTop ? "text-body-l" : "text-[15px]")}>
                {d.text}
              </p>
            )}
          </div>
        </section>
      );
    }

    /* ── Words ─────────────────────────────────────────────────────────── */
    case "prose":
      return (
        <Rest place={d.heading || "Words"}>
          <div className="mx-auto max-w-2xl">
            {d.heading && <h2 className="font-display text-3xl sm:text-4xl">{d.heading}</h2>}
            <div className={cn("space-y-4", d.heading && "mt-5")}>
              {paragraphs(d.body).map((p, i) => (
                <p key={i} className="text-body-l opacity-90">
                  {p}
                </p>
              ))}
            </div>
          </div>
        </Rest>
      );

    /* ── Photo & words ─────────────────────────────────────────────────── */
    case "split":
      return (
        <Rest place={d.heading || "Photo"}>
          <div
            className={cn(
              "mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-2 lg:gap-14",
              d.side === "right" && "lg:[&>figure]:order-2",
            )}
          >
            {d.image && (
              <figure>
                <SmartImage
                  src={d.image}
                  alt={d.caption || ""}
                  width={1200}
                  height={900}
                  cover
                  className="aspect-[4/3] w-full rounded-md shadow-lift"
                />
                {d.caption && <figcaption className="mt-2 font-mono text-xs opacity-70">{d.caption}</figcaption>}
              </figure>
            )}
            <div>
              {d.heading && <h2 className="font-display text-3xl sm:text-4xl">{d.heading}</h2>}
              <div className={cn("space-y-4", d.heading && "mt-5")}>
                {paragraphs(d.body).map((p, i) => (
                  <p key={i} className="text-body-l opacity-90">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Rest>
      );

    /* ── The numbers ───────────────────────────────────────────────────── */
    case "stats": {
      const items = parsePairs(d.items);
      return (
        <Rest place={d.heading || "The numbers"} className="py-12 sm:py-16">
          <div className="mx-auto max-w-6xl">
            {d.heading && <p className="label opacity-60">{d.heading}</p>}
            <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4", d.heading && "mt-4")}>
              {items.map(([label, value]) => (
                <div key={label} className="border-t border-current/20 pt-3">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.12em] opacity-70">{label}</dt>
                  <dd className="mt-1 font-display text-3xl leading-none sm:text-4xl">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Rest>
      );
    }

    /* ── Day by day ────────────────────────────────────────────────────── */
    case "itinerary": {
      const days = parsePairs(d.days);
      return (
        <Rest place={d.heading || "Day by day"}>
          <div className="mx-auto max-w-2xl">
            {d.heading && <h2 className="font-display text-3xl sm:text-4xl">{d.heading}</h2>}
            <ol className={cn("divide-y divide-current/15", d.heading && "mt-6")}>
              {days.map(([label, text], i) => (
                <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-4 py-3">
                  <span className="font-mono text-sm opacity-70">{label}</span>
                  <span className="text-[15px]">{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </Rest>
      );
    }

    /* ── The shape of it: the profile, from the day stops ──────────────── */
    case "elevation": {
      const points = (route.day_stops ?? []).filter((s) => Number.isFinite(s.altitude_m));
      if (points.length < 2) return null;
      const max = Math.max(...points.map((s) => s.altitude_m));
      const min = Math.min(...points.map((s) => s.altitude_m));
      const span = Math.max(1, max - min);
      const xy = points.map((s, i) => [
        (i / (points.length - 1)) * 100,
        100 - ((s.altitude_m - min) / span) * 88 - 6,
      ]);
      const path = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
      return (
        <Rest place={d.heading || "The shape of it"}>
          <div className="mx-auto max-w-4xl">
            {d.heading && <h2 className="font-display text-3xl sm:text-4xl">{d.heading}</h2>}
            {d.note && <p className="mt-2 text-[15px] opacity-80">{d.note}</p>}
            <figure className="mt-6">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="h-44 w-full sm:h-64"
                role="img"
                aria-label={`Elevation from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")} metres`}
              >
                <path d={`${path} L100,100 L0,100 Z`} fill="currentColor" opacity="0.12" />
                <path d={path} fill="none" stroke="currentColor" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
                {xy.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="0.9" fill="currentColor" />
                ))}
              </svg>
              <figcaption className="mt-2 grid grid-cols-3 font-mono text-[11px] uppercase tracking-[0.1em] opacity-70">
                <span>{points[0].place}</span>
                <span className="text-center">{max.toLocaleString("en-US")} m at the top</span>
                <span className="text-right">{points[points.length - 1].place}</span>
              </figcaption>
            </figure>
          </div>
        </Rest>
      );
    }

    /* ── The map: the route's own line, a pin per night ────────────────── */
    case "map": {
      const stops = (route.day_stops ?? []).filter((s) => s.lng != null && s.lat != null);
      if (stops.length < 2) return null;
      return (
        <Rest place={d.heading || "The map"}>
          <div className="mx-auto max-w-5xl">
            {d.heading && <h2 className="font-display text-3xl sm:text-4xl">{d.heading}</h2>}
            {d.note && <p className="mt-2 text-[15px] opacity-80">{d.note}</p>}
            <div className="mt-6 overflow-hidden rounded-md shadow-lift">
              <RouteMap stops={stops} className="h-[360px] w-full bg-mist sm:h-[520px]" />
            </div>
          </div>
        </Rest>
      );
    }

    /* ── Photographs ───────────────────────────────────────────────────── */
    case "gallery": {
      const photos = parsePairs(d.photos);
      if (photos.length === 0) return null;
      return (
        <Rest place={d.heading || "Photographs"}>
          <div className="mx-auto max-w-6xl">
            {d.heading && <h2 className="font-display text-3xl sm:text-4xl">{d.heading}</h2>}
            {/* The first photograph is the big one; the rest tile beside it.
                A row of equal thumbnails is a contact sheet, not a page. */}
            <div className={cn("grid gap-3 sm:grid-cols-3 sm:grid-rows-2", d.heading && "mt-6")}>
              {photos.map(([src, caption], i) => (
                <figure key={i} className={cn(i === 0 && "sm:col-span-2 sm:row-span-2")}>
                  <SmartImage
                    src={src}
                    alt={caption}
                    width={i === 0 ? 1400 : 700}
                    height={i === 0 ? 1050 : 525}
                    cover
                    className={cn("w-full rounded-md shadow-lift", i === 0 ? "aspect-[4/3] sm:h-full" : "aspect-[4/3]")}
                  />
                  {caption && <figcaption className="mt-1.5 font-mono text-xs opacity-70">{caption}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        </Rest>
      );
    }

    /* ── Somebody's words ──────────────────────────────────────────────── */
    case "quote":
      return (
        <Rest place={d.who || "A quote"} className="flex min-h-[70svh] items-center">
          <figure className="mx-auto max-w-3xl">
            <blockquote className="font-display text-3xl leading-[1.15] sm:text-5xl">“{d.text}”</blockquote>
            <figcaption className="mt-6 font-mono text-sm opacity-75">
              {d.who}
              {d.role ? ` · ${d.role}` : ""}
            </figcaption>
          </figure>
        </Rest>
      );

    /* ── Papers & permits: paper cards on whatever the mountain is doing ── */
    case "permits":
      if (permits.length === 0) return null;
      return (
        <Rest place="Papers">
          <div className="mx-auto max-w-2xl">
            <p className="label opacity-60">At the park gate</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl">{d.heading || "Your papers, ready"}</h2>
            {d.note && <p className="mt-2 max-w-[52ch] text-[15px] opacity-80">{d.note}</p>}
            <ul className="mt-6 space-y-3">
              {permits.map((p) => (
                <li
                  key={p.name}
                  className="flex items-baseline justify-between gap-4 rounded-md bg-paper px-4 py-3 text-ink shadow-lift"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{p.name}</span>
                    {p.issuing_body && <span className="block text-xs text-muted">{p.issuing_body}</span>}
                  </span>
                  <span className="shrink-0 font-mono">{m(p.cost_usd_cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Rest>
      );

    /* ── When to walk it: twelve months, crowds against weather ────────── */
    case "season": {
      const profile = route.month_profile ?? [];
      const best = new Set(route.season_months ?? []);
      if (profile.length === 0 && best.size === 0) return null;
      const byMonth = new Map(profile.map((p) => [p.m, p]));
      return (
        <Rest place="When to walk it">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-3xl sm:text-4xl">{d.heading || "When to walk it"}</h2>
            {d.note && <p className="mt-2 text-[15px] opacity-80">{d.note}</p>}
            <ol className="mt-8 grid grid-cols-6 gap-2 sm:grid-cols-12">
              {MONTHS.map((name, i) => {
                const mo = i + 1;
                const p = byMonth.get(mo);
                const good = best.has(mo);
                const weather = p?.weather ?? (good ? 4 : 2);
                return (
                  <li key={name} className="flex flex-col items-center gap-2">
                    <div className="flex h-24 w-full items-end justify-center rounded-sm bg-current/10 p-1">
                      <div
                        className={cn("w-full rounded-sm", good ? "bg-current" : "bg-current/35")}
                        style={{ height: `${Math.max(8, (weather / 5) * 100)}%` }}
                        title={p?.note}
                      />
                    </div>
                    <span className={cn("font-mono text-[11px] uppercase tracking-wide", good ? "opacity-100" : "opacity-55")}>
                      {name}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] opacity-60">
              Solid bars are the months we run it.
            </p>
          </div>
        </Rest>
      );
    }

    /* ── What to bring ─────────────────────────────────────────────────── */
    case "packing": {
      const items = parsePairs(d.items);
      if (items.length === 0) return null;
      return (
        <Rest place={d.heading || "What to bring"}>
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-3xl sm:text-4xl">{d.heading || "What to bring"}</h2>
            <ul className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {items.map(([thing, why], i) => (
                <li key={i} className="border-t border-current/20 pt-3">
                  <p className="text-[15px] font-medium">{thing}</p>
                  {why && <p className="mt-0.5 text-sm opacity-75">{why}</p>}
                </li>
              ))}
            </ul>
          </div>
        </Rest>
      );
    }

    /* ── Questions, as the page's FAQ ──────────────────────────────────── */
    case "faq": {
      const items = parsePairs(d.items);
      if (items.length === 0) return null;
      return (
        <Rest place={d.heading || "Questions"}>
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-3xl sm:text-4xl">{d.heading || "Common questions"}</h2>
            <div className="mt-6 divide-y divide-current/15">
              {items.map(([q, a], i) => (
                <details key={i} className="group py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-start justify-between gap-4 text-[17px] font-medium">
                    {q}
                    <span aria-hidden className="mt-1 shrink-0 font-mono text-sm opacity-60 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed opacity-85">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </Rest>
      );
    }

    /* ── Who leads it ──────────────────────────────────────────────────── */
    case "guides":
      if (guides.length === 0) return null;
      return (
        <Rest place="Who leads it">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-display text-3xl sm:text-4xl">{d.heading || "The guides who walk it"}</h2>
            {d.note && <p className="mt-2 text-[15px] opacity-80">{d.note}</p>}
            <ul className="mt-6 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-4">
              {guides.slice(0, 8).map((g) => (
                <li key={g.slug} className="w-56 shrink-0 sm:w-auto">
                  <GuideTile g={g} routeName={route.name} />
                </li>
              ))}
            </ul>
          </div>
        </Rest>
      );

    /* ── The landing: who takes you, and what you can book ─────────────── */
    case "cta": {
      const top = guides.slice(0, 3);
      return (
        <Rest place="Choose your guide" className="pb-24 pt-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-[20ch] font-display text-4xl leading-tight sm:text-5xl">
              {d.heading || "Now the only question that matters: who takes you."}
            </h2>
            {d.note && <p className="mt-3 max-w-[52ch] text-body-l opacity-85">{d.note}</p>}
            {top.length > 0 && (
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {top.map((g) => (
                  <GuideTile key={g.slug} g={g} routeName={route.name} large />
                ))}
              </div>
            )}
            {offerings.length > 0 && (
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {offerings.slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <Link
                      to={o.kind === "trek" ? `/treks/${o.slug}` : `/experiences/${o.slug}`}
                      prefetch="intent"
                      className="flex items-baseline justify-between gap-4 rounded-md bg-paper px-4 py-3 text-ink shadow-lift transition-transform duration-quick ease-out-soft hover:-translate-y-0.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.title}</span>
                        <span className="block text-sm text-muted">
                          with {o.guide_name} · {o.days} days
                        </span>
                      </span>
                      {o.guide_day_rate_usd_cents ? (
                        <span className="shrink-0 font-mono text-sm text-muted">
                          from {m(o.guide_day_rate_usd_cents)}/day
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {guides.length > 3 && (
              <p className="mt-6">
                <Link to="/guides" className="text-[15px] underline underline-offset-4 opacity-90 hover:opacity-100">
                  See all {guides.length} guides who run {route.name} →
                </Link>
              </p>
            )}
          </div>
        </Rest>
      );
    }

    default:
      return null;
  }
}

/** A guide, as a card on whatever the mountain is doing behind it. */
function GuideTile({ g, routeName, large }: { g: RouteGuide; routeName: string; large?: boolean }) {
  return (
    <Link
      to={`/guides/${g.slug}`}
      prefetch="intent"
      className="group block overflow-hidden rounded-md bg-paper text-ink shadow-lift transition-transform duration-quick ease-out-soft hover:-translate-y-0.5"
    >
      <SmartImage
        src={g.avatar ?? ""}
        alt={g.name}
        width={520}
        height={520}
        cover
        className={cn("w-full", large ? "aspect-square" : "aspect-[4/3]")}
      />
      <div className={large ? "p-4" : "p-3"}>
        <div className="flex items-center justify-between gap-2">
          <p className={cn("font-display", large ? "text-xl" : "text-lg")}>{g.name}</p>
          <TierBadge tier={g.tier} static />
        </div>
        <p className="mt-1 text-sm text-muted">
          {g.treks > 0
            ? `${g.treks} ${routeName} ${g.treks === 1 ? "trek" : "treks"} written up`
            : `Runs the ${routeName} trek`}
        </p>
        <p className="mt-2 text-sm text-moss underline underline-offset-4 group-hover:text-pine">
          Meet {g.name.split(" ")[0]} →
        </p>
      </div>
    </Link>
  );
}
