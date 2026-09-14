import { MAP_INK } from "~/lib/map-style";

/**
 * Contour lines, generated in the browser from the elevation tiles.
 *
 * "Use line style terrains to show altitude properly."
 *
 * Satellite imagery tells you where the snow is. It does not tell you that
 * the wall behind Machhapuchhre climbs 2,000 m in four kilometres — and that
 * is the fact that decides whether somebody books a trek. Contours say it in
 * the one language every walker already reads: lines close together means
 * steep.
 *
 * There is no free contour tile service worth depending on, so these are
 * computed from the same terrarium DEM the hillshade already uses, in a
 * worker, and cached. No key, no second provider, nothing new to go down.
 *
 * Interval by zoom, because one interval cannot serve both ends: at country
 * zoom, 100 m contours over the Himalaya is a solid grey smear; at valley
 * zoom, 1,000 m contours is three lines on the whole screen.
 *
 * NOTE on verifying this. Contours come from a VECTOR source, and no
 * source that needs MapLibre's Web Worker loads in this project's sandbox —
 * established by adding a bright red fill over the whole country and getting
 * zero red pixels, with `isSourceLoaded` false for a geojson source whose
 * data had already been checked in the console. That is the true cause of
 * the older note claiming "line layers do not render here": it was never the
 * line layers, it was every source behind them. Raster imagery, the DEM,
 * hillshade, colour relief and terrain all render here because they do not
 * depend on that worker.
 *
 * Consequence: contours, the Nepal dimming mask and the trail lines are all
 * verified in the founder's browser and by arithmetic tests
 * (nepal-border.test.ts), never by a screenshot taken from here.
 */

let registered: Promise<string> | null = null;

/**
 * Register the contour protocol once per page and hand back the tile URL.
 *
 * Idempotent on purpose: three maps on this site share one style, and
 * registering the same protocol twice throws.
 */
function contourTiles(): Promise<string> {
  if (registered) return registered;
  registered = (async () => {
    const [maplibregl, mlcontour] = await Promise.all([
      import("maplibre-gl"),
      import("maplibre-contour"),
    ]);
    const demSource = new (mlcontour as any).DemSource({
      url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
      encoding: "terrarium",
      maxzoom: 13,
      worker: true,
    });
    demSource.setupMaplibre((maplibregl as any).default ?? maplibregl);
    return demSource.contourProtocolUrl({
      // Metres. The DEM is in metres and so is every altitude on this site.
      multiplier: 1,
      thresholds: {
        // zoom: [minor interval, major interval]
        8: [500, 2000],
        10: [200, 1000],
        11: [100, 500],
        12: [100, 500],
        13: [50, 250],
        14: [50, 250],
      },
      elevationKey: "ele",
      levelKey: "level",
      contourLayer: "contours",
    });
  })();
  return registered;
}

/**
 * Add contours under a given layer, if the browser can manage it.
 *
 * Never throws into the caller: a map with no contours is a map; a map that
 * threw while adding them is a blank rectangle. The same reasoning as the
 * terrain call it sits beside.
 */
export async function attachContours(map: any, beforeId?: string): Promise<void> {
  try {
    if (map.getSource("contours")) return;
    const url = await contourTiles();
    if (!map.getStyle || map.getSource("contours")) return;

    map.addSource("contours", {
      type: "vector",
      tiles: [url],
      maxzoom: 15,
      attribution:
        'Contours from <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen / AWS Open Data</a>',
    });

    const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;

    // Minor lines: the texture that makes a slope read as a slope.
    map.addLayer(
      {
        id: "contour-minor",
        type: "line",
        source: "contours",
        "source-layer": "contours",
        filter: ["!=", ["get", "level"], 1],
        paint: {
          "line-color": MAP_INK.contour,
          "line-width": 0.5,
          // Fades in rather than appearing: at country zoom the lines are
          // denser than the pixels available and turn the Himalaya grey.
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 9.5, 0.16, 13, 0.3],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      },
      before,
    );

    // Major lines: the ones you can actually follow with your eye.
    map.addLayer(
      {
        id: "contour-major",
        type: "line",
        source: "contours",
        "source-layer": "contours",
        filter: ["==", ["get", "level"], 1],
        paint: {
          "line-color": MAP_INK.contour,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 14, 1.3],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 9.5, 0.34, 13, 0.5],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      },
      before,
    );
  } catch {
    // No contours on this browser. Everything else still draws.
  }
}
