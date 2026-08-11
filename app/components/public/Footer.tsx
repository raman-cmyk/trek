import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";

/**
 * The end of the trail.
 *
 * A footer is usually the place a site gives up: a decorative wave, four
 * columns of links, a copyright line. This one is built from the two things
 * Trek has that nobody else does, so it cannot be copied by editing a
 * template.
 *
 *   1. The top edge is cut from a real route's elevation profile, drawn from
 *      the day stops a guide actually walked. Not a generated blob — the
 *      shape of Manaslu, or Gokyo, or the Three Passes, labelled and linked.
 *      It changes with the day, so the bottom of the site is a different
 *      mountain on a different visit.
 *
 *   2. Under it, every verified guide's face, tiled edge to edge. A
 *      competitor can copy the wave in an afternoon; to copy this they would
 *      need forty-eight real people.
 *
 * The link columns are still here — the footer earns its SEO keep — but the
 * routes are grouped by region instead of dumped as a 24-item vertical list.
 */

export interface FooterData {
  faces: Array<{ slug: string; name: string; avatar_url: string | null }>;
  guideCount: number;
  journalCount: number;
  routeCount: number;
}

interface FooterRoute {
  slug: string;
  name: string;
  region?: string | null;
  max_altitude_m?: number | null;
  typical_days?: number | null;
  day_stops?: Array<{ day: number; altitude_m: number }> | null;
}

