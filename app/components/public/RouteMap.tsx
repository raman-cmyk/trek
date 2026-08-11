import { useEffect, useRef, useState } from "react";
import type { DayStop } from "./ElevationScrubber";
import { MAP_INK, MAP_STYLE } from "~/lib/map-style";

/**
 * The route drawn from its own day stops, with a pin per overnight.
 *
 * Same lazy-MapLibre approach as the homepage map: nothing loads until the
 * component mounts, the page still server-renders without it, and a blocked
 * tile host degrades to the day list rather than a grey rectangle.
 *
 * `activeDay` is driven by the elevation scrubber above it, so dragging along
 * the profile walks the pin along the map.
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
  const markersRef = useRef<Map<number, HTMLElement>>(new Map());
  const [failed, setFailed] = useState(false);

  const located = stops.filter((s) => s.lng != null && s.lat != null);

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

        const lngs = located.map((s) => s.lng!);
        const lats = located.map((s) => s.lat!);
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

        for (const s of located) {
          const node = document.createElement("div");
          node.className =
            "flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-paper " +
            "bg-pine px-1.5 font-mono text-[10px] font-semibold text-paper shadow-lift transition-transform";
          node.textContent = String(s.day);
          node.setAttribute("aria-label", `Day ${s.day}: ${s.place}`);
          markersRef.current.set(s.day, node);
          new maplibregl.Marker({ element: node })
            .setLngLat([s.lng!, s.lat!])
            .setPopup(
              new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
                `<div style="font-family:inherit;font-size:13px">
                   <strong>Day ${s.day} — ${escapeHtml(s.place)}</strong><br>
                   <span style="color:#6b6b63">${s.altitude_m.toLocaleString("en-US")} m</span>
                 </div>`,
              ),
            )
            .addTo(m);
        }

        const draw = () => {
          if (m.getSource("route")) return;
          m.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: located.map((s) => [s.lng!, s.lat!]),
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
            paint: { "line-color": MAP_INK.line, "line-width": 2.5 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
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
    for (const [day, node] of markersRef.current) {
      const on = day === activeDay;
      node.style.transform = on ? "scale(1.6)" : "";
      node.style.backgroundColor = on ? "var(--color-chartreuse)" : "";
      node.style.color = on ? "var(--color-pine)" : "";
    }
    const s = located.find((x) => x.day === activeDay);
    if (s && mapRef.current?.easeTo) {
      mapRef.current.easeTo({ center: [s.lng!, s.lat!], duration: 400 });
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
