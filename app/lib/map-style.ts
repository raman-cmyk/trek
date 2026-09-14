/**
 * One map style for the whole site.
 *
 * This is a trekking company. A flat road map with no ground on it is the
 * wrong map: the argument for a route IS the shape of the land, and a
 * trekker deciding between Langtang and Manaslu is trying to see valleys and
 * ridges, not motorway junctions.
 *
 * So the base is OpenTopoMap — contours, relief shading and the trails
 * themselves — corrected on the GPU into the brand's greens. Raster paint
 * properties do that for free per frame: desaturate hard, rotate what is left
 * toward moss, lift the whites so the map sits on paper rather than punching
 * a hole in it. Topo tiles carry far more line detail than road tiles, so the
 * correction is gentler here than it was over plain OSM — pushed as far and
 * the contours disappear, which is the thing worth keeping.
 *
 * Attribution is not optional on these: OpenTopoMap is CC-BY-SA and says so
 * below. A previous version of this file pointed at a Wikimedia hillshading
 * host that has been retired — the request does not resolve at all — so
 * anything added here should be checked against the live service first.
 *
 * Swapping in Baato when the founder has a key stays a one-line change, and
 * it changes every map on the site at once.
 */
export const MAP_STYLE = {
  version: 8 as const,
  sources: {
    // Elevation, as real numbers rather than a picture of shadows. MapLibre
    // reads terrarium-encoded PNGs natively, which buys two things no raster
    // overlay can: hillshading computed on the GPU in whatever colours we
    // like, and actual 3D relief under a pitched camera. Free, no key, and
    // checked live — the previous attempt at shading pointed at a Wikimedia
    // host that has been retired.
    dem: {
      type: "raster-dem" as const,
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium" as const,
      tileSize: 256,
      maxzoom: 13,
      attribution: "Elevation: Mapzen / AWS Open Data",
    },
    topo: {
      type: "raster" as const,
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      // OpenTopoMap renders to zoom 17; asking for more gets a blank tile
      // rather than a sharper one, so the map stops where the data stops.
      maxzoom: 17,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM · style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    },
  },
  layers: [
    // Painted under the tiles so a slow tile load shows brand paper, not the
    // browser's default black.
    { id: "paper", type: "background" as const, paint: { "background-color": "#eef1e6" } },
    {
      id: "topo",
      type: "raster" as const,
      source: "topo",
      paint: {
        // Much gentler than before. The old numbers desaturated a topographic
        // map almost to grey, which is precisely what made it "flat and
        // boring": contour lines, glacier white and forest green are the
        // whole point of a topo tile, and the correction was erasing them.
        // Enough hue push to belong on the page, not enough to flatten Nepal.
        "raster-saturation": -0.18,
        "raster-hue-rotate": 18,
        "raster-brightness-min": 0.04,
        "raster-brightness-max": 1,
        "raster-contrast": 0.12,
        "raster-opacity": 1,
      },
    },
    {
      // Shading computed from the elevation itself, in brand colours. This is
      // the layer that makes a valley look like a valley.
      id: "hillshade",
      type: "hillshade" as const,
      source: "dem",
      paint: {
        "hillshade-exaggeration": 0.55,
        "hillshade-shadow-color": "#1b3b2a",
        "hillshade-highlight-color": "#fbf9f3",
        "hillshade-accent-color": "#4f7a3a",
        "hillshade-illumination-anchor": "map" as const,
        "hillshade-illumination-direction": 315,
      },
    },
  ],
  // Under a pitched camera the horizon is otherwise a hard cut into nothing.
  sky: {
    "sky-color": "#bcd2e4",
    "sky-horizon-blend": 0.6,
    "horizon-color": "#eef1e6",
    "horizon-fog-blend": 0.55,
    "fog-color": "#dfe6d5",
    "fog-ground-blend": 0.2,
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
};
