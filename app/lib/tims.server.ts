import type { SupabaseClient } from "@supabase/supabase-js";

/** Deterministic blue-card serial for a booking. Pure + testable. */
export function timsCardNo(bookingId: string, year: number): string {
  const hex = bookingId.replace(/[^a-f0-9]/gi, "").slice(0, 6).toUpperCase().padEnd(6, "0");
  return `TIMS-B-${year}-${hex}`;
}

export type IssueResult =
  | { ok: true; cardNo: string }
  | { ok: false; reason: string };

/**
 * Issue the blue TIMS card for a booking. Gated on the 2026 rule: insurance must
 * be verified (covering high-altitude trekking + heli evacuation). Idempotent —
 * a second call returns the existing card. Only ops call this.
 */
export async function issueTimsCard(
  admin: SupabaseClient,
  bookingId: string,
  opsUserId: string,
): Promise<IssueResult> {
  const { data: existing } = await admin
    .from("tims_cards")
    .select("card_no")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) return { ok: true, cardNo: existing.card_no };

  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, start_date, end_date, party_size, insurance_verified_at, trekker:users(full_name, country_code), guide:guides(licence_no, users(full_name)), offering:offerings(title, meeting_point, route:routes(name, region, max_altitude_m))",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return { ok: false, reason: "Booking not found." };
  if (!b.insurance_verified_at) {
    return { ok: false, reason: "Insurance must be verified before the blue card can be issued." };
  }

  const off: any = (b as any).offering;
  const year = Number((b.start_date ?? new Date().toISOString()).slice(0, 4));
  const cardNo = timsCardNo(bookingId, year);

  const { error } = await admin.from("tims_cards").insert({
    booking_id: bookingId,
    card_no: cardNo,
    trekker_name: (b as any).trekker?.full_name ?? "Trekker",
    nationality: (b as any).trekker?.country_code ?? null,
    guide_name: (b as any).guide?.users?.full_name ?? null,
    guide_licence_no: (b as any).guide?.licence_no ?? null,
    route_name: off?.route?.name ?? off?.title ?? null,
    region: off?.route?.region ?? null,
    entry_point: off?.meeting_point ?? null,
    start_date: b.start_date,
    end_date: b.end_date,
    party_size: b.party_size,
    issued_by: opsUserId,
    status: "issued",
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, cardNo };
}
