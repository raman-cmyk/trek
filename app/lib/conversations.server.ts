import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Find (or create) the pre-booking conversation between a trekker and a guide,
 * optionally about a specific offering. One thread per (trekker, guide,
 * offering) so re-messaging the same guide continues the conversation.
 */
export async function findOrCreateConversation(
  admin: SupabaseClient,
  trekkerId: string,
  guideId: string,
  offeringId: string | null,
): Promise<string | null> {
  let q = admin
    .from("conversations")
    .select("id")
    .eq("trekker_id", trekkerId)
    .eq("guide_id", guideId);
  q = offeringId ? q.eq("offering_id", offeringId) : q.is("offering_id", null);
  const { data: existing } = await q.maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await admin
    .from("conversations")
    .insert({ trekker_id: trekkerId, guide_id: guideId, offering_id: offeringId })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}
