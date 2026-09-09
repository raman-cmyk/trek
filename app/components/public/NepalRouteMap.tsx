import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { NEPAL_BOUNDS, ROUTE_LINES } from "~/lib/geo";
import { MAP_STYLE } from "~/lib/map-style";
import { Skeleton } from "~/components/skeletons/Shimmer";
import { cn } from "~/lib/cn";

export interface MappedRoute {
  slug: string;
  name: string;
  region: string;
  days: number | null;
  maxAltitudeM: number | null;
}

/**
 * The routes, on a tilted map of Nepal.
 *
 * Not to be confused with RouteMap, which draws ONE route from its day stops
 * on a route page. This is the index's map: every route we run, at once.
 *
 * The routes index was a wall of identical cards, which is the least
 * interesting way to present the one thing that is actually geographic. This
 * is the same data as a place: the camera is pitched, the ranges have relief,
 * and every route we run is a line you can touch.
 *
 * Terrain is progressive, not required. Real 3D needs an elevation tile source
 * (AWS's public terrarium set), and a public tile host that is slow or blocked
 * must degrade to a flat pitched map rather than to a grey box — so the DEM is
 * added inside a try, its failures are swallowed, and everything else works
 * without it.
 *
 * The list underneath is the page. It is server-rendered, it is what Google
 * reads, and it is the whole content of this component with JavaScript off:
 * the map is the enjoyable way in, never the only one.
 */
export function NepalRouteMap({ routes }: { routes: MappedRoute[] }) {
  const el = useRef<HTMLDivElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const drawn = routes.filter((r) => ROUTE_LINES[r.slug]);

  // Nothing is fetched until it is nearly on screen: MapLibre is most of a
  // megabyte, and this sits at the top of a page whose job is the list.
  useEffect(() => {
    if (!wrap.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !el.current) return;
    let map: any;
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
          fitBoundsOptions: { padding: 40 },
          attributionControl: { compact: true },
          // Tilted, and the tilt is the point: flat, this is a diagram of
          // Nepal; pitched, it is a country with mountains in it.
          pitch: 55,
          bearing: -12,
          maxPitch: 70,
          minZoom: 5,
          maxZoom: 12,
          fadeDuration: 0,
        });
        map = m;
        m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        m.on("error", () => {});

        const clear = () => !cancelled && setReady(true);
        m.on("load", clear);
        m.on("idle", clear);
        m.on("error", clear);
        coverTimer = setTimeout(clear, 3000);

        m.on("load", () => {
          if (cancelled) return;

          // ── Relief, if the world will give it to us ──────────────────
          // A public DEM host that is slow, rate-limited or blocked must cost
          // us the relief and nothing else.
          try {
            m.addSource("dem", {
              type: "raster-dem",
              tiles: ["https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"],
              encoding: "terrarium",
              tileSize: 256,
              maxzoom: 12,
              attribution: "Elevation: Mapzen / AWS Terrain Tiles",
            } as any);
            m.setTerrain({ source: "dem", exaggeration: 1.4 });
            m.addLayer({
              id: "hillshade",
              type: "hillshade",
              source: "dem",
              paint: { "hillshade-exaggeration": 0.45 },
            });
          } catch {
            // Flat it is.
          }

          // ── The routes ───────────────────────────────────────────────
          m.addSource("routes", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: drawn.map((r) => ({
                type: "Feature" as const,
                properties: { slug: r.slug, name: r.name },
                geometry: { type: "LineString" as const, coordinates: ROUTE_LINES[r.slug] },
              })),
            },
          } as any);

          // Two lines per route: a soft wide one under a hard thin one, so a
          // trail reads against both a dark forest and a pale glacier.
          m.addLayer({
            id: "routes-glow",
            type: "line",
            source: "routes",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#ffffff",
              "line-width": 7,
              "line-opacity": 0.55,
              "line-blur": 2,
            },
          });
          m.addLayer({
            id: "routes-line",
            type: "line",
            source: "routes",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": [
                "case",
                ["boolean", ["feature-state", "on"], false],
                "#c2410c",
                "#1f5132",
              ],
              "line-width": ["case", ["boolean", ["feature-state", "on"], false], 5, 3],
            },
          } as any);

          m.addLayer({
            id: "routes-label",
            type: "symbol",
            source: "routes",
            layout: {
              "symbol-placement": "line-center",
              "text-field": ["get", "name"],
              "text-size": 12,
              "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            },
            paint: {
              "text-color": "#1b3b2a",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.6,
            },
          } as any);

          // Tap or hover a line: the list below follows it. One index by
          // slug, because feature-state needs the numeric id MapLibre
          // assigned and the page thinks in slugs.
          const idBySlug = new Map<string, number>();
          drawn.forEach((r, i) => idBySlug.set(r.slug, i));
          m.getSource("routes") &&
            (m.getSource("routes") as any).setData({
              type: "FeatureCollection",
              features: drawn.map((r, i) => ({
                type: "Feature" as const,
                id: i,
                properties: { slug: r.slug, name: r.name },
                geometry: { type: "LineString" as const, coordinates: ROUTE_LINES[r.slug] },
              })),
            });

          let lit: number | null = null;
          const light = (slug: string | null) => {
            if (lit !== null) m.setFeatureState({ source: "routes", id: lit }, { on: false });
            lit = slug != null ? (idBySlug.get(slug) ?? null) : null;
            if (lit !== null) m.setFeatureState({ source: "routes", id: lit }, { on: true });
            setActive(slug);
          };

          for (const layer of ["routes-line", "routes-glow"]) {
            m.on("mousemove", layer, (e: any) => {
              m.getCanvas().style.cursor = "pointer";
              light(e.features?.[0]?.properties?.slug ?? null);
            });
            m.on("mouseleave", layer, () => {
              m.getCanvas().style.cursor = "";
              light(null);
            });
            m.on("click", layer, (e: any) => {
              const slug = e.features?.[0]?.properties?.slug;
              if (slug) window.location.assign(`/routes/${slug}`);
            });
          }
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (coverTimer) clearTimeout(coverTimer);
      map?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near]);

  if (failed || drawn.length === 0) return null;

  return (
    <div ref={wrap} className="relative">
      <div
        ref={el}
        className="h-[22rem] w-full overflow-hidden rounded-card border border-line bg-mist sm:h-[30rem]"
        aria-label="The routes we run, on a map of Nepal"
      />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-card">
          <Skeleton className="h-full w-full" />
        </div>
      )}

      {/* The name under the cursor, and a way in on a phone where there is no
          hover to speak of. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5">
        {drawn.slice(0, 8).map((r) => (
          <Link
            key={r.slug}
            to={`/routes/${r.slug}`}
            className={cn(
              "pointer-events-auto rounded-pill border px-2.5 py-1 text-caption backdrop-blur",
              active === r.slug
                ? "border-ember bg-paper font-medium text-ink"
                : "border-line/60 bg-paper/85 text-ink-soft hover:text-ink",
            )}
          >
            {r.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
