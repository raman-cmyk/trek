import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { MAP_INK, MAP_STYLE } from "~/lib/map-style";
import {
  guidesForTrail,
  linkLabel,
  rankTrails,
  trailGuideLabel,
  trailsForGuide,
  tourStops,
  trailBounds,
  trailFacts,
  type AtlasGuide,
  type AtlasTrail,
} from "~/lib/atlas";
import {
  buildGazetteer,
  searchPlaces,
  type AtlasPlace,
} from "~/lib/atlas-search";
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
  districts = [],
}: {
  trails: AtlasTrail[];
  guides: AtlasGuide[];
  offerings: { guideId: string; routeSlug: string }[];
  districts?: { name: string; lng: number; lat: number; guides: number }[];
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
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);

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
  /** Everyone on the active trail, by id, so a marker can ask about itself. */
  const onTrail = useMemo(
    () => new Map(activeGuides.map((g) => [g.guide.id, g.kind])),
    [activeGuides],
  );
  const gazetteer = useMemo(
    () => buildGazetteer({ trails, districts }),
    [trails, districts],
  );
  const openPerson = useMemo(
    () => guides.find((g) => g.id === openGuide) ?? null,
    [guides, openGuide],
  );
  /**
   * Tap anybody and their trails light up — including the ones they walk that
   * you were not looking at. That is the reverse of the rail and the reason
   * every guide is on the map at once: the country is browsable by person,
   * not only by route.
   */
  const openPersonTrails = useMemo(
    () => (openPerson ? trailsForGuide(openPerson, trails, offerings) : []),
    [openPerson, trails, offerings],
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

  /**
   * Every guide, once, and then never rebuilt.
   *
   * The first version hung markers on the active trail and tore them all down
   * on every change, so the country was empty between trails and the faces
   * flickered on each tour step. Building them once and restyling is both
   * calmer and what the founder asked for: everybody is on the map, all the
   * time, small enough that fifty of them is a scattering rather than a mess.
   */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      const m = mapRef.current;
      if (cancelled || !m) return;
      for (const guide of guides) {
        if (markers.current.has(guide.id)) continue;
        const node = document.createElement("button");
        node.type = "button";
        node.className = "atlas-face";
        node.setAttribute("aria-label", guide.name);
        node.title = guide.name;
        node.innerHTML = `
          <span class="atlas-face-ring">
            ${
              guide.avatar
                ? `<img src="${escapeAttr(guide.avatar)}" alt="" loading="lazy" />`
                : `<span class="atlas-face-initial">${escapeHtml(guide.name.slice(0, 1))}</span>`
            }
          </span>`;
        node.addEventListener("click", (e) => {
          e.stopPropagation();
          setTouring(false);
          setOpenGuide((cur) => (cur === guide.id ? null : guide.id));
        });
        markers.current.set(
          guide.id,
          new maplibregl.Marker({ element: node }).setLngLat([guide.lng, guide.lat]).addTo(m),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, guides]);

  // Who is lit, who is quiet. Classes only — no marker is created or
  // destroyed here, so the map never blinks.
  useEffect(() => {
    for (const [id, mk] of markers.current) {
      const node: HTMLElement | undefined = mk.getElement?.();
      if (!node) continue;
      const kind = onTrail.get(id);
      const open = id === openGuide;
      node.classList.toggle("is-on", Boolean(kind));
      node.classList.toggle("is-sells", kind === "sells");
      node.classList.toggle("is-open", open);
      // A face nobody is looking at must not sit on top of one they are.
      node.style.zIndex = open ? "4" : kind ? "3" : "1";
    }
  }, [onTrail, openGuide, ready, guides]);

  // The trail highlight: the chosen trail, or — if somebody is open — every
  // trail that person walks.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    const lit = openPersonTrails.length ? openPersonTrails : active ? [active] : [];
    for (const id of ["trail-active", "trail-active-casing"]) {
      if (m.getLayer(id)) {
        m.setFilter(id, ["in", ["get", "slug"], ["literal", lit]]);
      }
    }
    if (m.getLayer("trail-all")) {
      m.setPaintProperty("trail-all", "line-opacity", lit.length ? 0.18 : 0.5);
    }
  }, [active, ready, openPersonTrails]);

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

  const results = useMemo(
    () => (query.trim() ? searchPlaces(gazetteer, query) : []),
    [gazetteer, query],
  );
  const openKind = onTrail.get(openGuide ?? "") ?? null;

  /** Go to a searched place — and select its trek, if it belongs to one. */
  const goTo = useCallback(
    (place: AtlasPlace) => {
      setTouring(false);
      setQuery("");
      setHit(0);
      setOpenGuide(null);
      if (place.kind === "trail" && place.trailSlug) {
        setActive(place.trailSlug);
        return;
      }
      setActive(place.trailSlug ?? null);
      mapRef.current?.flyTo?.({
        center: [place.lng, place.lat],
        zoom: place.zoom,
        pitch: 55,
        duration: 2200,
      });
    },
    [],
  );

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
              {ranked.slice(0, 10).map((r) => (
                <button
                  key={r.trail.slug}
                  type="button"
                  onClick={() => {
                    setTouring(false);
                    setOpenGuide(null);
                    setActive(r.trail.slug);
                  }}
                  className={cn(
                    "glass-dark shrink-0 rounded-card px-3 py-2 text-left transition",
                    active === r.trail.slug
                      ? "ring-2 ring-chartreuse"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  <span className="block text-sm font-medium text-white">{r.trail.name}</span>
                  <span className="block text-caption text-white/70">
                    {trailGuideLabel(r)}
                    {trailFacts(r.trail) ? ` · ${trailFacts(r.trail)}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search. Top-right on a laptop, across the top on a phone, where a
            thumb already is. Our own places only — every hit is somewhere we
            can take you. */}
        {ready && (
          <div className="absolute inset-x-3 top-3 sm:left-auto sm:right-3 sm:w-72">
            <div className="glass-dark rounded-card">
              <label className="sr-only" htmlFor="atlas-search">
                Search a place in Nepal
              </label>
              <input
                id="atlas-search"
                type="search"
                autoComplete="off"
                value={query}
                placeholder="Search a place — Manang, Namche…"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHit(0);
                }}
                onKeyDown={(e) => {
                  if (!results.length) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHit((h) => (h + 1) % results.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHit((h) => (h - 1 + results.length) % results.length);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    goTo(results[hit] ?? results[0]);
                  } else if (e.key === "Escape") {
                    setQuery("");
                  }
                }}
                className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/55 focus:outline-none"
              />
            </div>
            {query.trim() !== "" && (
              <ul className="mt-1 overflow-hidden rounded-card border border-line bg-card shadow-lift">
                {results.length === 0 && (
                  <li className="px-3 py-2 text-caption text-muted">
                    Nowhere we walk by that name — yet.
                  </li>
                )}
                {results.map((place, i) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHit(i)}
                      onClick={() => goTo(place)}
                      className={cn(
                        "block w-full px-3 py-2 text-left",
                        i === hit ? "bg-mist" : "hover:bg-mist",
                      )}
                    >
                      <span className="block text-sm font-medium text-ink">{place.name}</span>
                      <span className="block text-caption text-muted">{place.sub}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* The person you tapped. Anybody on the map, not only the people on
            the trail you happened to be looking at. */}
        {openPerson && (
          <div className="absolute inset-x-3 bottom-20 rounded-card border border-line bg-card p-4 shadow-lift sm:inset-x-auto sm:bottom-11 sm:right-3 sm:w-64">
            <button
              type="button"
              onClick={() => setOpenGuide(null)}
              aria-label="Close"
              className="float-right -mr-1 -mt-1 px-1 text-muted hover:text-ink"
            >
              ×
            </button>
            <p className="font-medium text-ink">{openPerson.name}</p>
            <p className="text-caption text-muted">
              {openKind
                ? linkLabel(openKind)
                : openPersonTrails.length
                  ? `Walks ${openPersonTrails.length} ${openPersonTrails.length === 1 ? "trek" : "treks"} on this map`
                  : openPerson.district
                    ? `Based in ${openPerson.district}`
                    : "Verified guide"}
            </p>
            {openPerson.hook && (
              <p className="mt-1.5 text-sm text-ink-soft">“{openPerson.hook}”</p>
            )}
            <Link
              to={`/guides/${openPerson.slug}`}
              prefetch="intent"
              className="mt-3 inline-block text-sm font-medium text-moss underline underline-offset-4"
            >
              Meet {firstWord(openPerson.name)} →
            </Link>
          </div>
        )}

        {ready && active && (
          // Not bottom-right: the guide card lives there now, and a hint
          // underneath a card is a hint nobody reads.
          <p className="pointer-events-none absolute bottom-3 left-72 hidden text-caption text-white/70 lg:block">
            {touring ? "Touring Nepal — pick a trail to stop" : "Drag to look around"}
          </p>
        )}
      </div>

      {/* The same thing, without a map. This is what a search engine and a
          browser with JavaScript off get, and it says exactly as much. */}
      <noscript>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {ranked.slice(0, 6).map((r) => (
            <li key={r.trail.slug} className="rounded-card border border-line bg-card p-4">
              <Link to={`/routes/${r.trail.slug}`} className="font-medium text-ink">
                {r.trail.name}
              </Link>
              <p className="text-caption text-muted">
                {trailGuideLabel(r)}
                {trailFacts(r.trail) ? ` · ${trailFacts(r.trail)}` : ""}
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
