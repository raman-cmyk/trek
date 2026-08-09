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
