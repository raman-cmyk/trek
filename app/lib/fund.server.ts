import type { SupabaseClient } from "@supabase/supabase-js";
import { partyAmounts, type PriceBreakdown } from "~/lib/experience-pricing";

/**
 * The Fund total, in USD cents. One implementation, because /fund and the
 * homepage stats band print the same number and a visitor who sees two
 * different totals has learned something true about how much to trust us.
 *
 * Reads the SNAPSHOT stored on each booking — a guide re-pricing their trek
 * must not rewrite history on a transparency page — falling back to the live
 * breakdown for bookings taken before the snapshot column existed.
 */
export async function fundCollected(
  admin: SupabaseClient,
  opts: { sinceStartDate?: string } = {},
): Promise<{ collected: number; trips: number }> {
  let q = admin
    .from("bookings")
    .select("fund_usd_cents, party_size, status, offering:offerings(price_breakdown)")
    .not("deposit_paid_at", "is", null)
    .not("status", "like", "cancelled%");
  if (opts.sinceStartDate) q = q.gte("start_date", opts.sinceStartDate);
  const { data: rows } = await q;

  let collected = 0;
  let trips = 0;
  for (const b of rows ?? []) {
    let fund = (b as any).fund_usd_cents ?? 0;
    if (!fund) {
      const bd = ((b as any).offering?.price_breakdown ?? null) as PriceBreakdown | null;
      if (!bd?.guide_fee_total_usd_cents) continue;
      fund = partyAmounts(bd, (b as any).party_size).fundUsdCents;
    }
    collected += fund;
    trips += 1;
  }
  return { collected, trips };
}
