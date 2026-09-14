import { useEffect, useRef, useState } from "react";
import type { DayStop } from "./ElevationScrubber";
import { MAP_INK, MAP_STYLE } from "~/lib/map-style";
import {
  daysSentence,
  groupIsActive,
  groupStops,
  highestGroup,
  locatedStops,
  pinLabel,
  routeLine,
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
  const [failed, setFailed] = useState(false);
  // Read inside marker event handlers, which are created once and would
  // otherwise close over the activeDay of the render that made them.
  const activeRef = useRef<number | null | undefined>(activeDay);
  activeRef.current = activeDay;

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

        const lngs = located.map((s) => s.lng);
        const lats = located.map((s) => s.lat);
        const m = new maplibregl.Map({
          container: el.current,
          style: MAP_STYLE as any,
          bounds: [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          fitBoundsOptions: { padding: 48 },
          attributionControl: { compact: true },
          dragRotate: false,
        });
        mapRef.current = m;
        m.on("error", () => {});
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        const top = highestGroup(groups);
        const first = groups[0];
        const last = groups[groups.length - 1];

        for (const g of groups) {
          // Start, summit and finish are the three things somebody reads a
          // trek map for. Everything else is a night's stop and looks like
          // one.
          const isStart = g === first;
          const isEnd = g === last && last !== first;
          const isTop = top != null && g === top && !isStart && !isEnd;

          const node = document.createElement("div");
          node.className =
            "flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-full border-2 " +
            "border-paper px-1.5 font-mono text-[11px] font-semibold text-paper shadow-lift " +
            "transition-transform duration-150";
          const base = isStart ? MAP_INK.start : isTop ? MAP_INK.summit : MAP_INK.pin;
          node.style.backgroundColor = base;
          // Kept on the node so restoring after a scrub does not repaint the
          // start pin the same dark green as every other night.
          node.dataset.base = base;
          node.textContent = pinLabel(g.days);
          node.setAttribute(
            "aria-label",
            `${daysSentence(g.days)}: ${g.place}, ${g.altitude_m} metres`,
          );
          // Grouping fixes pins that share a coordinate. Two DIFFERENT
          // villages an hour apart still land within a few pixels of each
          // other when the whole trek is on screen, and the one underneath
          // becomes unreadable. Pointing at a pin lifts it out — cheap, and
          // it makes a crowded valley explorable rather than a clump.
          node.addEventListener("mouseenter", () => {
            node.style.zIndex = "3";
            if (!groupIsActive(g, activeRef.current)) node.style.transform = "scale(1.25)";
          });
          node.addEventListener("mouseleave", () => {
            const on = groupIsActive(g, activeRef.current);
            node.style.zIndex = on ? "2" : "";
            node.style.transform = on ? "scale(1.55)" : "";
          });

          markersRef.current.set(g, node);

          const badge = isStart
            ? "Start"
            : isEnd
              ? "Finish"
              : isTop
                ? "Highest point"
                : "";

          new maplibregl.Marker({ element: node })
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
        }

        const draw = () => {
          if (m.getSource("route")) return;
          m.addSource("route", {
            type: "geojson",
            // Needed for the gradient below: MapLibre has to know how far
            // along the line each point is.
            lineMetrics: true,
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                // Per DAY, not per place: an out-and-back has to go back down
                // the way it came, and joining the grouped pins in order
                // would cut the corner and draw a triangle.
                coordinates: routeLine(stops),
              },
            },
          });
          m.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            paint: { "line-color": MAP_INK.casing, "line-width": 6, "line-opacity": 0.9 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          m.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: { "line-width": 3 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          // Which way round you walk it, without a single external asset.
          //
          // The obvious version of this is little arrow glyphs along the
          // line, and that is what was written first — but a symbol layer
          // with text needs a glyphs endpoint this style does not have, and
          // both free font hosts checked were dead (one 404s, the other
          // answers 200 with an HTML error page). It would have failed
          // silently in production, which is the worst kind of failure.
          //
          // A gradient needs nothing: the trail runs from the green it starts
          // at to the rust of the high point, so direction is legible at a
          // glance and the map gains the one thing a flat green line never
          // had — a sense of going somewhere.
          m.setPaintProperty("route-line", "line-gradient", [
            "interpolate",
            ["linear"],
            ["line-progress"],
            0,
            MAP_INK.start,
            0.55,
            MAP_INK.line,
            1,
            MAP_INK.summit,
          ]);
        };
        if (m.isStyleLoaded()) draw();
        else m.on("load", draw);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      markersRef.current.clear();
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  // Follow the scrubber: grow the active pin and ease the map to it.
  useEffect(() => {
    for (const [group, node] of markersRef.current) {
      const on = groupIsActive(group, activeDay);
      node.style.transform = on ? "scale(1.55)" : "";
      node.style.zIndex = on ? "2" : "";
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
