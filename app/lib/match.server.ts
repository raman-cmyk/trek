import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetConfigs, computeExperiencePricing, type PriceBreakdown } from "~/lib/experience-pricing";
import { guideRatings } from "~/lib/ratings.server";
import { rankGuides, type GuideFacts, type MatchQuery, type MatchResult, type Region } from "~/lib/match";

/**
 * Gather every verified guide's facts (offerings, routes, languages, calendar,
 * ratings) and rank them for the query. Anon-safe: public views only.
 */
export async function matchGuides(
  client: SupabaseClient,
  q: MatchQuery,
): Promise<{ results: MatchResult[]; guides: Map<string, any> }> {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: guides }, { data: offerings }, { data: routes }, { data: langs }, { data: avail }] =
    await Promise.all([
      client.from("public_guides").select("*"),
      client
        .from("public_offerings")
        .select("id, slug, kind, title, days, route_id, guide_id, price_usd_cents, price_breakdown"),
      client.from("routes").select("id, region, difficulty, season_months"),
      client.from("guide_languages").select("guide_id, language, proficiency"),
      client
        .from("availability")
        .select("guide_id, day")
        .eq("status", "open")
        .gte("day", todayIso),
    ]);

  const routeById = new Map((routes ?? []).map((r) => [r.id, r]));
  const langsByGuide = new Map<string, Array<{ language: string; proficiency: string }>>();
  for (const l of langs ?? []) {
    if (!langsByGuide.has(l.guide_id)) langsByGuide.set(l.guide_id, []);
    langsByGuide.get(l.guide_id)!.push({ language: l.language, proficiency: l.proficiency });
  }
  const openByGuide = new Map<string, Record<number, number>>();
  for (const a of avail ?? []) {
    const m = Number(a.day.slice(5, 7));
    const rec = openByGuide.get(a.guide_id) ?? {};
    rec[m] = (rec[m] ?? 0) + 1;
    openByGuide.set(a.guide_id, rec);
  }

  const ratings = await guideRatings(client, (guides ?? []).map((g) => g.user_id));

  const facts: GuideFacts[] = (guides ?? []).map((g) => ({
    guideId: g.user_id,
    tier: g.tier,
    rating: ratings[g.user_id]?.value ?? null,
    reviewCount: ratings[g.user_id]?.count ?? 0,
    porterWelfare: !!g.porter_welfare,
    medianResponseMins: g.median_response_mins,
    languages: langsByGuide.get(g.user_id) ?? [],
    openDaysByMonth: openByGuide.get(g.user_id) ?? {},
    offerings: (offerings ?? [])
      .filter((o) => o.guide_id === g.user_id)
      .map((o) => {
        const r = o.route_id ? routeById.get(o.route_id) : null;
        const bd = (o.price_breakdown ?? null) as PriceBreakdown | null;
        let cheapest: number | null = null;
        let from: number | null = null;
        if (bd?.guide_fee_total_usd_cents) {
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
