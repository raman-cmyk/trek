/**
 * Map geometry — district centroids for guide pins, simplified route lines.
 *
 * Deliberately in code rather than PostGIS: the shapes are approximate by
 * design (a guide's pin means "works out of Solukhumbu", not "lives at these
 * coordinates"), they change roughly never, and putting them in the bundle
 * means the map renders without a round trip. If we ever draw real GPX tracks
 * — actual trekked lines from recaps — that belongs in the database, not here.
 *
 * Coordinates are [lng, lat], GeoJSON order.
 */

export type LngLat = [number, number];

/** Approximate district centres for every district we have guides in. */
export const DISTRICT_CENTRES: Record<string, LngLat> = {
  Baglung: [83.59, 28.27],
  Bhaktapur: [85.43, 27.67],
  Bhojpur: [87.05, 27.17],
  Chitwan: [84.35, 27.53],
  Dhankuta: [87.34, 26.98],
  Dolakha: [86.17, 27.67],
  Dolpa: [82.9, 29.0],
  Gorkha: [84.63, 28.0],
  Ilam: [87.93, 26.91],
  Kaski: [83.97, 28.26],
  Kathmandu: [85.32, 27.71],
  Khotang: [86.8, 27.2],
  Lalitpur: [85.32, 27.66],
  Lamjung: [84.38, 28.28],
  Manang: [84.02, 28.67],
  Mustang: [83.83, 28.9],
  Myagdi: [83.57, 28.6],
  Nuwakot: [85.17, 27.92],
  Panchthar: [87.8, 27.12],
  Rasuwa: [85.3, 28.12],
  Sankhuwasabha: [87.2, 27.6],
  Solukhumbu: [86.72, 27.7],
  Syangja: [83.87, 28.09],
  Taplejung: [87.67, 27.35],
};

/** Simplified trekking lines, by route slug. Enough to read the shape. */
export const ROUTE_LINES: Record<string, LngLat[]> = {
  "everest-base-camp": [
    [86.73, 27.69],
    [86.71, 27.8],
    [86.76, 27.84],
    [86.83, 27.89],
    [86.81, 27.95],
    [86.85, 28.0],
  ],
  "gokyo-lakes": [
    [86.73, 27.69],
    [86.71, 27.8],
    [86.7, 27.88],
    [86.7, 27.93],
    [86.69, 27.96],
  ],
  "annapurna-circuit": [
    [84.38, 28.23],
    [84.24, 28.55],
    [84.02, 28.67],
    [83.94, 28.79],
    [83.87, 28.82],
    [83.73, 28.78],
  ],
  "langtang-valley": [
    [85.34, 28.16],
    [85.45, 28.17],
    [85.55, 28.21],
    [85.56, 28.21],
  ],
  "manaslu-circuit": [
    [84.88, 28.28],
    [84.89, 28.46],
    [84.62, 28.61],
    [84.48, 28.65],
    [84.35, 28.53],
  ],
  "mardi-himal": [
    [83.83, 28.28],
    [83.9, 28.35],
    [83.92, 28.4],
    [83.93, 28.44],
    [83.93, 28.47],
  ],
};

/** Roughly all of trekking Nepal — the map's opening frame. */
export const NEPAL_BOUNDS: [LngLat, LngLat] = [
  [80.5, 26.5],
  [88.5, 30.2],
];
