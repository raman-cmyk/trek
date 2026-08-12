import { useEffect, useRef } from "react";
import { Link } from "react-router";
import {
  CLIMB_INK,
  CLIMB_PAPER,
  altAtScroll,
  oklchCss,
  paletteAt,
  type ClimbConfig,
} from "~/lib/climb";
import { useMoney } from "~/lib/currency-context";
import { partyAmounts, type PriceBreakdown } from "~/lib/experience-pricing";
import type { PublicOffering } from "~/components/public/cards";
import type { PublicJournal } from "~/lib/journals";
import { journalMonth } from "~/lib/journals";
import { SmartImage } from "~/components/SmartImage";
import { TierBadge } from "~/components/public/bits";
import { cn } from "~/lib/cn";

/**
 * THE PAGE CLIMBS.
 *
 * Scroll position is elevation. The page starts warm, dense and green at the
 * trailhead; it thins, cools and pales as you gain height; it is coldest,
 * widest and quietest at the summit; then it warms back down and lands you on
 * the choice of guide. Every decision on the page obeys that one idea.
 *
 * How the machine works:
 *
 * · Every block carries data-alt-from/data-alt-to. A passive, rAF-throttled
 *   scroll listener interpolates the current altitude from the viewport's
 *   focal point, and writes exactly five CSS custom properties on the
 *   container — nothing that triggers layout.
 * · Sections paint `var(--live-bg, var(--sbg))`: the live variable when JS is
 *   driving, a per-section static stop when it is not. With JavaScript off
 *   the page is a readable, ordered, server-rendered document with a stepped
 *   palette — this is the primary SEO surface and degrades to itself.
 * · The contrast rule is structural, and proven in climb.test.ts: text only
 *   ever rests on the page background at waypoint altitudes (each ≥4.5:1);
 *   the mid-ramp window where neither pole passes occurs only across the
 *   full-viewport photographs, where every word sits on a fixed dark scrim.
 * · The altimeter HUD paints on its own inverted surface — bg is the current
 *   text pole, text is the opposite pole — so its contrast is the constant
 *   paper-on-ink pair no matter where the ramp is.
 * · prefers-reduced-motion: no interpolation; palette and altimeter snap per
 *   section from an IntersectionObserver.
 */

interface RouteRow {
  name: string;
  region: string | null;
  summary: string | null;
  typical_days: number;
  max_altitude_m: number;
  distance_km: number | null;
  difficulty: string | null;
  season_months: number[] | null;
  month_profile: Array<{ m: number; crowds: number; weather: number; note: string }> | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ClimbRoute({
  cfg,
  route,
  permits,
  offerings,
  journals,
  guides,
}: {
  cfg: ClimbConfig;
  route: RouteRow;
  permits: Array<{ name: string; cost_usd_cents: number }>;
  offerings: PublicOffering[];
  journals: PublicJournal[];
  guides: Array<{ slug: string; name: string; avatar: string | null; tier: number; treks: number }>;
  }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const dayRef = useRef<HTMLSpanElement>(null);
  const altMobileRef = useRef<HTMLSpanElement>(null);
  const dayMobileRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);

  // ── The engine ──────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const blocks = Array.from(container.querySelectorAll<HTMLElement>("[data-alt-from]"));
    if (blocks.length === 0) return;

