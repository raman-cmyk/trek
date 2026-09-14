/**
 * "Search a place feature."
 *
 * Deliberately not a geocoder. A general geocoder over Nepal answers
 * "Pokhara" with a municipality boundary and "Base Camp" with somewhere in
 * Alaska, and it costs a key, a rate limit and a round trip per keystroke on
 * a page that already ships a map.
 *
 * What this searches is our own gazetteer: the trails we sell, the villages
 * on their itineraries, the regions, and the districts our guides live in.
 * That is a few hundred places, it fits in the payload the page already
 * sends, it answers instantly with no network, and every hit is somewhere
 * this company can actually take you — which is the only kind of answer worth
 * giving on this map.
 */

export type PlaceKind = "trail" | "village" | "region" | "district";

export interface AtlasPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  /** The line under the name: "Annapurna · day 7", "16-day trek". */
  sub: string;
  lng: number;
  lat: number;
  /** If choosing this should also select a trail, which one. */
  trailSlug?: string;
  /** How tight to zoom. A village wants a close look; a region wants a sweep. */
  zoom: number;
}

/**
 * Fold to something comparable: lower case, no accents, no punctuation.
 *
 * Nepali place names reach us spelled several ways — Gorepani/Ghorepani,
 * Thorung/Thorong, with and without hyphens — and a search that only matches
 * the spelling we happened to store is a search that tells people we do not
 * go there.
 */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface GazetteerInput {
  trails: {
    slug: string;
    name: string;
    region: string;
    days: number | null;
    coords: [number, number][];
    /** Located day stops, if the route has them. */
    places?: { day: number; name: string; lng: number; lat: number }[];
  }[];
  districts: { name: string; lng: number; lat: number; guides: number }[];
}

/**
 * Everywhere you can search for, best-kind first.
 *
 * Deduplicated by name within a kind, because a village on four itineraries
 * is one village. The first trail to claim it wins and carries the rest in
 * its subtitle count — four identical "Chame" rows is a list that looks
 * broken.
 */
export function buildGazetteer(input: GazetteerInput): AtlasPlace[] {
  const out: AtlasPlace[] = [];
  const seenVillage = new Map<string, AtlasPlace>();
  const villageTrails = new Map<string, Set<string>>();

  for (const t of input.trails) {
    if (t.coords.length < 2) continue;
    const mid = t.coords[Math.floor(t.coords.length / 2)];
    out.push({
      id: `trail:${t.slug}`,
      name: t.name,
      kind: "trail",
      sub: t.days ? `${t.days}-day trek · ${t.region}` : t.region,
      lng: mid[0],
      lat: mid[1],
      trailSlug: t.slug,
      zoom: 10,
    });

    for (const p of t.places ?? []) {
      const key = fold(p.name);
      if (!key) continue;
      const already = seenVillage.get(key);
      if (already) {
        villageTrails.get(key)!.add(t.name);
        already.sub = subForVillage(villageTrails.get(key)!);
        continue;
      }
      const place: AtlasPlace = {
        id: `village:${key}`,
        name: p.name,
        kind: "village",
        sub: `On ${t.name}`,
        lng: p.lng,
        lat: p.lat,
        trailSlug: t.slug,
        zoom: 12.5,
      };
      seenVillage.set(key, place);
      villageTrails.set(key, new Set([t.name]));
      out.push(place);
    }
  }

  // Regions, placed at the middle of everything we walk in them.
  const byRegion = new Map<string, [number, number][]>();
  for (const t of input.trails) {
    if (t.coords.length < 2) continue;
    const list = byRegion.get(t.region) ?? [];
    list.push(...t.coords);
    byRegion.set(t.region, list);
  }
  for (const [region, coords] of byRegion) {
    out.push({
      id: `region:${fold(region)}`,
      name: region,
      kind: "region",
      sub: "Region",
      lng: coords.reduce((n, c) => n + c[0], 0) / coords.length,
      lat: coords.reduce((n, c) => n + c[1], 0) / coords.length,
      zoom: 8.5,
    });
  }

  for (const d of input.districts) {
    if (seenVillage.has(fold(d.name))) continue;
    out.push({
      id: `district:${fold(d.name)}`,
      name: d.name,
      kind: "district",
      sub: d.guides === 1 ? "Home to 1 guide" : `Home to ${d.guides} guides`,
      lng: d.lng,
      lat: d.lat,
      zoom: 9.5,
    });
  }

  return out;
}

function subForVillage(trails: Set<string>): string {
  const names = [...trails];
  if (names.length === 1) return `On ${names[0]}`;
  if (names.length === 2) return `On ${names[0]} and ${names[1]}`;
  return `On ${names[0]} and ${names.length - 1} other treks`;
}

/** Trails first, then villages, then regions, then districts. */
const KIND_RANK: Record<PlaceKind, number> = {
  trail: 0,
  village: 1,
  region: 2,
  district: 3,
};

/**
 * Rank a place against a query, or null if it does not match at all.
 *
 * Lower is better. A name that STARTS with what you typed beats one that
 * merely contains it — typing "man" should offer Manang and Manaslu before
 * Chomrong, which contains no "man" at all but "Kathmandu" does, in the
 * middle, where nobody was looking.
 */
export function scorePlace(place: AtlasPlace, query: string): number | null {
  const q = fold(query);
  if (!q) return null;
  const name = fold(place.name);
  let base: number;
  if (name === q) base = 0;
  else if (name.startsWith(q)) base = 1;
  else if (name.split(" ").some((w) => w.startsWith(q))) base = 2;
  else if (name.includes(q)) base = 3;
  else if (fold(place.sub).includes(q)) base = 5;
  else return null;
  // Kind is the tiebreak, and the length of the name after it, so "Manang"
  // comes before "Manang Valley Circuit" on the same kind of match.
  return base * 100 + KIND_RANK[place.kind] * 10 + Math.min(name.length, 9) / 10;
}

export function searchPlaces(
  gazetteer: AtlasPlace[],
  query: string,
  limit = 7,
): AtlasPlace[] {
  const scored: { place: AtlasPlace; score: number }[] = [];
  for (const place of gazetteer) {
    const score = scorePlace(place, query);
    if (score !== null) scored.push({ place, score });
  }
  scored.sort((a, b) => a.score - b.score || a.place.name.localeCompare(b.place.name));
  return scored.slice(0, limit).map((s) => s.place);
}
