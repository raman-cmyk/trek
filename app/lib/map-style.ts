/**
 * One map style for the whole site: satellite imagery over real terrain.
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
 * Three layers, each doing one job: imagery for what the ground looks like,
 * a hillshade from real elevation to hold the shape of a valley when the sun
 * in the photograph was overhead, and a transparent label layer so places
 * still have names. Terrain makes it three-dimensional.
 *
 * On terms: Esri's tiles are public and need no key, and attribution below is
 * required. At real traffic the correct answer is an ArcGIS account, or Baato
 * for Nepali place names. Either is a one-line change here and changes every
 * map on the site at once.
 */
export const MAP_STYLE = {
  version: 8 as const,
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
    // Place names, as a transparent overlay. Satellite imagery on its own is
    // beautiful and tells you nothing about where Manang is.
    places: {
      type: "raster" as const,
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Labels © Esri",
    },
    // Elevation as real numbers: the shape of the ground, for shading and for
    // the third dimension. Open data, no key.
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
    // What shows while the imagery loads. Dark, because satellite is dark —
    // a pale panel flashing to near-black reads as a broken page.
    { id: "ground", type: "background" as const, paint: { "background-color": "#22301f" } },
    {
      id: "satellite",
      type: "raster" as const,
      source: "satellite",
      paint: {
        // Barely touched. The imagery is the point; correcting it toward the
        // brand is how the last four attempts went wrong. Just enough lift so
        // a dark forested valley does not swallow the trail drawn over it.
        "raster-saturation": -0.05,
        "raster-brightness-min": 0.06,
        "raster-contrast": -0.04,
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
        "hillshade-exaggeration": 0.28,
        "hillshade-shadow-color": "#0b1a12",
        "hillshade-highlight-color": "#eaf2e2",
        "hillshade-accent-color": "#1b3b2a",
        "hillshade-illumination-anchor": "map" as const,
        "hillshade-illumination-direction": 315,
      },
    },
    {
      id: "places",
      type: "raster" as const,
      source: "places",
      paint: { "raster-opacity": 0.85 },
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
};
