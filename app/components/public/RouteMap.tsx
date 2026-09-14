import { useEffect, useRef, useState } from "react";
import type { DayStop } from "./ElevationScrubber";
import { MAP_INK, MAP_STYLE } from "~/lib/map-style";
import {
  daysSentence,
  groupIsActive,
  groupStops,
  highestGroup,
  isTravelOnly,
  legCoords,
  legsOfRoute,
  locatedStops,
  pinLabel,
  spreadPins,
  walkingBounds,
  type StopGroup,
} from "~/lib/map-stops";

/**
 * The route drawn from its own day stops, with a pin per overnight.
 *
 * Same lazy-MapLibre approach as the homepage map: nothing loads until the
 * component mounts, the page still server-renders without it, and a blocked
 * tile host degrades to the day list rather than a grey rectangle.
 *
 * `activeDay` is driven by the elevation scrubber above it, so dragging along
 * the profile walks the pin along the map.
 *
 * ONE PIN PER PLACE, not per day. Almost every Nepal trek is an out-and-back:
 * you sleep in Namche on the way up and again on the way down, so two days
 * shared one set of coordinates and the later marker sat exactly on top of
 * the earlier one. Scrubbing to Day 2 grew a pin nobody could see, underneath
 * Day 11. The pin now carries every day spent there — "2 · 11" — and lights
 * up for any of them, which is also the truer picture: Namche is one village
 * you pass twice.
 */
