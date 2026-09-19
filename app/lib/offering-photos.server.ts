import type { SupabaseClient } from "@supabase/supabase-js";
import { byOffering, type PhotoRow } from "~/lib/offering-photos";

export interface OfferingPhotoRow extends PhotoRow {
  offering_id: string;
}

/**
 * Every approved photograph for a set of trips, in one round trip.
 *
 * `public_offerings` carries `cover_photo_url` and nothing else, so a card in
 * a grid had one picture to show even where the guide had uploaded five. One
 * batched select beside the queries a browse page already runs — the same
 * shape as the guide-kinds lookup — rather than a query per card.
 *
 * Only approved rows: an unapproved upload is one nobody has looked at, and a
 * browse grid is the last place it should appear first.
 */
export async function photosByOffering(
  client: SupabaseClient,
  offeringIds: readonly string[],
): Promise<Record<string, OfferingPhotoRow[]>> {
  const ids = [...new Set(offeringIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data } = await client
    .from("offering_photos")
    .select("offering_id, url, alt_text, credit_name")
    .in("offering_id", ids)
    .eq("approved", true)
    .order("sort");
  return byOffering((data ?? []) as OfferingPhotoRow[]);
}
