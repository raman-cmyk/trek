/**
 * Adding, correcting and removing the people on a booking.
 *
 * Both the trekker's own trip page and the office's booking page write the
 * same roster, so the rules live here once: a name that looks like a name, no
 * more people than the trip was booked for, exactly one lead, and no removing
 * somebody whose passport we are already holding.
 *
 * The reads and writes follow docs/OPS-PAGES.md — every write is looked at,
 * and every failure comes back as a sentence rather than as a page that
 * reloads unchanged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { travellerNameProblem } from "~/lib/validate";
import { liveDocs } from "~/lib/doc-review";

export interface RosterResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const SELECT = "id, full_name, is_lead, passport_expiry";

export async function listTravellers(admin: SupabaseClient, bookingId: string) {
  const { data } = await admin
    .from("booking_travellers")
    .select(SELECT)
    .eq("booking_id", bookingId)
    // The lead first: on an incident call they are the name that matters.
    .order("is_lead", { ascending: false })
    .order("created_at");
  return data ?? [];
}

/**
 * The lead traveller, seeded from the account holder.
 *
 * A solo trekker should confirm a name that is already there rather than type
 * their own into an empty box — and the name we hold is the one on the
 * account, which is the one they gave us when they paid.
 */
export async function ensureLeadTraveller(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("booking_travellers")
    .select("id")
    .eq("booking_id", bookingId)
    .limit(1);
  if ((existing ?? []).length > 0) return;

  const { data: b } = await admin
    .from("bookings")
    .select("trekker_id, trekker:users!bookings_trekker_id_fkey(full_name)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return;

  const name = String((b as any).trekker?.full_name ?? "").trim();
  // An account with no name on it is possible; better an empty roster the
  // trekker fills in than a traveller called "Lead traveller" on a permit.
  if (!name || travellerNameProblem(name)) return;

  await admin.from("booking_travellers").insert({
    booking_id: bookingId,
    full_name: name,
    is_lead: true,
    added_by: (b as any).trekker_id,
  });
}

export async function addTraveller(
  admin: SupabaseClient,
  args: { bookingId: string; fullName: string; addedBy: string },
): Promise<RosterResult> {
  const name = args.fullName.trim();
  const problem = travellerNameProblem(name);
  if (problem) return { ok: false, error: problem.message };

  const { data: b } = await admin
    .from("bookings")
    .select("party_size")
    .eq("id", args.bookingId)
    .maybeSingle();
  const partySize = Math.max(1, Number((b as any)?.party_size ?? 1));

  const existing = await listTravellers(admin, args.bookingId);
  if (existing.length >= partySize) {
    return {
      ok: false,
      error: `This trip is booked for ${partySize}. Tell us if the party has grown and we will re-price it.`,
    };
  }
  if (existing.some((t: any) => t.full_name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: `${name} is already on the list.` };
  }

  const ins = await admin.from("booking_travellers").insert({
    booking_id: args.bookingId,
    full_name: name,
    // The first person on the list is the one we ring.
    is_lead: existing.length === 0,
    added_by: args.addedBy,
  });
  if (ins.error) return { ok: false, error: "That name would not save. Try again." };
  // One more person is one more passport owed, so a confirmed trip may not be.
  const { applyBookingStatus } = await import("~/lib/booking-status.server");
  await applyBookingStatus(admin, args.bookingId);
  return { ok: true, message: `${name} added.` };
}

export async function renameTraveller(
  admin: SupabaseClient,
  args: { bookingId: string; travellerId: string; fullName: string },
): Promise<RosterResult> {
  const name = args.fullName.trim();
  const problem = travellerNameProblem(name);
  if (problem) return { ok: false, error: problem.message };

  const upd = await admin
    .from("booking_travellers")
    .update({ full_name: name })
    .eq("id", args.travellerId)
    .eq("booking_id", args.bookingId)
    .select("id");
  if (upd.error || (upd.data ?? []).length === 0) {
    return { ok: false, error: "We could not find that person on this trip." };
  }
  // The documents carry the name for the office's lists; a correction that
  // left them behind would put two spellings back on one booking.
  await admin
    .from("booking_documents")
    .update({ person_name: name })
    .eq("traveller_id", args.travellerId);
  return { ok: true, message: "Name corrected." };
}

/**
 * Take somebody off the list.
 *
 * Refused while we are holding their papers: a passport scan whose owner is
 * not on the trip is a document nobody can explain, and the delete would take
 * `traveller_id` to null and leave it there (0099's foreign key is
 * `on delete set null`). Send the document back first, or remove it.
 */
export async function removeTraveller(
  admin: SupabaseClient,
  args: { bookingId: string; travellerId: string },
): Promise<RosterResult> {
  const { data: t } = await admin
    .from("booking_travellers")
    .select("full_name")
    .eq("id", args.travellerId)
    .eq("booking_id", args.bookingId)
    .maybeSingle();
  if (!t) return { ok: false, error: "We could not find that person on this trip." };

  const { data: docs } = await admin
    .from("booking_documents")
    .select("id, rejected_at, superseded_at")
    .eq("traveller_id", args.travellerId);
  if (liveDocs(docs ?? []).length > 0) {
    return {
      ok: false,
      error: `We are holding documents for ${(t as any).full_name}. Remove those first.`,
    };
  }

  const del = await admin
    .from("booking_travellers")
    .delete()
    .eq("id", args.travellerId)
    .eq("booking_id", args.bookingId)
    .select("id");
  if (del.error) return { ok: false, error: "That would not save. Try again." };

  // Somebody has to be the lead. If we just removed them, the longest-standing
  // name takes it rather than nobody.
  const left = await listTravellers(admin, args.bookingId);
  if (left.length > 0 && !left.some((x: any) => x.is_lead)) {
    await admin.from("booking_travellers").update({ is_lead: true }).eq("id", left[0].id);
  }
  const { applyBookingStatus } = await import("~/lib/booking-status.server");
  await applyBookingStatus(admin, args.bookingId);
  return { ok: true, message: `${(t as any).full_name} removed.` };
}

/** Who we ring first. Exactly one, enforced by a unique index in 0099. */
export async function setLeadTraveller(
  admin: SupabaseClient,
  args: { bookingId: string; travellerId: string },
): Promise<RosterResult> {
  // Clear first: the partial unique index would refuse two leads mid-update.
  const cleared = await admin
    .from("booking_travellers")
    .update({ is_lead: false })
    .eq("booking_id", args.bookingId)
    .eq("is_lead", true)
    .select("id");
  if (cleared.error) return { ok: false, error: "That would not save. Try again." };

  const upd = await admin
    .from("booking_travellers")
    .update({ is_lead: true })
    .eq("id", args.travellerId)
    .eq("booking_id", args.bookingId)
    .select("full_name");
  if (upd.error || (upd.data ?? []).length === 0) {
    // Put the old lead back rather than leaving the booking with none.
    for (const row of cleared.data ?? []) {
      await admin.from("booking_travellers").update({ is_lead: true }).eq("id", row.id);
    }
    return { ok: false, error: "We could not find that person on this trip." };
  }
  return { ok: true, message: `We will call ${(upd.data as any)[0].full_name} first.` };
}
