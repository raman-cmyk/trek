import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { DISTRICT_CENTRES, NEPAL_BOUNDS, ROUTE_LINES } from "~/lib/geo";

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
 * MapLibre is ~200 kB and cannot server-render, so it is imported lazily on
 * mount and only when the map tab is actually shown — the homepage still SSRs
 * to complete HTML, and a visitor who never opens the map never pays for it.
 * The grid tab is the no-JavaScript answer and renders the same data.
 *
 * Tiles are OpenStreetMap raster (docs/02: MapLibre GL + OSM). Swapping in
 * Baato when the founder has a key is a one-line change to STYLE.
 */
const STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

export function GuideMap({ pins, routes }: { pins: MapPin[]; routes: MapRoute[] }) {
  const [view, setView] = useState<"map" | "grid">("map");
  const el = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (view !== "map" || !el.current) return;
    let map: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const [maplibregl] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled || !el.current) return;

        const m = new maplibregl.Map({
          container: el.current,
          style: STYLE,
          bounds: NEPAL_BOUNDS,
          fitBoundsOptions: { padding: 28 },
          attributionControl: { compact: true },
          // The map is a "look how much of Nepal we cover" device, not a
          // navigation tool — free-roam zoom just gets people lost.
          maxZoom: 10,
          minZoom: 5,
          dragRotate: false,
        });
        map = m;
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        // Tile fetches fail on locked-down networks; that must not take the
        // whole map down, and it must not spam the console either.
        m.on("error", () => {});

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
      map?.remove();
    };
  }, [view, pins, routes]);

  const total = pins.reduce((s, p) => s + p.count, 0);
  const showGrid = view === "grid" || failed;

  return (
    <div>
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
        <div
          ref={el}
          className="h-[420px] w-full overflow-hidden rounded-md border border-line bg-mist sm:h-[520px]"
        />
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
