import type { SupabaseClient } from "@supabase/supabase-js";

export interface Rating {
  value: number; // rounded to 1dp
  count: number;
}

/** Aggregate published trekker→guide ratings for a set of guides (public_reviews). */
export async function guideRatings(
  client: SupabaseClient,
  guideIds: string[],
): Promise<Record<string, Rating>> {
  if (guideIds.length === 0) return {};
  const { data } = await client
    .from("public_reviews")
    .select("guide_id, overall")
    .in("guide_id", guideIds);

  const acc: Record<string, { sum: number; count: number }> = {};
  for (const r of (data ?? []) as Array<{ guide_id: string; overall: number }>) {
    (acc[r.guide_id] ??= { sum: 0, count: 0 });
    acc[r.guide_id].sum += r.overall;
    acc[r.guide_id].count += 1;
  }
  const out: Record<string, Rating> = {};
  for (const [id, v] of Object.entries(acc)) {
    out[id] = { value: Math.round((v.sum / v.count) * 10) / 10, count: v.count };
  }
  return out;
}

/**
 * One rating for a whole route — every published review left on any offering
 * that runs it.
 *
 * A route page has no reviews of its own (nobody reviews Manaslu, they review
 * Pemba's Manaslu), so without this the route's structured data has no rating
 * at all and an agent comparing routes has nothing to compare on.
 */
export async function offeringsRating(
  client: SupabaseClient,
  offeringIds: string[],
): Promise<Rating | null> {
  if (offeringIds.length === 0) return null;
  const { data } = await client
    .from("public_reviews")
    .select("overall")
    .in("offering_id", offeringIds);
  const rows = (data ?? []) as Array<{ overall: number }>;
  if (rows.length === 0) return null;
  const sum = rows.reduce((a, r) => a + r.overall, 0);
  return { value: Math.round((sum / rows.length) * 10) / 10, count: rows.length };
}
