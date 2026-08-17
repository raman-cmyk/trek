import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { DISTRICT_CENTRES, NEPAL_BOUNDS, ROUTE_LINES } from "~/lib/geo";
import { MAP_STYLE } from "~/lib/map-style";
import { Skeleton } from "~/components/skeletons/Shimmer";

export interface MapPin {
  district: string;
  count: number;
  /** Up to three guides, for the popup. */
  sample: { slug: string; name: string; only_with_me: string | null }[];
}

export interface MapRoute {
  slug: string;
  name: string;
  region: string;
}

/**
 * Guides across Nepal, on a real map.
 *
 * MapLibre is 977 kB of JavaScript and cannot server-render, and this map sits
 * around 1,200px down the homepage — below the fold on every laptop. It used
 * to start downloading and parsing all of that the moment the page mounted,
 * competing with the hero for the main thread, for a picture nobody had
 * scrolled to. It now waits until it is nearly in view.
 *
 * The grid tab is the no-JavaScript answer and renders the same data.
 *
 * Tiles are OpenStreetMap raster (docs/02: MapLibre GL + OSM). Their public
 * tile server is rate-limited and asks not to be used by applications, which
 * is the other half of why this is slow; swapping in Baato when the founder
 * has a key is a one-line change to MAP_STYLE.
 */

