/**
 * The trail atlas: pick a trail, meet the people who walk it.
 *
 * The homepage map showed numbered bubbles — "2", "9", "1" — over districts.
 * That is a map of administrative density, which is the least interesting
 * thing this company knows. Nobody has ever chosen a guide because Lamjung
 * contains one of them.
 *
 * What this platform has that no agency site has is named, verified humans
 * attached to specific trails. So the map shows trails and faces, and the two
 * are wired to each other: choose Everest Base Camp and the people who walk
 * it surface; choose a person and the trails they walk light up. That is the
 * positioning — "you pick your guide, not your agency" — rendered as a map
 * rather than written as a slogan.
 *
 * Everything here is pure so the relationships can be tested without a
 * browser, which matters because the interesting part is the join, not the
 * rendering.
 */

export interface AtlasGuide {
  id: string;
  slug: string;
  name: string;
  avatar: string | null;
  tier: number;
  /** Their one line. */
  hook: string | null;
  district: string | null;
  regions: string[];
  /** Where their face sits on the map. */
  lng: number;
  lat: number;
}

export interface AtlasTrail {
  slug: string;
  name: string;
  region: string;
  days: number | null;
  maxAltitudeM: number | null;
  /** The walking line. */
  coords: [number, number][];
}

/** How a guide came to be attached to a trail. The reason is shown. */
export type LinkKind = "sells" | "region";

export interface TrailGuide {
  guide: AtlasGuide;
  kind: LinkKind;
}

/**
 * The people you can put on this trail, best link first.
 *
 * Two kinds of link, and the difference is worth keeping rather than
 * flattening: a guide who SELLS a trip on this route is someone you can book
 * for it today; a guide whose regions include it works there but has not
 * listed it. Showing the second kind as though it were the first would be the
 * marketplace overclaiming, which is the one thing a trust-led product cannot
 * do.
 */
export function guidesForTrail(
  trail: AtlasTrail,
  guides: AtlasGuide[],
  offerings: { guideId: string; routeSlug: string }[],
  limit = 12,
): TrailGuide[] {
  const byId = new Map(guides.map((g) => [g.id, g]));
  const out: TrailGuide[] = [];
  const seen = new Set<string>();

  for (const o of offerings) {
    if (o.routeSlug !== trail.slug) continue;
    const g = byId.get(o.guideId);
    if (!g || seen.has(g.id)) continue;
    seen.add(g.id);
    out.push({ guide: g, kind: "sells" });
  }

  const region = trail.region.trim().toLowerCase();
  const regional = guides
    .filter((g) => !seen.has(g.id))
    .filter((g) => g.regions.some((r) => r.trim().toLowerCase() === region))
    // Most-checked first: on a page whose whole argument is verification, the
    // guide we know most about should be the one you meet first.
    .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));

  for (const g of regional) {
    if (out.length >= limit) break;
    seen.add(g.id);
    out.push({ guide: g, kind: "region" });
  }

  return out.slice(0, limit);
}

/** The trails one guide is on, for the reverse highlight. */
export function trailsForGuide(
  guide: AtlasGuide,
  trails: AtlasTrail[],
  offerings: { guideId: string; routeSlug: string }[],
): string[] {
  const sells = new Set(
    offerings.filter((o) => o.guideId === guide.id).map((o) => o.routeSlug),
  );
  const regions = new Set(guide.regions.map((r) => r.trim().toLowerCase()));
  return trails
    .filter((t) => sells.has(t.slug) || regions.has(t.region.trim().toLowerCase()))
    .map((t) => t.slug);
}

/**
 * Which trails to offer, and in what order.
 *
 * By how many people you could actually walk it with, because a trail with
 * nobody on it is a dead end and this is a page about meeting people. Ties go
 * alphabetical so the rail does not reshuffle between deploys.
 */
export function rankTrails(
  trails: AtlasTrail[],
  guides: AtlasGuide[],
  offerings: { guideId: string; routeSlug: string }[],
): { trail: AtlasTrail; guideCount: number }[] {
  return trails
    .filter((t) => t.coords.length >= 2)
    .map((t) => ({ trail: t, guideCount: guidesForTrail(t, guides, offerings, 99).length }))
    .sort(
      (a, b) =>
        b.guideCount - a.guideCount || a.trail.name.localeCompare(b.trail.name),
    );
}