export function RouteMap({
  stops,
  activeDay,
  className,
}: {
  stops: DayStop[];
  activeDay?: number | null;
  className?: string;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<StopGroup, HTMLElement>>(new Map());
  const markerRefs = useRef<Map<HTMLElement, any>>(new Map());
  const [failed, setFailed] = useState(false);
  // Read inside marker event handlers, which are created once and would
  // otherwise close over the activeDay of the render that made them.
  const activeRef = useRef<number | null | undefined>(activeDay);
  activeRef.current = activeDay;
  const cleanupRef = useRef<(() => void) | null>(null);

  const located = locatedStops(stops);
  const groups = groupStops(stops);

  useEffect(() => {
    if (!el.current || located.length < 2) return;
    let cancelled = false;

    (async () => {
      try {
        const [maplibregl] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled || !el.current) return;

        // Framed on the WALK. Nearly every itinerary ends by flying or
        // driving home — Lukla to Kathmandu is 156km — and including that leg
        // in the bounds shrank the actual trek to a squiggle in the corner of
        // a map mostly showing somewhere nobody walks.
        const b = walkingBounds(stops)!;
        const m = new maplibregl.Map({
          container: el.current,
          style: MAP_STYLE as any,
          bounds: [
            [b.west, b.south],
            [b.east, b.north],
          ],
          fitBoundsOptions: { padding: { top: 56, right: 56, bottom: 84, left: 56 } },
          attributionControl: { compact: true },
          // Tilted, and free to rotate. This was pulled once for being
          // unverifiable here and put straight back when the founder sent a
          // screenshot of it working: a Himalayan valley is worth looking
          // along, not only down at.
          dragRotate: true,
          pitch: 52,
          maxPitch: 75,
        });
        mapRef.current = m;
        // Swallowed deliberately: a failed tile must not throw. Note for the
        // next person — this also hides style and layer errors, so if a layer
        // is silently missing, log here first.
        m.on("error", () => {});
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        const allLegs = legsOfRoute(stops);
        // A trailhead you flew into is still where the walk begins; Kathmandu
        // at the end is not the finish of a trek, it is the airport.
        const walked = groups.filter((g) => !isTravelOnly(g, allLegs));
        const top = highestGroup(walked.length ? walked : groups);
        const first = (walked.length ? walked : groups)[0];
        const lastList = walked.length ? walked : groups;
        const last = lastList[lastList.length - 1];

        for (const g of groups) {
          // Start, summit and finish are the three things somebody reads a
          // trek map for. Everything else is a night's stop and looks like
          // one.
          const isStart = g === first;
          const isEnd = g === last && last !== first;
          const isTop = top != null && g === top && !isStart && !isEnd;

          // Two elements on purpose. MapLibre owns the outer one's transform
          // to place it on the map; anything we scale or nudge has to happen
          // on an inner node or it fights the map for the same property.
          const node = document.createElement("div");
          const pin = document.createElement("div");
          node.appendChild(pin);
          pin.className =
            "flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-full border-2 " +
            "border-paper px-1.5 font-mono text-[11px] font-semibold text-paper shadow-lift " +
            "transition-transform duration-150";
          const onlyTravel = isTravelOnly(g, allLegs);
          const base = onlyTravel
            ? MAP_INK.travel
            : isStart
              ? MAP_INK.start
              : isTop
                ? MAP_INK.summit
                : MAP_INK.pin;
          pin.style.backgroundColor = base;
          // Kept on the node so restoring after a scrub does not repaint the
          // start pin the same dark green as every other night.
          pin.dataset.base = base;
          pin.textContent = pinLabel(g.days);
          pin.setAttribute(
            "aria-label",
            `${daysSentence(g.days)}: ${g.place}, ${g.altitude_m} metres`,
          );
          // Grouping fixes pins that share a coordinate. Two DIFFERENT
          // villages an hour apart still land within a few pixels of each
          // other when the whole trek is on screen, and the one underneath
          // becomes unreadable. Pointing at a pin lifts it out — cheap, and
          // it makes a crowded valley explorable rather than a clump.
          pin.addEventListener("mouseenter", () => {
            node.style.zIndex = "3";
            if (!groupIsActive(g, activeRef.current)) pin.style.transform = "scale(1.2)";
          });
          pin.addEventListener("mouseleave", () => {
            const on = groupIsActive(g, activeRef.current);
            node.style.zIndex = on ? "2" : "";
            pin.style.transform = on ? "scale(1.5)" : "";
          });

          // Who keeps their number when two pins collide. The start, the
          // top and the finish are what a trek map is read for; after that,
          // earlier days win so the sequence stays legible from the bottom.
          pin.dataset.priority = String(
            isStart ? 0 : isTop ? 1 : isEnd ? 2 : 10 + g.firstDay,
          );

          markersRef.current.set(g, pin);

          const badge = onlyTravel
            ? "Getting there"
            : isStart
              ? "The walk starts here"
              : isEnd
                ? "The walk ends here"
                : isTop
                  ? "Highest point"
                  : "";

          const marker = new maplibregl.Marker({ element: node })
            .setLngLat([g.lng, g.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
                `<div style="font-family:inherit;font-size:13px;line-height:1.45">
                   ${badge ? `<span style="display:inline-block;margin-bottom:2px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b63">${badge}</span><br>` : ""}
                   <strong>${escapeHtml(g.place)}</strong><br>
                   <span style="color:#6b6b63">${daysSentence(g.days)} · ${g.altitude_m.toLocaleString("en-US")} m</span>
                 </div>`,
              ),
            )
            .addTo(m);
          // Registered after the marker exists, so the spread pass can move it.
          markerRefs.current.set(pin, marker);
        }

        // Push pins apart when they land on top of each other. Nothing is
        // ever hidden: a day that disappears from the map is a day the reader
        // thinks we lost, which is the complaint this is here to answer.
        const declutterPins = () => {
          const boxes = [];
          for (const [g, pinEl] of markersRef.current) {
            const pt = m.project([g.lng, g.lat]);
            boxes.push({
              key: pinEl,
              x: pt.x,
              y: pt.y,
              w: 30,
              h: 28,
              // The pin being scrubbed to never moves: it is the one being
              // looked at, so everything else gets out of its way.
              priority: groupIsActive(g, activeRef.current)
                ? -1
                : Number(pinEl.dataset.priority ?? 99),
            });
          }
          const moved = spreadPins(boxes, 3);
          for (const [, pinEl] of markersRef.current) {
            const d = moved.get(pinEl);
            const marker = markerRefs.current.get(pinEl);
            marker?.setOffset?.([d?.dx ?? 0, d?.dy ?? 0]);
          }
        };
        m.on("move", declutterPins);
        m.on("zoom", declutterPins);

        const draw = () => {
          if (m.getSource("route")) return;

          // The third dimension. Wrapped because a DEM tile host that is slow
          // or blocked must not take the map down with it — the imagery, the
          // trail and the pins are the parts that have to work.
          try {
            m.setTerrain({ source: "dem", exaggeration: 1.4 });
          } catch {
            /* flat is survivable; blank is not */
          }

          const legs = legsOfRoute(stops);

          m.addSource("route", {
            type: "geojson",
            // Needed for the gradient below: MapLibre has to know how far
            // along the line each point is.
            lineMetrics: true,
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "MultiLineString",
                // Only the legs actually walked. The flight home used to be
                // drawn as a trekking line straight across the country.
                coordinates: legCoords(legs, "walk"),
              },
            },
          });

          // The way in and the way home, when they are not on foot. Dashed
          // and quiet: it is part of the trip and belongs on the map, but it
          // is not the trek and should never be mistaken for it.
          const travel = legCoords(legs, "travel");
          if (travel.length) {
            m.addSource("travel", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "MultiLineString", coordinates: travel },
              },
            });
            m.addLayer({
              id: "travel-line",
              type: "line",
              source: "travel",
              paint: {
                "line-color": "#ffffff",
                "line-width": 1.6,
                "line-opacity": 0.5,
                "line-dasharray": [1, 2.5],
              },
              layout: { "line-cap": "round" },
            });
          }

          // The trail itself. A casing underneath so it reads over both a
          // dark forest and a white glacier — a single green line disappears
          // into one or the other, and a topo map has plenty of both.
          m.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            // Wider and darker than it would be on paper: the trail has to
            // hold its own over snow, bare rock and near-black forest, often
            // within the same hundred metres.
            paint: { "line-color": "#0d1a12", "line-width": 8, "line-opacity": 0.5 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          m.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: {
              "line-width": 3.6,
              // Solid, not a gradient. line-gradient only works on a single
              // LineString, and the walk is a MultiLineString once the travel
              // legs are cut out of it — so the gradient version rendered
              // nothing at all, silently. The numbered pins already say which
              // way round you walk it.
              // Chartreuse, not the brand's forest green: over satellite
              // imagery a dark green line is camouflage.
              "line-color": MAP_INK.trail,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        };
        // 'styledata', not 'load'. `load` waits for the first complete
        // render, which never happens when a tile host is slow or partly
        // blocked — and then the trail is simply never drawn, on exactly the
        // connection where somebody needs it most. 'styledata' fires as soon
        // as the style is parsed, which is all addSource and addLayer need.
        if (m.isStyleLoaded()) draw();
        else m.once("styledata", draw);
        // Called directly rather than hung on 'idle'. A map whose tile host
        // is slow or blocked never goes idle, and the pins would have stayed
        // in a clump on exactly the connection where that matters most.
        declutterPins();
        const settle = setTimeout(declutterPins, 400);
        cleanupRef.current = () => clearTimeout(settle);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      markersRef.current.clear();
      markerRefs.current.clear();
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  // Follow the scrubber: grow the active pin and ease the map to it.
  useEffect(() => {
    for (const [group, node] of markersRef.current) {
      const on = groupIsActive(group, activeDay);
      node.style.transform = on ? "scale(1.5)" : "";
      // z-index belongs on the element MapLibre positions, not the inner pin.
      if (node.parentElement) node.parentElement.style.zIndex = on ? "2" : "";
      if (on) {
        node.style.backgroundColor = "var(--color-chartreuse)";
        node.style.color = "var(--color-pine)";
      } else {
        // Back to whatever this pin is — start, summit or an ordinary night —
        // rather than to a single default that would repaint the start pin
        // dark the first time somebody scrubbed past it.
        node.style.color = "";
        node.style.backgroundColor = node.dataset.base ?? MAP_INK.pin;
      }
    }
    const g = groups.find((x) => groupIsActive(x, activeDay));
    if (g && mapRef.current?.easeTo) {
      // easeTo fires 'move', which re-runs the declutter pass — so the pin
      // being scrubbed to always comes back at full size with its number,
      // even if a neighbour had collapsed it a moment ago.
      mapRef.current.easeTo({ center: [g.lng, g.lat], duration: 400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay]);

  if (located.length < 2 || failed) {
    return (
      <p className="rounded-md border border-line bg-mist p-4 text-sm text-muted">
        The map couldn't load here — the day-by-day list below has every stop.
      </p>
    );
  }

  return (
    <div
      ref={el}
      className={
        className ?? "h-[360px] w-full overflow-hidden rounded-md border border-line bg-mist sm:h-[460px]"
      }
    />
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
