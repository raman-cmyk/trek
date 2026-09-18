import type { SupabaseClient } from "@supabase/supabase-js";
import { stampsFor } from "~/lib/permits";

/** Deterministic blue-card serial for a booking. Pure + testable. */
export function timsCardNo(bookingId: string, year: number): string {
  const hex = bookingId.replace(/[^a-f0-9]/gi, "").slice(0, 6).toUpperCase().padEnd(6, "0");
  return `TIMS-B-${year}-${hex}`;
}

export type IssueResult =
  | { ok: true; cardNo: string }
  | { ok: false; reason: string };

/**
 * Issue the blue TIMS card for a booking.
 *
 * Gated on two things now. The 2026 rule — insurance verified, covering
 * high-altitude trekking and helicopter evacuation — and the route actually
 * requiring TIMS, which this never checked. TIMS exists as an ordinary permit
 * row on two of the six routes; on the other four this function would print a
 * card anyway, and the office read "TIMS card issued" beside "no permit
 * application" for the same trek. Six cards went out that way.
 *
 * Refusing is not a dead end: the message names the route, and the office can
 * add the TIMS permit to it from the route's own permits list if the route
 * does require one. What it will not do any more is decide for itself.
 *
 * On success it writes BOTH models — the `tims_cards` row and the route's TIMS
 * `permit_applications` row, moved to `ready` with the card number as its
 * reference — so the two can no longer disagree.
 *
 * Idempotent: a second call returns the existing card. Only ops call this.
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
      "id, start_date, end_date, party_size, insurance_verified_at, trekker:users!bookings_trekker_id_fkey(full_name, country_code), guide:guides(licence_no, users(full_name)), offering:offerings(title, meeting_point, route_id, route:routes(name, region, max_altitude_m))",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return { ok: false, reason: "Booking not found." };
  if (!b.insurance_verified_at) {
    return { ok: false, reason: "Insurance must be verified before the blue card can be issued." };
  }

  const off: any = (b as any).offering;

  // Does this route require TIMS at all? Asked of the permits model rather
  // than assumed, which is the whole fix.
  const routeName = off?.route?.name ?? off?.title ?? "this route";
  if (!off?.route_id) {
    return { ok: false, reason: `${routeName} has no route on it, so we cannot tell whether TIMS applies.` };
  }
  const { data: timsPermit } = await admin
    .from("permits")
    .select("id")
    .eq("route_id", off.route_id)
    .eq("code", "tims")
    .maybeSingle();
  if (!timsPermit) {
    return {
      ok: false,
      reason: `${routeName} has no TIMS card in its permit list, so there is nothing to issue. If it does need one, add it to the route's permits first.`,
    };
  }

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

  // The same fact in the permits model. Upserted rather than inserted: the
  // application may already exist, filed by the trigger when the booking
  // confirmed (0013).
  const { data: application } = await admin
    .from("permit_applications")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("permit_id", timsPermit.id)
    .maybeSingle();
  const patch = {
    status: "ready",
    reference_no: cardNo,
    ...stampsFor("ready"),
  };
  if (application) {
    await admin.from("permit_applications").update(patch).eq("id", application.id);
  } else {
    await admin
      .from("permit_applications")
      .insert({ booking_id: bookingId, permit_id: timsPermit.id, ...patch });
  }
  return { ok: true, cardNo };
}