/** The middle of a trail, for flying the camera to it. */
export function trailCentre(trail: AtlasTrail): [number, number] {
  const c = trail.coords;
  if (!c.length) return [84, 28.4];
  const lng = c.reduce((n, p) => n + p[0], 0) / c.length;
  const lat = c.reduce((n, p) => n + p[1], 0) / c.length;
  return [lng, lat];
}

/** The box a trail needs, padded a little so it is not flush to the edge. */
export function trailBounds(
  trail: AtlasTrail,
  pad = 0.08,
): [[number, number], [number, number]] | null {
  if (trail.coords.length < 2) return null;
  const lngs = trail.coords.map((c) => c[0]);
  const lats = trail.coords.map((c) => c[1]);
  return [
    [Math.min(...lngs) - pad, Math.min(...lats) - pad],
    [Math.max(...lngs) + pad, Math.max(...lats) + pad],
  ];
}

/**
 * The trails the idle tour visits.
 *
 * Nobody reads an instruction that says "click a trail". They do understand a
 * map that is already moving, so when left alone this walks itself through a
 * few signature routes. Spread across regions rather than taken off the top
 * of the ranking: three Everest trails in a row teaches nothing about the
 * range of the country.
 */
export function tourStops(
  ranked: { trail: AtlasTrail; guideCount: number }[],
  limit = 5,
): AtlasTrail[] {
  const out: AtlasTrail[] = [];
  const regionsUsed = new Set<string>();
  for (const { trail, guideCount } of ranked) {
    if (guideCount === 0) continue;
    const r = trail.region.trim().toLowerCase();
    if (regionsUsed.has(r)) continue;
    regionsUsed.add(r);
    out.push(trail);
    if (out.length >= limit) break;
  }
  // Not enough regions to fill the tour: top up from the ranking rather than
  // showing a two-stop tour.
  for (const { trail, guideCount } of ranked) {
    if (out.length >= limit) break;
    if (guideCount === 0 || out.includes(trail)) continue;
    out.push(trail);
  }
  return out;
}

/** "14 days · 5,364 m" — the two facts that decide whether a trail is for you. */
export function trailFacts(trail: AtlasTrail): string {
  const bits: string[] = [];
  if (trail.days) bits.push(`${trail.days} days`);
  if (trail.maxAltitudeM) bits.push(`${trail.maxAltitudeM.toLocaleString("en-US")} m`);
  return bits.join(" · ");
}

/** How a link reads to a trekker. */
export function linkLabel(kind: LinkKind): string {
  return kind === "sells" ? "Runs this trek" : "Works this region";
}

/**
 * Faces pinned to a district centre all land on the same pixel.
 *
 * Nine guides from Solukhumbu would be one face with eight hidden behind it —
 * the same overlap bug the route maps had, arriving by a different route.
 * There is no better position available (we know their district, not their
 * house), so they are fanned around the centre: deterministic, so a guide
 * does not hop between page loads, and small, so nobody is moved out of the
 * district they are from.
 */
export function fanOut<T extends { lng: number; lat: number; id: string }>(
  people: T[],
  radiusDeg = 0.075,
): T[] {
  const bySpot = new Map<string, T[]>();
  for (const p of people) {
    const key = `${p.lng.toFixed(3)},${p.lat.toFixed(3)}`;
    bySpot.set(key, [...(bySpot.get(key) ?? []), p]);
  }
  const out: T[] = [];
  for (const group of bySpot.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    // Sorted by id so the arrangement is stable across renders and deploys.
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((p, i) => {
      const angle = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
      // Latitude degrees are worth more on screen than longitude at this
      // latitude, so the ring is drawn wider than it is tall to come out round.
      out.push({
        ...p,
        lng: p.lng + Math.cos(angle) * radiusDeg * 1.6,
        lat: p.lat + Math.sin(angle) * radiusDeg,
      });
    });
  }
  return out;
}
