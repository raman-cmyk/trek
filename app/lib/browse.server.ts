import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLike, type DateRange } from "./browse";
import { TAKEN_STATUSES, clipToHorizon, longestOpenRun } from "./open-days";

/**
 * The database half of browse search, shared by /guides and /experiences.
 *
 * The whole marketplace primitive is "a female guide free in October for
 * Annapurna": free text, dates, and facets in one pass. Text has to reach past
 * the guide's own row — a traveller typing "Annapurna" means the region, which
 * lives on routes, not on guides — so the text match unions three sources: the
 * guide record (caller's side), the routes they lead, and their trip titles.
 */

/**
 * How long a stretch each guide is free for inside the range.
 *
 * Returns a map guide_id → longest run of CONSECUTIVE open days, so a caller
 * can ask "free at all?" (>= 1) or "free for a 14-day trek?" (>= 14) from the
 * same query.
 *
 * It asks for the days that are TAKEN and subtracts them, rather than asking
 * for the days marked open. Nothing in the application ever writes a row that
 * means "free" — only the demo seed does — so the old question returned
 * nothing at all for every guide who joined through the real form, and every
 * dated search dropped them. `open-days.ts` has the whole story. The query is
 * also an order of magnitude smaller: a few hundred held/booked/blocked rows
 * across the roster instead of thirteen thousand open ones.
 *
 * `guideIds` is required now. Absence means open, so an answer has to be
 * given for every guide asked about — including the ones with no rows at all,
 * which are precisely the ones this fixes — and that is only possible if the
 * caller says who they are. All three callers already passed them.
 */
export async function openRunsByGuide(
  client: SupabaseClient,
  range: DateRange,
  guideIds: string[],
  today = new Date().toISOString().slice(0, 10),
): Promise<Record<string, number>> {
  if (guideIds.length === 0) return {};
  const win = clipToHorizon(range, today);
  if (!win) return Object.fromEntries(guideIds.map((id) => [id, 0]));

  // Paged, because PostgREST refuses to return more than `db.max_rows` (1,000)
  // however large a limit is asked for — and it says so nowhere in the
  // response. A single `.limit(100_000)` therefore came back quietly truncated
  // for any window wider than about three weeks across the full roster: each
  // guide got a partial, gap-riddled set of days, every longest-run collapsed
  // below the length of the trek, and the page rendered "nothing available"
  // for dates that were completely free. Forty-eight guides over thirty days
  // was 1,338 rows — just past the edge, which is why it looked fine in
  // testing. Taken days are far fewer and it will rarely page now, but a busy
  // season across the roster can still cross the line.
  const PAGE = 900;
  const rows: Array<{ guide_id: string; day: string }> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await client
      .from("availability")
      .select("guide_id, day")
      .in("status", TAKEN_STATUSES as unknown as string[])
      .gte("day", win.from)
      .lte("day", win.to)
      .in("guide_id", guideIds)
      // Ordered so the pages are stable; without it the same row can appear
      // on two pages and another never appear at all.
      .order("guide_id")
      .order("day")
      .range(offset, offset + PAGE - 1);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
    // A year across every guide is the ceiling parseRange allows; this stops a
    // pathological case turning into an unbounded loop.
    if (rows.length >= 200_000) break;
  }

  const takenByGuide: Record<string, Set<string>> = {};
  for (const row of rows) (takenByGuide[row.guide_id] ??= new Set()).add(row.day);

  const runs: Record<string, number> = {};
  for (const id of guideIds) {
    runs[id] = longestOpenRun(win, takenByGuide[id] ?? new Set(), today);
  }
  return runs;
}

/**
 * Guide ids whose ROUTES or TRIPS match the query text. Unioned with the
 * caller's own match on the guide record — this is the half that makes
 * "Annapurna" and "Everest" work as searches for a person.
 */
export async function guideIdsMatchingText(
  client: SupabaseClient,
  q: string,
): Promise<Set<string>> {
  const like = `%${escapeLike(q)}%`;
  const [{ data: routes }, { data: offerings }] = await Promise.all([
    client.from("routes").select("id").or(`name.ilike.${like},region.ilike.${like}`),
    client.from("public_offerings").select("guide_id, route_id, title, summary"),
  ]);
  const routeIds = new Set((routes ?? []).map((r) => r.id));
  const needle = q.toLowerCase();
  const ids = new Set<string>();
  for (const o of offerings ?? []) {
    const hit =
      (o.route_id && routeIds.has(o.route_id)) ||
      (o.title ?? "").toLowerCase().includes(needle) ||
      (o.summary ?? "").toLowerCase().includes(needle);
    if (hit) ids.add(o.guide_id);
  }
  return ids;
}

export { escapeLike, parseRange, guideMatchesText, addDays, daysInRange } from "./browse";
export type { DateRange } from "./browse";
