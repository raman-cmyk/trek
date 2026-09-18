/**
 * Reading a booking's facts and writing the status they imply.
 *
 * The rule lives in `booking-status.ts`, pure and tested. This is the half
 * that goes to the database for the facts and puts the answer back, and it is
 * what the twelve hand-written `status:` updates call instead of naming a
 * status themselves.
 *
 * Called after every fact change: a payment settling, a document verified or
 * rejected, a traveller added, a permit issued, a check-in closing the trip.
 * Today `confirmIfDocsComplete` is the only re-evaluation in the codebase and
 * it fires from `verifyDocument` alone — so a booking that becomes complete
 * any other way never notices.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveBookingStatus, isCancelled, type StatusFacts } from "~/lib/booking-status";
import { outstandingUsdCents } from "~/lib/group-pay";
import { documentsComplete } from "~/lib/travellers";

/** How far along a status is, for the sweep's forward-only rule. */
const RANK: Record<string, number> = {
  pending_deposit: 0,
  deposit_paid: 1,
  docs_pending: 2,
  confirmed: 3,
  active: 4,
  completed: 5,
};

/** Everything the rule needs, read in one go. */
export async function statusFacts(
  admin: SupabaseClient,
  bookingId: string,
  todayIso = new Date().toISOString().slice(0, 10),
): Promise<StatusFacts | null> {
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, party_size, total_usd_cents, deposit_paid_at, balance_paid_at, completed_confirmed_at, offering:offerings(kind)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;

  const [{ data: payments }, { data: docs }, { data: travellers }] = await Promise.all([
    admin
      .from("payments")
      .select("type, amount_usd_cents, status")
      .eq("booking_id", bookingId),
    admin
      .from("booking_documents")
      .select("type, traveller_id, verified_at, rejected_at, superseded_at")
      .eq("booking_id", bookingId),
    admin.from("booking_travellers").select("id, full_name, is_lead").eq("booking_id", bookingId),
  ]);

  // Only a trek collects documents; a momo crawl has none to wait for.
  const needsDocuments = (b as any).offering?.kind === "trek";

  return {
    current: (b as any).status,
    startDate: (b as any).start_date,
    endDate: (b as any).end_date,
    // The timestamp OR a settled deposit payment. A deposit does not un-pay,
    // and a booking whose stamp is missing must never be walked back to
    // pending_deposit on the strength of a null column.
    depositPaid:
      !!(b as any).deposit_paid_at ||
      (payments ?? []).some((p: any) => p.type === "deposit" && p.status === "succeeded") ||
      // Or the status already says so. A deposit does not un-pay, and a
      // booking past pending_deposit must never be walked back there.
      String((b as any).status ?? "") !== "pending_deposit",
    // `balance_paid_at` first, then the group-aware arithmetic — which the
    // balance sweep learned the hard way: a trip paid for by four people is
    // paid for. The stamp has to come first because every booking made before
    // Stripe was configured has the stamp and no payment rows at all, and
    // counting only the rows would report every one of them as unpaid.
    outstandingUsdCents: (b as any).balance_paid_at
      ? 0
      : outstandingUsdCents((b as any).total_usd_cents ?? 0, payments ?? []),
    documentsComplete: documentsComplete({
      travellers: (travellers ?? []) as any,
      docs: (docs ?? []) as any,
      partySize: (b as any).party_size ?? 1,
    }),
    needsDocuments,
    closedOut: !!(b as any).completed_confirmed_at,
    todayIso,
  };
}

/**
 * Re-derive and write. Returns the status it settled on.
 *
 * Writes only when the answer has changed, so calling it on every page load
 * is free. It will not touch a cancelled booking — nothing un-cancels a trip.
 */
export async function applyBookingStatus(
  admin: SupabaseClient,
  bookingId: string,
  todayIso?: string,
  opts: { forwardOnly?: boolean } = {},
): Promise<{ status: string | null; changed: boolean }> {
  const facts = await statusFacts(admin, bookingId, todayIso);
  if (!facts) return { status: null, changed: false };
  if (isCancelled(facts.current)) {
    return { status: String(facts.current), changed: false };
  }

  const next = deriveBookingStatus(facts);
  if (next === facts.current) return { status: next, changed: false };

  // A sweep's job is to notice the calendar, not to re-litigate a
  // confirmation: it moves a trip on when its dates say so and never pulls
  // one back. Walking a confirmed trip backwards is a real move, but it
  // belongs to the event that caused it — a passport sent back, a traveller
  // added — where the caller knows what changed and can say so.
  if (opts.forwardOnly && RANK[next] < RANK[String(facts.current)]) {
    return { status: String(facts.current), changed: false };
  }

  const upd = await admin
    .from("bookings")
    .update({ status: next })
    .eq("id", bookingId)
    // Belt and braces against a cancellation landing between the read and the
    // write: a trip cancelled a moment ago must not come back as confirmed.
    .eq("status", facts.current as string)
    .select("status");
  if (upd.error || (upd.data ?? []).length === 0) {
    return { status: String(facts.current), changed: false };
  }
  return { status: next, changed: true };
}
