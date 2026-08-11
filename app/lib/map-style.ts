/**
 * One map style for the whole site.
 *
 * Raster OSM arrives as somebody else's palette — motorway orange, tourist
 * pink, a beige that fights every other surface on the page. MapLibre's raster
 * paint properties do the correction on the GPU, so the map lands in the
 * brand's greens with no tile server of our own and no cost per frame:
 * desaturate almost to grey, rotate what is left toward moss, then lift the
 * whites so the map sits on paper rather than punching a hole in it.
 *
 * Swapping in Baato when the founder has a key stays a one-line change here,
 * and it changes every map at once.
 */
export const MAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    // Painted under the tiles so a slow tile load shows brand paper, not the
    // browser's default black.
    { id: "paper", type: "background" as const, paint: { "background-color": "#eef1e6" } },
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      paint: {
        "raster-saturation": -0.72,
        "raster-hue-rotate": 78,
        "raster-brightness-min": 0.14,
        "raster-brightness-max": 0.97,
        "raster-contrast": -0.08,
        "raster-opacity": 0.88,
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
};