export function GuideMap({ pins, routes }: { pins: MapPin[]; routes: MapRoute[] }) {
  const [view, setView] = useState<"map" | "grid">("map");
  const el = useRef<HTMLDivElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  /** False until the visible tiles have painted, so the cover can clear. */
  const [ready, setReady] = useState(false);
  /** Nothing is fetched until the map is nearly on screen. */
  const [near, setNear] = useState(false);

  useEffect(() => {
    let fired = false;
    const go = () => {
      if (!fired) {
        fired = true;
        setNear(true);
      }
    };

    // Two triggers, whichever comes first.
    //
    // Scrolling to it starts it immediately — a small margin only, because
    // the map sits about 265px below the fold and a generous one fires on
    // load, which is the thing we are trying to avoid.
    const node = wrap.current;
    let io: IntersectionObserver | undefined;
    if (node && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            go();
            io?.disconnect();
          }
        },
        { rootMargin: "200px 0px" },
      );
      io.observe(node);
    }

    // Otherwise it warms itself once the browser has nothing better to do, so
    // a megabyte of MapLibre never competes with the hero, and the map is
    // usually drawn by the time a reader scrolls down to it.
    const idle: any =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(go, { timeout: 4000 })
        : setTimeout(go, 2500);

    return () => {
      io?.disconnect();
      if (typeof cancelIdleCallback !== "undefined") cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    if (view !== "map" || !near || !el.current) return;
    setReady(false);
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    let coverTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const [maplibregl] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled || !el.current) return;

        const m = new maplibregl.Map({
          container: el.current,
          style: MAP_STYLE as any,
          bounds: NEPAL_BOUNDS,
          fitBoundsOptions: { padding: 28 },
          attributionControl: { compact: true },
          // The map is a "look how much of Nepal we cover" device, not a
          // navigation tool — free-roam zoom just gets people lost.
          maxZoom: 10,
          minZoom: 5,
          dragRotate: false,
          // No cross-fade. The tiles are already late off a slow public
          // server; spending another 300ms dissolving them in is 300ms of
          // looking unfinished for no information gained.
          fadeDuration: 0,
        });
        map = m;
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        // Tile fetches fail on locked-down networks; that must not take the
        // whole map down, and it must not spam the console either.
        m.on("error", () => {});
        // The cover must never outlive the map. `idle` is the good signal —
        // every visible tile fetched and drawn — but it is not guaranteed to
        // arrive: a tile host that hangs rather than fails leaves the map
        // usable and `idle` pending for ever, and a shimmer over a working map
        // is worse than no shimmer at all. So: whichever of style-loaded,
        // idle, error or a short deadline comes first.
        const clear = () => !cancelled && setReady(true);
        m.on("idle", clear);
        m.on("load", clear);
        m.on("error", clear);
        coverTimer = setTimeout(clear, 3000);

        // Markers are DOM overlays, not style layers, so they go on straight
        // away — they render even if the tile host is unreachable, which is
        // the difference between a degraded map and an empty grey box.
        for (const p of pins) {
          const centre = DISTRICT_CENTRES[p.district];
          if (!centre) continue;
          const node = document.createElement("button");
          node.type = "button";
          node.setAttribute("aria-label", `${p.count} guides in ${p.district}`);
          node.className =
            "flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-paper " +
            "bg-pine px-2 font-mono text-xs font-semibold text-paper shadow-lift";
          node.textContent = String(p.count);

          const list = p.sample
            .map(
              (g) =>
                `<li style="margin:.35rem 0"><a href="/guides/${g.slug}" style="font-weight:600;color:#1b3b2a">${esc(
                  g.name,
                )}</a>${g.only_with_me ? `<br><span style="color:#6b6b63">${esc(g.only_with_me)}</span>` : ""}</li>`,
            )
            .join("");
          new maplibregl.Marker({ element: node })
            .setLngLat(centre)
            .setPopup(
              new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
                `<div style="font-family:inherit;font-size:13px;line-height:1.35;max-width:230px">
                   <strong>${esc(p.district)}</strong> — ${p.count} guide${p.count === 1 ? "" : "s"}
                   <ul style="list-style:none;padding:0;margin:.25rem 0 0">${list}</ul>
                   <a href="/guides?district=${encodeURIComponent(p.district)}" style="color:#3e6b4a">All ${esc(
                     p.district,
                   )} guides →</a>
                 </div>`,
              ),
            )
            .addTo(m);
        }

        // Route lines are style layers, so they wait for the style — which is
        // already loaded if the bundle was warm.
        const drawRoutes = () => {
          if (m.getSource("routes")) return;
          m.addSource("routes", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: routes
                .filter((r) => ROUTE_LINES[r.slug])
                .map((r) => ({
                  type: "Feature" as const,
                  properties: { name: r.name },
                  geometry: { type: "LineString" as const, coordinates: ROUTE_LINES[r.slug] },
                })),
            },
          });
          m.addLayer({
            id: "routes-casing",
            type: "line",
            source: "routes",
            paint: { "line-color": "#fbf9f3", "line-width": 6, "line-opacity": 0.9 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          m.addLayer({
            id: "routes-line",
            type: "line",
            source: "routes",
            paint: { "line-color": "#1b3b2a", "line-width": 2.5 },
            layout: { "line-cap": "round", "line-join": "round" },
          });

        };
        if (m.isStyleLoaded()) drawRoutes();
        else m.on("load", drawRoutes);
      } catch {
        // Blocked tiles, no WebGL, an ad blocker — fall back rather than
        // leaving a grey rectangle where the map should be.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(coverTimer);
      map?.remove();
    };
  }, [view, near, pins, routes]);

  const total = pins.reduce((s, p) => s + p.count, 0);
  const showGrid = view === "grid" || failed;

  return (
    <div ref={wrap}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-muted">
          <span className="font-mono text-ink">{total}</span> guides in{" "}
          <span className="font-mono text-ink">{pins.length}</span> districts, from Taplejung
          in the east to Dolpa in the west.
        </p>
        <div className="flex gap-1 rounded-full border border-line p-0.5">
          {(["map", "grid"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={
                "rounded-full px-4 py-1.5 text-sm transition-colors " +
                (view === v ? "bg-pine text-paper" : "text-ink hover:bg-mist")
              }
            >
              {v === "map" ? "Map" : "List"}
            </button>
          ))}
        </div>
      </div>

      {showGrid ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {[...pins]
            .sort((a, b) => b.count - a.count || a.district.localeCompare(b.district))
            .map((p) => (
              <li key={p.district}>
                <Link
                  to={`/guides?district=${encodeURIComponent(p.district)}`}
                  className="flex items-baseline justify-between gap-2 border-b border-line py-2 hover:border-sage"
                >
                  <span className="text-ink">{p.district}</span>
                  <span className="font-mono text-sm text-muted">{p.count}</span>
                </Link>
              </li>
            ))}
        </ul>
      ) : (
        // Relative, because the loading cover sits over the canvas.
        <div className="relative h-[420px] w-full sm:h-[520px]">
          <div
            ref={el}
            className="h-full w-full overflow-hidden rounded-md border border-line bg-mist"
          />
          {/* Markers are DOM overlays and land immediately; the OSM tiles
              behind them arrive over the network a beat later. That beat used
              to read as a broken map — numbered pins floating on a flat green
              field. A shimmer says "loading" instead, and clears on the map's
              first idle, which is when the visible tiles have actually
              painted. */}
          {!ready && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
              <Skeleton className="h-full w-full" />
              <p className="absolute inset-x-0 bottom-4 text-center text-caption text-muted">
                Drawing Nepal&hellip;
              </p>
            </div>
          )}
        </div>
      )}
      {failed && view === "map" && (
        <p className="mt-2 text-caption text-muted">
          The map couldn't load here — the list shows the same thing.
        </p>
      )}
    </div>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
