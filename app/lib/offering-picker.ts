import {
  fromPerPersonUsdCents,
  hasBreakdown,
  type PriceBreakdown,
} from "~/lib/experience-pricing";
import { listPriceUsdCents } from "~/lib/list-price";

/**
 * Choosing a trip from a list where the same trek appears once per guide.
 *
 * Guides write their own titles, and they all start with the route: "Everest
 * Base Camp at porter pace", "Everest Base Camp on a budget", "Everest Base
 * Camp with a mountaineer". Put fifty-six of those in one flat dropdown
 * ordered by title and the trek you want is eight nearly identical lines, the
 * route and the guide are jumbled into one sentence, and the thing that
 * actually distinguishes them — the guide's angle — is buried in the middle.
 *
 * So: grouped by route, and inside each route the guide leads, carrying the
 * few words of their own title that are not the route's name.
 */

export interface PickableOffering {
  id: string;
  title: string;
  days: number | null;
  kind?: string | null;
  guide_name?: string | null;
  route_name?: string | null;
  price_usd_cents?: number | null;
  price_breakdown?: unknown;
  max_party?: number | null;
  /** The price is quoted at the party the trip page opens with. */
  min_party?: number | null;
}

export interface PickOption {
  id: string;
  guideName: string;
  days: number | null;
  /** What this guide's title says beyond the route's own name. */
  angle: string;
  fromUsdCents: number | null;
}

export interface PickGroup {
  label: string;
  options: PickOption[];
}

/** Where the day trips go — they have no route to be grouped under. */
export const NO_ROUTE_LABEL = "Day trips & experiences";

/**
 * The part of a guide's title that is not the route's name.
 *
 * "Everest Base Camp at porter pace" under Everest Base Camp is "at porter
 * pace". A title that does not start with the route is left whole — a guide
 * who named their trip something else meant it.
 */
export function angleOf(title: string, routeName: string | null | undefined): string {
  const t = (title ?? "").trim();
  const route = (routeName ?? "").trim();
  if (!route || !t.toLowerCase().startsWith(route.toLowerCase())) return t;
  // Drop the route, then the punctuation or filler it was joined on.
  const rest = t.slice(route.length).replace(/^[\s,;:–—-]+/, "").trim();
  return rest;
}

/**
 * The per-person price this offering will quote, however it is priced.
 *
 * Was the four-person figure while every page opened at one — see
 * app/lib/list-price.ts.
 */
export function priceOf(o: PickableOffering): number | null {
  return listPriceUsdCents(o as any);
}

/**
 * The list, grouped by trek.
 *
 * Routes alphabetically, day trips last because they are a different kind of
 * decision. Within a trek, cheapest first — it is the axis somebody scanning
 * eight versions of one walk is actually comparing — with unpriced trips at
 * the end rather than at the top, where a missing number would read as free.
 */
export function groupOfferings(offerings: PickableOffering[]): PickGroup[] {
  const byRoute = new Map<string, PickOption[]>();

  for (const o of offerings) {
    const key = (o.route_name ?? "").trim() || NO_ROUTE_LABEL;
    const angle = angleOf(o.title, o.route_name);
    const list = byRoute.get(key) ?? [];
    list.push({
      id: o.id,
      guideName: o.guide_name ?? "a guide",
      days: o.days ?? null,
      // A day trip has no route to strip, so its whole title is the angle —
      // and repeating it under its own heading helps nobody.
      angle: key === NO_ROUTE_LABEL ? o.title : angle,
      fromUsdCents: priceOf(o),
    });
    byRoute.set(key, list);
  }

  const groups = [...byRoute.entries()].map(([label, options]) => ({
    label,
    options: options.sort((a, b) => {
      if (a.fromUsdCents == null && b.fromUsdCents == null) {
        return a.guideName.localeCompare(b.guideName);
      }
      if (a.fromUsdCents == null) return 1;
      if (b.fromUsdCents == null) return -1;
      return a.fromUsdCents - b.fromUsdCents || a.guideName.localeCompare(b.guideName);
    }),
  }));

  return groups.sort((a, b) => {
    if (a.label === NO_ROUTE_LABEL) return 1;
    if (b.label === NO_ROUTE_LABEL) return -1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Does this guide's angle just say their own name again?
 *
 * "Annapurna Circuit with Sunita" under Annapurna Circuit leaves "with
 * Sunita", which beside "with Sunita" reads as a stutter. Several guides
 * title their trip that way.
 */
export function echoesGuide(angle: string, guideName: string): boolean {
  const norm = (x: string) =>
    x.toLowerCase().replace(/^with\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const a = norm(angle);
  if (!a) return false;
  const guide = norm(guideName);
  if (!guide) return false;
  // The whole angle is the guide's name, or their first name.
  return a === guide || a === guide.split(" ")[0];
}

/** One option's line: the guide first, because that is what is being chosen. */
export function optionLabel(o: PickOption, money: (cents: number) => string): string {
  const bits = [`with ${o.guideName}`];
  if (o.angle && !echoesGuide(o.angle, o.guideName)) bits.push(o.angle);
  if (o.days) bits.push(`${o.days} ${o.days === 1 ? "day" : "days"}`);
  if (o.fromUsdCents != null) bits.push(`from ${money(o.fromUsdCents)} pp`);
  return bits.join(" · ");
}
