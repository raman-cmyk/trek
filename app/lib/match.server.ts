import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetConfigs, computeExperiencePricing, type PriceBreakdown , hasBreakdown } from "~/lib/experience-pricing";
import { guideRatings } from "~/lib/ratings.server";
import { rankGuides, type GuideFacts, type MatchQuery, type MatchResult, type Region } from "~/lib/match";
import { TAKEN_STATUSES, horizonEnd, openDaysIn } from "~/lib/open-days";

/**
 * Gather every verified guide's facts (offerings, routes, languages, calendar,
 * ratings) and rank them for the query. Anon-safe: public views only.
 */
export async function matchGuides(
  client: SupabaseClient,
  q: MatchQuery,
): Promise<{ results: MatchResult[]; guides: Map<string, any> }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const oneYearOut = horizonEnd(todayIso);

  const [{ data: guides }, { data: offerings }, { data: routes }, { data: langs }, { data: avail }] =
    await Promise.all([
      client.from("public_guides").select("*"),
      client
        .from("public_offerings")
        .select("id, slug, kind, title, days, route_id, guide_id, price_usd_cents, price_breakdown"),
      client.from("routes").select("id, region, difficulty, season_months"),
      client.from("guide_languages").select("guide_id, language, proficiency"),
      // Taken days, not open ones. Two bugs in one line: absence means open
      // (open-days.ts), so guides who never touched a calendar scored zero on
      // availability; and `.limit(5000)` against roughly 17,500 open rows was
      // already truncating in silence, so even the seeded guides were ranked
      // on a partial calendar. Held/booked/blocked days are a few hundred.
      client
        .from("availability")
        .select("guide_id, day")
        .in("status", TAKEN_STATUSES as unknown as string[])
        .gte("day", todayIso)
        .lte("day", oneYearOut)
        .limit(5000),
    ]);

  const routeById = new Map((routes ?? []).map((r) => [r.id, r]));
  const langsByGuide = new Map<string, Array<{ language: string; proficiency: string }>>();
  for (const l of langs ?? []) {
    if (!langsByGuide.has(l.guide_id)) langsByGuide.set(l.guide_id, []);
    langsByGuide.get(l.guide_id)!.push({ language: l.language, proficiency: l.proficiency });
  }
  // Key by month only, but resolve to the NEXT occurrence of that month so
  // "24 open days in October" can't sum Oct 2026 + Oct 2027 (audit P4).
  const nowMonth = Number(todayIso.slice(5, 7));
  const nowYear = Number(todayIso.slice(0, 4));
  const targetYear = (month: number) => (month >= nowMonth ? nowYear : nowYear + 1);
  const takenByGuide = new Map<string, Set<string>>();
  for (const a of avail ?? []) {
    let set = takenByGuide.get(a.guide_id);
    if (!set) takenByGuide.set(a.guide_id, (set = new Set()));
    set.add(a.day);
  }
  // Every day between today and the horizon that this guide has not given
  // away, bucketed by month. A guide with an empty calendar now scores as
  // free, which is what the booking server has always believed.
  const window = { from: todayIso, to: oneYearOut };
  const monthsFree = (guideId: string): Record<number, number> => {
    const rec: Record<number, number> = {};
    for (const day of openDaysIn(window, takenByGuide.get(guideId) ?? new Set(), todayIso)) {
      const y = Number(day.slice(0, 4));
      const mth = Number(day.slice(5, 7));
      if (y !== targetYear(mth)) continue; // only the upcoming occurrence counts
      rec[mth] = (rec[mth] ?? 0) + 1;
    }
    return rec;
  };

  const ratings = await guideRatings(client, (guides ?? []).map((g) => g.user_id));

  const facts: GuideFacts[] = (guides ?? []).map((g) => ({
    guideId: g.user_id,
    tier: g.tier,
    rating: ratings[g.user_id]?.value ?? null,
    reviewCount: ratings[g.user_id]?.count ?? 0,
    porterWelfare: !!g.porter_welfare,
    medianResponseMins: g.median_response_mins,
    languages: langsByGuide.get(g.user_id) ?? [],
    openDaysByMonth: monthsFree(g.user_id),
    offerings: (offerings ?? [])
      .filter((o) => o.guide_id === g.user_id)
      .map((o) => {
        const r = o.route_id ? routeById.get(o.route_id) : null;
        const bd = (o.price_breakdown ?? null) as PriceBreakdown | null;
        let cheapest: number | null = null;
        let from: number | null = null;
        if (hasBreakdown(bd)) {
          // Budget floor = the recomposer's cheapest package at this group size.
          cheapest = budgetConfigs(bd, q.groupSize)[0]?.perPersonUsdCents ?? null;
          from = computeExperiencePricing(bd, q.groupSize).perPersonUsdCents;
        } else if (o.price_usd_cents != null) {
          cheapest = o.price_usd_cents;
          from = o.price_usd_cents;
        }
        return {
          id: o.id,
          slug: o.slug,
          kind: o.kind,
          title: o.title,
          days: o.days,
          region: (r?.region ?? null) as Region | null,
          difficulty: r?.difficulty ?? null,
          seasonMonths: r?.season_months ?? null,
          cheapestUsdCents: cheapest,
          fromUsdCents: from,
        };
      }),
  }));

  return {
    results: rankGuides(facts, q),
    guides: new Map((guides ?? []).map((g) => [g.user_id, g])),
  };
}