export function Footer({
  routes,
  data,
}: {
  routes: FooterRoute[];
  data?: FooterData;
}) {
  // Which mountain the page ends on. Deterministic per day rather than random:
  // the same visit renders the same profile on the server and on the client,
  // and a returning reader gets a different one tomorrow.
  const profiled = routes.filter((r) => (r.day_stops?.length ?? 0) >= 4);
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const hero = profiled.length ? profiled[dayIndex % profiled.length] : null;

  const byRegion = new Map<string, FooterRoute[]>();
  for (const r of routes) {
    const k = r.region ?? "Nepal";
    (byRegion.get(k) ?? byRegion.set(k, []).get(k)!).push(r);
  }
  const regions = [...byRegion.entries()].sort((a, b) => b[1].length - a[1].length);

  const faces = data?.faces ?? [];

  return (
    <footer className="mt-16">
      {/* ── 1. The horizon, from a real trek ─────────────────────────────── */}
      {hero ? (
        <ElevationEdge route={hero} />
      ) : (
        // No seeded profiles yet — a flat pine edge rather than a broken one.
        <div className="h-6 bg-pine" />
      )}

      <div className="bg-pine text-sage">
        {/* ── 2. The face wall ───────────────────────────────────────────── */}
        {faces.length >= 8 && (
          <Link
            to="/guides"
            prefetch="intent"
            aria-label={`Meet all ${data!.guideCount} guides`}
            className="group block"
          >
            {/* Column counts that divide the roster evenly, so the last row
                is never a short orphan floating in the middle. Faces are
                cropped square and butted edge to edge — the gaps are what
                would make this read as a widget rather than as a crowd. */}
            <div className="grid grid-cols-8 sm:grid-cols-12 lg:grid-cols-16">
              {faces.slice(0, fitRows(faces.length)).map((g) => (
                <span key={g.slug} className="relative block aspect-square" title={g.name}>
                  <SmartImage
                    src={g.avatar_url ?? ""}
                    alt=""
                    width={128}
                    height={128}
                    cover
                    className="h-full w-full saturate-[0.35] transition duration-slow ease-out-soft hover:!saturate-100"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-pine/45 transition-opacity duration-slow group-hover:bg-pine/25 hover:!opacity-0"
                  />
                </span>
              ))}
            </div>
            <p className="bg-pine px-4 py-5 text-center">
              <span className="font-display text-2xl text-paper sm:text-3xl">
                <span className="font-mono">{data!.guideCount}</span> people. Pick one.
              </span>
              <span className="mt-1 block text-sm text-sage">
                Every face here is a licensed guide we have met. None of them is an agency.
              </span>
            </p>
          </Link>
        )}

        {/* ── 3. Links ──────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-6">
          <div className="grid gap-8 border-t border-fern/20 pt-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-display text-lg text-paper">
                Trek<span className="text-moss">.</span>
              </p>
              <p className="mt-2 max-w-[30ch] text-sm text-sage">
                Pick your guide, not your agency.
              </p>
              <dl className="mt-5 space-y-1.5 text-sm">
                <Stat n={data?.guideCount} label="verified guides" />
                <Stat n={data?.routeCount} label="routes, day by day" />
                <Stat n={data?.journalCount} label="treks written up" />
              </dl>
            </div>

            {/* Routes by region — the 24-item vertical dump was a wall. */}
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-paper">Where to walk</p>
              <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {regions.map(([region, list]) => (
                  <div key={region}>
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-fern">
                      {region}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {list.map((r) => (
                        <li key={r.slug}>
                          <Link to={`/routes/${r.slug}`} className="hover:text-fern">
                            {r.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-paper">Trek</p>
              <ul className="mt-2 space-y-1 text-sm">
                {[
                  ["/guides", "Find your guide"],
                  ["/experiences", "Browse experiences"],
                  ["/events", "Group trips"],
                  ["/events/new", "Organise a trip"],
                  ["/journals", "Trek stories"],
                  ["/transparency", "Transparent pricing"],
                  ["/trust", "How verification works"],
                  ["/insurance", "Insurance checker"],
                  ["/safety", "Trust & safety"],
                  ["/fund", "The Fund"],
                  ["/hosts", "Guide on Trek"],
                ].map(([to, label]) => (
                  <li key={to}>
                    <Link to={to} className="hover:text-fern">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-fern/20 py-4">
          <p className="mx-auto max-w-6xl px-4 text-center text-xs text-sage/70">
            © {new Date().getFullYear()} Trek. A guide-first marketplace for Nepal.
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * Trim the roster to whole rows.
 *
 * The grid is 8 / 12 / 16 columns, so a count divisible by 48 fills every row
 * at every breakpoint. Anything left over would hang off the last row as a
 * ragged edge — and a ragged edge in a wall of faces reads as missing data.
 */
function fitRows(n: number): number {
  return Math.max(0, Math.floor(n / 48) * 48) || (n >= 16 ? 16 : 0);
}

function Stat({ n, label }: { n?: number; label: string }) {
  if (n == null) return null;
  return (
    <div className="flex items-baseline gap-2">
      <dt className="sr-only">{label}</dt>
      <dd className="font-mono text-paper">{n.toLocaleString("en-US")}</dd>
      <span className="text-sage">{label}</span>
    </div>
  );
}

/**
 * The page's bottom edge, cut from a route's real altitude profile.
 *
 * The path is built from the day stops, so the silhouette is the walk: the
 * long climb up the Budhi Gandaki, the notch at Larkya La, the drop into
 * Bimthang. It reads as decoration and is actually data — which is the whole
 * argument of the product, made in a shape rather than a sentence.
 */
function ElevationEdge({ route }: { route: FooterRoute }) {
  const stops = [...(route.day_stops ?? [])].sort((a, b) => a.day - b.day);
  const W = 1440;
  const H = 190;
  const alts = stops.map((s) => s.altitude_m);
  const lo = Math.min(...alts);
  const hi = Math.max(...alts);
  const span = Math.max(1, hi - lo);
  // Leave the top eighth clear so the peak never touches the section above.
  const y = (m: number) => H - 14 - ((m - lo) / span) * (H - 34);
  const x = (i: number) => (i / Math.max(1, stops.length - 1)) * W;

  // Straight segments with only the corners eased. The first version put a
  // control point at the midpoint of every span, which rounded the ridge into
  // the same soft wave every template ships — the opposite of the point. A
  // mountain profile is angular; the smoothing is a 6px fillet, no more.
  const pts = stops.map((s, i) => [x(i), y(s.altitude_m)] as const);
  const R = 10;
  let d = `M0,${H} L0,${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    const prev = pts[i - 1];
    const next = pts[i + 1];
    if (!prev) {
      d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
      continue;
    }
    // Stop short of the vertex, curve through it, carry on to the next.
    const inLen = Math.hypot(px - prev[0], py - prev[1]) || 1;
    const t = Math.min(R / inLen, 0.5);
    const ax = px + (prev[0] - px) * t;
    const ay = py + (prev[1] - py) * t;
    d += ` L${ax.toFixed(1)},${ay.toFixed(1)}`;
    if (next) {
      const outLen = Math.hypot(next[0] - px, next[1] - py) || 1;
      const u = Math.min(R / outLen, 0.5);
      const bx = px + (next[0] - px) * u;
      const by = py + (next[1] - py) * u;
      d += ` Q${px.toFixed(1)},${py.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
    } else {
      d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
    }
  }
  d += ` L${W},${H} Z`;

  const peak = stops.reduce((a, b) => (b.altitude_m > a.altitude_m ? b : a), stops[0]);
  const peakX = x(stops.indexOf(peak));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="block w-full"
        style={{ height: "clamp(88px, 12vw, 190px)", marginBottom: "-1px" }}
      >
        <path d={d} fill="var(--color-pine)" />
        {/* A hairline along the crest — the snow line, and it stops the fill
            reading as a flat silhouette. */}
        <path
          d={d.replace(`M0,${H} `, "M").replace(` L${W},${H} Z`, "")}
          fill="none"
          stroke="var(--color-fern)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          opacity="0.5"
        />
      </svg>

      {/* The label. Mono, small, and honest about what the shape is — without
          it this is just another decorative divider. */}
      <Link
        to={`/routes/${route.slug}`}
        prefetch="intent"
        className="absolute bottom-1.5 hidden -translate-x-1/2 whitespace-nowrap px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-sage/80 hover:text-paper sm:block"
        style={{ left: `${Math.min(82, Math.max(18, (peakX / W) * 100))}%` }}
      >
        {route.name} · {peak.altitude_m.toLocaleString("en-US")} m
      </Link>
    </div>
  );
}
