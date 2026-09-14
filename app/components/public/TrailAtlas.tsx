import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { MAP_INK, MAP_STYLE } from "~/lib/map-style";
import {
  guidesForTrail,
  linkLabel,
  rankTrails,
  tourStops,
  trailBounds,
  trailFacts,
  type AtlasGuide,
  type AtlasTrail,
} from "~/lib/atlas";
import { cn } from "~/lib/cn";

/**
 * Pick a trail. Meet the people who walk it.
 *
 * The homepage map used to show numbered bubbles over districts — a map of
 * administrative density, which is the least interesting thing this company
 * knows. Nobody chooses a guide because Lamjung contains one of them.
 *
 * This shows the two things that are actually ours: the trails of Nepal on
 * real terrain, and the named, verified people who walk them — wired to each
 * other. Choose Everest Base Camp and its guides surface as faces; the rest
 * of the country dims. That is the positioning made operable rather than
 * written on a banner.
 *
 * Left alone it tours itself. Nobody reads "click a trail", but everybody
 * understands a map that is already moving.
 *
 * The whole thing is progressive: the server renders the same trails and the
 * same faces as an ordinary list underneath, so with JavaScript off, or
 * before 900kB of MapLibre arrives, the page still says who walks where.
 */
export function TrailAtlas({
  trails,
  guides,
  offerings,
}: {
  trails: AtlasTrail[];
  guides: AtlasGuide[];
  offerings: { guideId: string; routeSlug: string }[];
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [touring, setTouring] = useState(true);
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const ranked = useMemo(
    () => rankTrails(trails, guides, offerings),
    [trails, guides, offerings],
  );
  const tour = useMemo(() => tourStops(ranked), [ranked]);
  const activeTrail = useMemo(
    () => ranked.find((r) => r.trail.slug === active)?.trail ?? null,
    [ranked, active],
  );
  const activeGuides = useMemo(
    () => (activeTrail ? guidesForTrail(activeTrail, guides, offerings) : []),
    [activeTrail, guides, offerings],
  );

  // 900kB of MapLibre does not download until the atlas is nearly on screen.
  useEffect(() => {
    if (!wrap.current || near) return;
    const io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "200px" },
    );
    io.observe(wrap.current);
    return () => io.disconnect();
  }, [near]);

  const flyTo = useCallback((trail: AtlasTrail) => {
    const m = mapRef.current;
    const b = trailBounds(trail);
    if (!m || !b) return;
    m.fitBounds(b, { padding: 90, pitch: 55, bearing: -18, duration: 2600 });
  }, []);

  // Build the map once.
  useEffect(() => {
    if (!near || !el.current || mapRef.current) return;
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
          style: MAP_STYLE as any,
          bounds: [
            [80.3, 26.3],
            [88.3, 30.5],
          ],
          fitBoundsOptions: { padding: 24 },
          attributionControl: { compact: true },
          pitch: 40,
          bearing: -12,
          maxPitch: 75,
          dragRotate: true,
        });
        mapRef.current = m;
        m.on("error", () => {});

        const build = () => {
          if (m.getSource("trails")) return;
          try {
            m.setTerrain({ source: "dem", exaggeration: 1.5 });
          } catch {
            /* flat is survivable */
          }

          m.addSource("trails", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: ranked.map(({ trail }) => ({
                type: "Feature" as const,
                properties: { slug: trail.slug, name: trail.name },
                geometry: { type: "LineString" as const, coordinates: trail.coords },
              })),
            },
          });

          // Every trail, quiet. The country reads as a network of walks
          // rather than an empty mountain range.
          m.addLayer({
            id: "trail-all",
            type: "line",
            source: "trails",
            paint: {
              "line-color": "#ffffff",
              "line-width": 1.6,
              "line-opacity": 0.5,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          // The chosen one, over the top.
          m.addLayer({
            id: "trail-active-casing",
            type: "line",
            source: "trails",
            filter: ["==", ["get", "slug"], ""],
            paint: { "line-color": "#0d1a12", "line-width": 9, "line-opacity": 0.55 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          m.addLayer({
            id: "trail-active",
            type: "line",
            source: "trails",
            filter: ["==", ["get", "slug"], ""],
            paint: { "line-color": MAP_INK.trail, "line-width": 3.6 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          setReady(true);
        };
        // 'styledata', not 'load': load waits for a complete render, which
        // never comes when a tile host is slow, and then nothing is drawn at
        // all on exactly the connection that needed it.
        if (m.isStyleLoaded()) build();
        else m.once("styledata", build);

        // Any touch of the map is a person taking over; stop the tour.
        const stop = () => setTouring(false);
        m.on("dragstart", stop);
        m.on("zoomstart", stop);
        m.on("rotatestart", stop);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near]);

  // The chosen trail: highlight it, and hang the faces on it.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    for (const id of ["trail-active", "trail-active-casing"]) {
      if (m.getLayer(id)) m.setFilter(id, ["==", ["get", "slug"], active ?? ""]);
    }
    if (m.getLayer("trail-all")) {
      m.setPaintProperty("trail-all", "line-opacity", active ? 0.18 : 0.5);
    }

    for (const [, mk] of markers.current) mk.remove();
    markers.current.clear();
    if (!activeTrail) return;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      for (const { guide, kind } of activeGuides) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "atlas-face";
        node.setAttribute("aria-label", `${guide.name} — ${linkLabel(kind)}`);
        node.innerHTML = `
          <span class="atlas-face-ring ${kind === "sells" ? "is-sells" : ""}">
            ${
              guide.avatar
                ? `<img src="${escapeAttr(guide.avatar)}" alt="" loading="lazy" />`
                : `<span class="atlas-face-initial">${escapeHtml(guide.name.slice(0, 1))}</span>`
            }
          </span>
          <span class="atlas-face-name">${escapeHtml(firstWord(guide.name))}</span>`;
        node.addEventListener("click", (e) => {
          e.stopPropagation();
          setOpenGuide((cur) => (cur === guide.id ? null : guide.id));
        });
        const mk = new maplibregl.Marker({ element: node })
          .setLngLat([guide.lng, guide.lat])
          .addTo(m);
        markers.current.set(guide.id, mk);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, activeTrail]);

  // Fly when the choice changes.
  useEffect(() => {
    if (activeTrail && ready) flyTo(activeTrail);
  }, [activeTrail, ready, flyTo]);

  // The tour. Stops the moment somebody chooses for themselves.
  useEffect(() => {
    if (!ready || !touring || tour.length === 0) return;
    let i = 0;
    setActive(tour[0].slug);
    const t = setInterval(() => {
      i = (i + 1) % tour.length;
      setActive(tour[i].slug);
    }, 7000);
    return () => clearInterval(t);
  }, [ready, touring, tour]);

  const chosen = activeGuides.find((g) => g.guide.id === openGuide);

  return (
    <div ref={wrap}>
      <div className="relative overflow-hidden rounded-photo border border-line bg-[#22301f]">
        <div ref={el} className="h-[420px] w-full sm:h-[560px]" />

        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-[#22301f] text-sm text-white/70">
            Bringing up Nepal…
          </div>
        )}

        {/* The trail rail. Horizontal on a phone, a column on a laptop — it
            is the control for the whole thing and must never be a scroll
            away from the map it controls. */}
        {ready && (
          // On a phone the attribution wraps to two lines across the bottom
          // of the map and swallowed this rail whole — the control for the
          // entire experience, invisible. It sits above the credit now.
          <div className="pointer-events-none absolute inset-x-0 bottom-11 p-3 sm:inset-y-0 sm:bottom-0 sm:right-auto sm:w-64 sm:p-4">
            <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1 sm:h-full sm:flex-col sm:overflow-y-auto sm:pb-0">
              {ranked.slice(0, 10).map(({ trail, guideCount }) => (
                <button
                  key={trail.slug}
                  type="button"
                  onClick={() => {
                    setTouring(false);
                    setOpenGuide(null);
                    setActive(trail.slug);
                  }}
                  className={cn(
                    "glass-dark shrink-0 rounded-card px-3 py-2 text-left transition",
                    active === trail.slug
                      ? "ring-2 ring-chartreuse"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  <span className="block text-sm font-medium text-white">{trail.name}</span>
                  <span className="block text-caption text-white/70">
                    {guideCount} {guideCount === 1 ? "guide" : "guides"}
                    {trailFacts(trail) ? ` · ${trailFacts(trail)}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* The person you tapped. */}
        {chosen && (
          <div className="absolute right-3 top-3 w-64 rounded-card border border-line bg-card p-4 shadow-lift">
            <p className="font-medium text-ink">{chosen.guide.name}</p>
            <p className="text-caption text-muted">{linkLabel(chosen.kind)}</p>
            {chosen.guide.hook && (
              <p className="mt-1.5 text-sm text-ink-soft">“{chosen.guide.hook}”</p>
            )}
            <Link
              to={`/guides/${chosen.guide.slug}`}
              prefetch="intent"
              className="mt-3 inline-block text-sm font-medium text-moss underline underline-offset-4"
            >
              Meet {firstWord(chosen.guide.name)} →
            </Link>
          </div>
        )}

        {ready && active && (
          <p className="pointer-events-none absolute right-3 bottom-3 hidden text-caption text-white/70 sm:block">
            {touring ? "Touring Nepal — pick a trail to stop" : "Drag to look around"}
          </p>
        )}
      </div>

      {/* The same thing, without a map. This is what a search engine and a
          browser with JavaScript off get, and it says exactly as much. */}
      <noscript>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {ranked.slice(0, 6).map(({ trail, guideCount }) => (
            <li key={trail.slug} className="rounded-card border border-line bg-card p-4">
              <Link to={`/routes/${trail.slug}`} className="font-medium text-ink">
                {trail.name}
              </Link>
              <p className="text-caption text-muted">
                {guideCount} guides · {trailFacts(trail)}
              </p>
            </li>
          ))}
        </ul>
      </noscript>
    </div>
  );
}

function firstWord(s: string) {
  return (s ?? "").trim().split(/\s+/)[0] || s;
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
