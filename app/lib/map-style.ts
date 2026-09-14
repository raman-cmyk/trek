/**
 * One map style for the whole site: a clean road map with real mountains on it.
 *
 * Four attempts, worth writing down because three of them looked reasonable
 * and would have shipped wrong:
 *
 *  1. OSM raster desaturated hard into brand greens. Clean, and completely
 *     flat — no mountains at all, on a site about mountains.
 *  2. OpenTopoMap. Genuinely lovely at zoom 11 and above; at the zoom a
 *     fourteen-day trek needs it switches to an elevation tint that renders
 *     the Annapurnas as rust and dried blood. Confirmed against the raw tile:
 *     that colour is the source, not our correction.
 *  3. A Wikimedia hillshading overlay. The host has been retired — it does
 *     not resolve at all.
 *  4. A relief-only map with no basemap, which loses every place name.
 *
 * What works is OSM for the names, the trails and the rivers, with relief
 * computed on the GPU from open elevation data and painted in our own greens.
 * Legible at every zoom, and the valleys look like valleys.
 *
 * One warning for whoever touches this next: tile.openstreetmap.org serves an
 * "Access blocked" IMAGE, with a 200 status, to clients that send no
 * User-Agent. Nothing downstream notices — you get a picture of an error
 * instead of a map. Browsers always send one, so this only bites scripts and
 * scrapers; if you are mirroring tiles for a test, set a User-Agent.
 *
 * Swapping in a keyed provider (Baato is Nepal-specific and reads Nepali
 * place names properly) stays a one-line change here.
 */
export const MAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
    // Elevation as real numbers, so the shading can be ours. Open data, no
    // key, no usage policy to fall foul of.
    dem: {
      type: "raster-dem" as const,
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium" as const,
      tileSize: 256,
      maxzoom: 13,
      attribution:
        'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen / AWS Open Data</a>',
    },
  },
  layers: [
    { id: "paper", type: "background" as const, paint: { "background-color": "#eef1e6" } },
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      paint: {
        // Enough to belong on the page; not so much that the map goes grey.
        // The relief above supplies the interest that heavy correction used
        // to strip out, so this can afford to be gentle.
        "raster-saturation": -0.42,
        "raster-hue-rotate": 30,
        "raster-brightness-min": 0.1,
        "raster-brightness-max": 1,
        "raster-contrast": -0.05,
        "raster-opacity": 0.95,
      },
    },
    {
      // The mountains. Multiplied over the road map so ridges and gullies
      // read across it without hiding the names underneath.
      id: "relief",
      type: "hillshade" as const,
      source: "dem",
      paint: {
        "hillshade-exaggeration": 0.5,
        "hillshade-shadow-color": "#2c4536",
        "hillshade-highlight-color": "#ffffff",
        "hillshade-accent-color": "#6f8c6b",
        "hillshade-illumination-anchor": "map" as const,
        "hillshade-illumination-direction": 315,
      },
    },
  ],
};

/** Brand colours the map draws with, kept next to the style they belong to. */
export const MAP_INK = {
  line: "#1b3b2a",
  casing: "#fbf9f3",
  pin: "#1b3b2a",
  pinActive: "#c8f169",
  /** Where the walk begins. */
  start: "#4f7a3a",
  /** The top — the reason people came. */
  summit: "#b4532a",
  /** A place you only ever flew or drove to. */
  travel: "#8a8a80",
};
