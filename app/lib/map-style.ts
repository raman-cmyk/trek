import { OUTSIDE_NEPAL, NEPAL_OUTLINE } from "~/lib/nepal-border";

/**
 * One map style for the whole site: satellite imagery over real terrain,
 * with the altitude drawn on it and everything outside Nepal turned down.
 *
 * "I think we can show actual terrains, the map background is making it look
 * trash, let's show advanced satellite imagery." Right on both counts. A
 * cartographic basemap is the wrong instrument here — somebody choosing
 * between Langtang and Manaslu wants to see the glaciers, the treeline and
 * the bare rock, not a road map's idea of them.
 *
 * Five attempts to get here, written down so nobody repeats them:
 *
 *  1. OSM desaturated into brand greens — clean, and completely flat.
 *  2. OpenTopoMap — lovely at zoom 11+, but at whole-trek zoom it switches to
 *     an elevation tint that renders the Annapurnas as rust. Checked against
 *     the raw tile: that colour is the source, not our correction.
 *  3. A Wikimedia hillshading overlay whose host has been retired.
 *  4. Relief with no basemap at all — loses every place name.
 *  5. Sentinel-2 cloudless, which is free and genuinely good, but darker and
 *     softer over Nepal than what ships below. Kept in mind as the fallback
 *     if Esri's terms ever become a problem: one line, same tile scheme.
 *
 * What each layer is for:
 *
 *   satellite      what the ground actually looks like.
 *   colour relief  altitude as colour, from real elevation numbers. At whole-
 *                  country zoom the imagery cannot tell you that Mustang is
 *                  high desert and the Terai is 60 m of paddy; this can.
 *   hillshade      the shape of a valley, which a midday photograph loses.
 *   outside-dim    everything that is not Nepal, turned down.
 *
 * Contour lines are added at runtime by map-contours.ts — they need a worker
 * and a protocol registration, so they cannot live in a static style object.
 *
 * REMOVED: the Esri reference-label overlay. It was drawing single stray
 * words over the mountains — half-rendered district names, and a label
 * reading "7 4 2" beside Bhaktapur. The map now carries only the labels we
 * put on it ourselves.
 *
 * On terms: Esri's tiles are public and need no key, and attribution below is
 * required. At real traffic the correct answer is an ArcGIS account, or Baato
 * for Nepali place names. Either is a one-line change here and changes every
 * map on the site at once.
 */
export const MAP_STYLE = {
  version: 8 as const,
  /**
   * Fonts for text on the map.
   *
   * Without this, every `symbol` layer fails silently — which is why the
   * routes map has been drawing its trail names into the void since the day
   * it was written, and why the only labels on it were the HTML chips
   * underneath. Free, key-less, and the same stack the OpenMapTiles ecosystem
   * uses. If it ever goes down, text disappears and every other layer keeps
   * drawing.
   */
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    satellite: {
      type: "raster" as const,
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    // Elevation as real numbers: the shape of the ground, for shading, for
    // the colour ramp, and for the third dimension. Open data, no key.
    dem: {
      type: "raster-dem" as const,
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium" as const,
      tileSize: 256,
      maxzoom: 13,
      attribution:
        'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen / AWS Open Data</a>',
    },
    "outside-nepal": { type: "geojson" as const, data: OUTSIDE_NEPAL },
    "nepal-edge": { type: "geojson" as const, data: NEPAL_OUTLINE },
  },
  layers: [
    // What shows while the imagery loads. Dark, because satellite is dark —
    // a pale panel flashing to near-black reads as a broken page.
    { id: "ground", type: "background" as const, paint: { "background-color": "#22301f" } },
    {
      id: "satellite",
      type: "raster" as const,
      paint: {
        // Barely touched. The imagery is the point; correcting it toward the
        // brand is how the last four attempts went wrong. Just enough lift so
        // a dark forested valley does not swallow the trail drawn over it.
        "raster-saturation": -0.05,
        "raster-brightness-min": 0.06,
        "raster-contrast": -0.04,
      },
      source: "satellite",
    },
    {
      /**
       * Altitude, as colour.
       *
       * The stops are Nepal's own story rather than a generic ramp: the Terai
       * at 60 m, the middle hills, the treeline at about 4,000 m, the snow
       * line, and everything above 7,000 m which is rock and ice. Kept at low
       * opacity so it tints the photograph rather than replacing it — the
       * mistake that made OpenTopoMap render the Annapurnas as rust.
       */
      id: "altitude",
      type: "color-relief" as const,
      source: "dem",
      paint: {
        "color-relief-opacity": 0.3,
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          60, "#2f5d3a",
          1200, "#4a7a45",
          2500, "#8a9a55",
          3600, "#b08d5a",
          4500, "#9a8d84",
          5500, "#d8dde0",
          7000, "#ffffff",
        ],
      },
    },
    {
      // Shape, where the photograph has none. Satellite imagery is shot near
      // midday, so a deep valley can read as flat ground; this puts the
      // shadow back. Light — it is a hint of relief, not a second map.
      id: "relief",
      type: "hillshade" as const,
      source: "dem",
      paint: {
        "hillshade-exaggeration": 0.32,
        "hillshade-shadow-color": "#0b1a12",
        "hillshade-highlight-color": "#eaf2e2",
        "hillshade-accent-color": "#1b3b2a",
        "hillshade-illumination-anchor": "map" as const,
        "hillshade-illumination-direction": 315,
      },
    },
    {
      /**
       * Everything that is not Nepal, turned down.
       *
       * The map was giving half of India and a slab of Tibet the same weight
       * as the one country this company is about, so the eye had nowhere to
       * land. Dark rather than grey: on satellite imagery a grey veil reads
       * as haze, and haze looks like a rendering fault.
       */
      id: "outside-dim",
      type: "fill" as const,
      source: "outside-nepal",
      paint: { "fill-color": "#0a1410", "fill-opacity": 0.62 },
    },
    {
      // A soft edge, so the dimming reads as a border rather than a crop.
      id: "nepal-edge",
      type: "line" as const,
      source: "nepal-edge",
      paint: { "line-color": "#e8f3d8", "line-width": 1, "line-opacity": 0.35 },
    },
  ],
  // Under a pitched camera the horizon is otherwise a hard cut into nothing.
  sky: {
    "sky-color": "#9fc0dd",
    "sky-horizon-blend": 0.7,
    "horizon-color": "#cfdce6",
    "horizon-fog-blend": 0.55,
    "fog-color": "#b9c7bd",
    "fog-ground-blend": 0.1,
  },
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
  /** The trail over satellite imagery, where dark green is camouflage. */
  trail: "#c8f169",
  /** Contour lines: bright enough to read on rock, quiet enough to ignore. */
  contour: "#f3efe2",
};