    let segs: Array<{
      altFrom: number;
      altTo: number;
      top: number;
      height: number;
      day: string;
      place: string;
    }> = [];
    const measure = () => {
      segs = blocks.map((b) => {
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
      // The HUD's inverted surface: constant-contrast pair, poles swap.
      const fgIsPaper = p.fg[0] > 0.5;
      s.setProperty("--hud-bg", fgIsPaper ? paperCss : inkCss);
      s.setProperty("--hud-fg", fgIsPaper ? inkCss : paperCss);

      const altText = `${alt.toLocaleString("en-US")} m`;
      if (altRef.current) altRef.current.textContent = altText;
      if (altMobileRef.current) altMobileRef.current.textContent = altText;
      if (seg) {
        const label = seg.day ? `DAY ${seg.day.padStart(2, "0")} · ${seg.place.toUpperCase()}` : seg.place.toUpperCase();
        if (label !== lastLabel) {
          lastLabel = label;
          if (dayRef.current) dayRef.current.textContent = label;
          if (dayMobileRef.current) dayMobileRef.current.textContent = seg.day ? `DAY ${seg.day.padStart(2, "0")}` : "";
        }
      }
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Snap per section — no counting, no continuous repaint.
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
      blocks.forEach((b) => io.observe(b));
      return () => io.disconnect();
    }

    let raf = 0;
    const frame = () => {
      raf = 0;
      const focal = window.scrollY + window.innerHeight * 0.5;
      const alt = altAtScroll(segs, focal);
      const seg = segs.find((x) => focal >= x.top && focal < x.top + x.height) ?? segs[focal < segs[0].top ? 0 : segs.length - 1];
      apply(alt, seg);
      // The dot on the rail: x = altitude, y = how far through the trek.
      if (dotRef.current && segs.length) {
        const start = segs[0].top;
        const end = segs[segs.length - 1].top + segs[segs.length - 1].height;
        const prog = Math.max(0, Math.min(1, (focal - start) / (end - start)));
        const alts = segs.map((x) => Math.max(x.altFrom, x.altTo));
        const lo = 1400;
        const hi = Math.max(...alts);
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
  }, []);

  // ── Derived content ─────────────────────────────────────────────────────
  const { m } = useMoney();
  const priced = offerings.find((o) => o.price_breakdown);
  const split = priced?.price_breakdown
    ? partyAmounts(priced.price_breakdown as PriceBreakdown, 2)
    : null;

  const summitAlt = Math.max(...cfg.days.map((d) => d.altitude));
  const best = new Set(route.season_months ?? []);
  const dayRateBySlug = new Map(
    offerings.map((o) => [o.guide_slug, o.guide_day_rate_usd_cents]),
  );
  const topGuides = guides.slice(0, 3);

  // The rail's profile polyline, from the real waypoints.
  const railAlts = [cfg.start.altitude, ...cfg.days.map((d) => d.altitude)];
  const railLo = Math.min(...railAlts);
  const railHi = Math.max(...railAlts);
  const railPts = railAlts
    .map((a, i) => {
      const y = 6 + (i / (railAlts.length - 1)) * 148;
      const x = 4 + ((a - railLo) / (railHi - railLo)) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Static SSR palettes per resting altitude.
  const sv = (alt: number) => {
    const p = paletteAt(alt);
    return {
      "--sbg": oklchCss(p.bg),
      "--sfg": oklchCss(p.fg),
      "--saccent": oklchCss(p.accent),
    } as React.CSSProperties;
  };

  let prevAlt = cfg.start.altitude;

  return (
    <div
      ref={containerRef}
      className="climb"
      style={
        {
          background: "var(--live-bg, oklch(0.30 0.055 152))",
          color: "var(--live-fg, oklch(0.975 0.012 120))",
        } as React.CSSProperties
      }
    >
      <style>{`
        .climb section[data-rest] { background: var(--live-bg, var(--sbg)); color: var(--live-fg, var(--sfg)); }
        .climb-snap, .climb-snap section[data-rest] { transition: background-color 400ms ease, color 400ms ease; }
        .climb .cv-auto { content-visibility: auto; contain-intrinsic-size: auto 100vh; }
      `}</style>

      {/* ── The altimeter ─────────────────────────────────────────────────
           Desktop: a rail with the whole trek's profile and a dot for where
           you are. Mobile: a slim pill, altitude and day only. Both sit on
           the inverted surface so their contrast never depends on the ramp. */}
      <div
        aria-hidden="true"
        className="fixed left-4 top-1/2 z-30 hidden -translate-y-1/2 lg:block"
      >
        <div
          className="rounded-md px-2.5 py-3"
          style={{ background: "var(--hud-bg, oklch(0.975 0.012 120))", color: "var(--hud-fg, oklch(0.16 0.015 240))" }}
        >
          <svg width="28" height="160" viewBox="0 0 28 160" className="block">
            <polyline points={railPts} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
            <circle ref={dotRef} cx="4" cy="6" r="3.5" fill="currentColor" />
          </svg>
          <p className="mt-2 w-[7.5rem] whitespace-normal font-mono text-[10px] leading-snug tracking-[0.08em]">
            <span ref={dayRef}>{cfg.start.place.toUpperCase()}</span>
          </p>
          <p className="font-mono text-sm tracking-tight">
            <span ref={altRef}>{cfg.start.altitude.toLocaleString("en-US")} m</span>
          </p>
        </div>
      </div>
      <div aria-hidden="true" className="fixed right-3 top-16 z-30 lg:hidden">
        <p
          className="rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.06em]"
          style={{ background: "var(--hud-bg, oklch(0.975 0.012 120))", color: "var(--hud-fg, oklch(0.16 0.015 240))" }}
        >
          <span ref={dayMobileRef} /> <span ref={altMobileRef}>{cfg.start.altitude.toLocaleString("en-US")} m</span>
        </p>
      </div>

      {/* ── The trailhead ─────────────────────────────────────────────── */}
      <section
        data-rest
        data-alt-from={cfg.start.altitude}
        data-alt-to={cfg.start.altitude}
        data-place={cfg.start.place}
        style={sv(cfg.start.altitude)}
        className="relative isolate flex min-h-[100svh] items-end"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: `url(${cfg.start.blur})` }}
        />
        <img
          src={cfg.start.image}
          alt={`${cfg.start.place}, where the ${route.name} trek begins`}
          className="absolute inset-0 -z-10 h-full w-full object-cover"
          fetchPriority="high"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
        <div className="mx-auto w-full max-w-6xl px-4 pb-14 text-white">
          <p className="label text-white/70">{route.region} · Nepal</p>
          <h1 className="mt-2 max-w-[16ch] font-display text-5xl leading-[0.98] sm:text-7xl lg:text-8xl">
            {route.name}
          </h1>
          <p className="mt-4 font-mono text-sm text-white/85">
            {route.typical_days} days · {cfg.start.altitude.toLocaleString("en-US")} m →{" "}
            {summitAlt.toLocaleString("en-US")} m
            {route.distance_km ? ` · ${route.distance_km} km` : ""}
          </p>
          {route.summary && (
            <p className="mt-4 max-w-[52ch] text-body-l text-white/90">{route.summary}</p>
          )}
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-white/60">
            Scroll to climb ↓
          </p>
        </div>
      </section>

      {/* ── Papers, at the park gate ───────────────────────────────────── */}
      <section
        data-rest
        data-alt-from={cfg.start.altitude}
        data-alt-to={cfg.start.altitude}
        data-place="Langtang National Park gate"
        style={sv(cfg.start.altitude)}
        className="px-4 py-20"
      >
        <div className="mx-auto max-w-2xl">
          <p className="label opacity-60">At the park gate</p>
          <h2 className="mt-2 font-display text-3xl">Your papers, ready</h2>
          <p className="mt-2 max-w-[52ch] text-[15px] opacity-80">
            The checkpost is at the road head. We issue both before you fly —
            they are in your trip folder, at cost, no margin added.
          </p>
          {/* The permits as physical documents: paper cards on whatever the
              mountain is doing behind them. */}
          <ul className="mt-6 space-y-3">
            {permits.map((p) => (
              <li
                key={p.name}
                className="flex items-baseline justify-between gap-4 rounded-md bg-paper px-4 py-3 text-ink shadow-lift"
              >
                <span className="text-[15px] font-medium">{p.name}</span>
                <span className="shrink-0 font-mono">{m(p.cost_usd_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── The days ───────────────────────────────────────────────────── */}
      {cfg.days.map((d, i) => {
        const from = prevAlt;
        prevAlt = d.altitude;
        const delta = d.altitude - from;
        const journalHere = i === 1 ? journals[0] : i === 4 ? journals[1] : null;
        return (
          <div key={d.day}>
            <DayFrame day={d} altFrom={from} delta={delta} eager={i === 0} summit={!!d.summit} />
            {d.summit && split && priced && (
              <SummitSplit
                route={route}
                split={split}
                m={m}
                summitAlt={d.altitude}
                sv={sv}
              />
            )}
            {journalHere && <TrailNote j={journalHere} alt={d.altitude} sv={sv} />}
            {/* When to walk it — read on the way down, when you are deciding. */}
            {i === 4 && route.month_profile && (
              <MonthsOnDescent route={route} best={best} alt={d.altitude} sv={sv} />
            )}
          </div>
        );
      })}

      {/* ── The road home ──────────────────────────────────────────────── */}
      {cfg.coda && (
        <section
          data-rest
          data-alt-from={1400}
          data-alt-to={1400}
          data-place="Kathmandu"
          style={sv(1400)}
          className="px-4 py-16"
        >
          <p className="mx-auto max-w-2xl font-mono text-sm opacity-75">{cfg.coda}</p>
        </section>
      )}

      {/* ── The landing: who takes you ─────────────────────────────────── */}
      <section
        data-rest
        data-alt-from={1400}
        data-alt-to={1400}
        data-place="Choose your guide"
        style={sv(1400)}
        className="px-4 pb-24 pt-16"
      >
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-[20ch] font-display text-4xl leading-tight sm:text-5xl">
            Now the only question that matters: who takes you.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {topGuides.map((g) => (
              <Link
                key={g.slug}
                to={`/guides/${g.slug}`}
                prefetch="intent"
                className="group overflow-hidden rounded-md bg-paper text-ink shadow-lift transition-transform duration-quick ease-out-soft hover:-translate-y-0.5"
              >
                <SmartImage
                  src={g.avatar ?? ""}
                  alt={g.name}
                  width={520}
                  height={520}
                  cover
                  className="aspect-square w-full"
                />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-xl">{g.name}</p>
                    {/* static: the badge's own link cannot nest inside this card's. */}
                    <TierBadge tier={g.tier} static />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {g.treks > 0
                      ? `${g.treks} ${route.name} ${g.treks === 1 ? "trek" : "treks"} written up`
                      : `Runs the ${route.name} trek`}
                    {dayRateBySlug.get(g.slug)
                      ? ` · from ${m(dayRateBySlug.get(g.slug)!)}/day`
                      : ""}
                  </p>
                  <p className="mt-3 text-sm text-moss underline underline-offset-4 group-hover:text-pine">
                    Meet {g.name.split(" ")[0]} →
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {guides.length > 3 && (
            <p className="mt-6">
              <Link to="/guides" className="text-[15px] underline underline-offset-4 opacity-90 hover:opacity-100">
                See all {guides.length} guides who run {route.name} →
              </Link>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── One day, one viewport ─────────────────────────────────────────────── */

function DayFrame({
  day: d,
  altFrom,
  delta,
  eager,
  summit,
}: {
  day: { day: number; place: string; altitude: number; image: string; blur: string; text: string };
  altFrom: number;
  delta: number;
  eager: boolean;
  summit: boolean;
}) {
  return (
    <section
      data-alt-from={altFrom}
      data-alt-to={d.altitude}
      data-day={String(d.day)}
      data-place={d.place}
      className={cn(
        "relative isolate flex items-end",
        summit ? "min-h-[130svh]" : "min-h-[100svh]",
        !eager && "cv-auto",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `url(${d.blur})` }}
      />
      <img
        src={d.image}
        alt={`Day ${d.day} — ${d.place}, ${d.altitude.toLocaleString("en-US")} m`}
        loading={eager ? undefined : "lazy"}
        className={cn("absolute inset-0 -z-10 h-full w-full object-cover", summit && "object-top")}
      />
      {/* The scrim is the contrast guarantee inside a day — fixed, dark,
          and under every word. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />

      <div className={cn("mx-auto w-full max-w-6xl px-4 text-white", summit ? "pb-20" : "pb-12")}>
        <p
          aria-hidden
          className={cn(
            "select-none font-mono leading-[0.85] tracking-tighter",
            summit
              ? "text-[34vw] opacity-95 sm:text-[17rem]"
              : "text-[22vw] opacity-85 sm:text-[10rem]",
          )}
        >
          {String(d.day).padStart(2, "0")}
        </p>
        <h2 className="sr-only">Day {d.day} — {d.place}</h2>
        <p className={cn("font-display leading-none", summit ? "text-5xl sm:text-7xl" : "text-3xl sm:text-5xl")}>
          {d.place}
        </p>
        <p className="mt-2 font-mono text-sm text-white/85">
          {d.altitude.toLocaleString("en-US")} m ·{" "}
          {delta >= 0 ? `↑ ${delta.toLocaleString("en-US")}` : `↓ ${Math.abs(delta).toLocaleString("en-US")}`} m
          {summit && " · the top"}
        </p>
        <p className={cn("mt-3 max-w-[46ch] text-white/90", summit ? "text-body-l" : "text-[15px]")}>
          {d.text}
        </p>
      </div>
    </section>
  );
}

/* ── The cost, at the summit ───────────────────────────────────────────── */

function SummitSplit({
  route,
  split,
  m,
  summitAlt,
  sv,
}: {
  route: RouteRow;
  split: ReturnType<typeof partyAmounts>;
  m: (c: number) => string;
  summitAlt: number;
  sv: (alt: number) => React.CSSProperties;
}) {
  const rows: Array<[string, number]> = [
    ["Your guide", split.guideUsdCents],
    ["Permits, at cost", split.permitsUsdCents],
    ["Porters", split.portersUsdCents],
    ["Lodges & food", split.logisticsUsdCents],
    ["Trek, added on top", split.trekUsdCents],
    ["Rescue & welfare fund", split.fundUsdCents],
  ];
  return (
    <section
      data-rest
      data-alt-from={summitAlt}
      data-alt-to={summitAlt}
      data-place="The whole price"
      style={sv(summitAlt)}
      className="flex min-h-[100svh] items-center px-4 py-20"
    >
      {/* The decision, made at the coldest, quietest point on the page.
          Maximum contrast, maximum space — the transparency moment gets the
          biggest stage we have. */}
      <div className="mx-auto w-full max-w-2xl">
        <p className="label opacity-60">The whole price, at the top</p>
        <h2 className="mt-2 font-display text-4xl leading-tight sm:text-6xl">
          {route.name}, two people, to the cent.
        </h2>
        <dl className="mt-10 space-y-3">
          {rows
            .filter(([, v]) => v > 0)
            .map(([label, v]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-current/15 pb-3">
                <dt className="text-[15px] sm:text-base">{label}</dt>
                <dd className="font-mono text-lg sm:text-xl">{m(v)}</dd>
              </div>
            ))}
          <div className="flex items-baseline justify-between gap-4 pt-2">
            <dt className="text-base font-medium sm:text-lg">Everything, for two</dt>
            <dd className="font-mono text-3xl sm:text-4xl">{m(split.totalUsdCents)}</dd>
          </div>
        </dl>
        <p className="mt-8 text-sm opacity-75">
          Your guide keeps their whole fee. Permits go to the park.{" "}
          <Link to="/transparency" className="underline underline-offset-4">
            Every line, explained →
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ── A journal, left on the trail ──────────────────────────────────────── */

function TrailNote({
  j,
  alt,
  sv,
}: {
  j: PublicJournal;
  alt: number;
  sv: (alt: number) => React.CSSProperties;
}) {
  return (
    <section
      data-rest
      data-alt-from={alt}
      data-alt-to={alt}
      data-place="A note from the trail"
      style={sv(alt)}
      className="px-4 py-16"
    >
      <div className="mx-auto max-w-2xl">
        <p className="label opacity-60">Left on the trail</p>
        <Link
          to={`/journals/${j.slug}`}
          prefetch="intent"
          className="mt-3 block overflow-hidden rounded-md bg-paper text-ink shadow-lift transition-transform duration-quick ease-out-soft hover:-translate-y-0.5"
        >
          {j.cover_photo_url && (
            <SmartImage
              src={j.cover_photo_url}
              alt=""
              width={1200}
              height={630}
              cover
              className="aspect-[1.9] w-full"
            />
          )}
          <div className="p-4">
            <p className="font-display text-xl leading-snug">{j.title}</p>
            <p className="mt-1 text-sm text-muted">
              {j.guide_name} walked this in {journalMonth(j.start_date)} — every day, photographed →
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}

/* ── When to walk it, read on the way down ─────────────────────────────── */

function MonthsOnDescent({
  route,
  best,
  alt,
  sv,
}: {
  route: RouteRow;
  best: Set<number>;
  alt: number;
  sv: (alt: number) => React.CSSProperties;
}) {
  const profile = route.month_profile ?? [];
  return (
    <section
      data-rest
      data-alt-from={alt}
      data-alt-to={alt}
      data-place="When to walk it"
      style={sv(alt)}
      className="px-4 py-20"
    >
      <div className="mx-auto max-w-2xl">
        <p className="label opacity-60">On the way down</p>
        <h2 className="mt-2 font-display text-3xl">When to walk it</h2>
        <div className="mt-6 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {MONTHS.map((name, i) => {
            const isBest = best.has(i + 1);
            return (
              <div
                key={name}
                className={cn(
                  "rounded px-1 py-2 text-center font-mono text-[11px]",
                  isBest ? "font-semibold" : "opacity-45",
                )}
                style={
                  isBest
                    ? { background: "var(--live-accent, var(--saccent))", color: "oklch(0.16 0.015 240)" }
                    : { background: "color-mix(in oklch, currentColor 12%, transparent)" }
                }
              >
                {name}
              </div>
            );
          })}
        </div>
        {profile.length > 0 && (
          <p className="mt-4 max-w-[52ch] text-sm opacity-80">
            {profile.find((p) => best.has(p.m))?.note ??
              "Spring for the rhododendrons, autumn for the clear skies."}
          </p>
        )}
      </div>
    </section>
  );
}
