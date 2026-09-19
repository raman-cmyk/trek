import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingDue } from "~/lib/booking-due";
import { notifyInApp } from "~/lib/inapp.server";
import { nextNudge } from "~/lib/trip-nudge";
import { tripReadiness } from "~/lib/trip-readiness";

/**
 * Tell the trekker the one thing they have to do next.
 *
 * Called at each moment a booking's readiness could have changed: a payment
 * lands, a document is uploaded, the office verifies or rejects one, somebody
 * is added to the roster. Each call asks the same question — what is standing
 * in the way, and is it theirs? — and either says one sentence or stays quiet.
 *
 * **Sent once, ever.** The kind carries the step (`todo_passport`) and the
 * `about` carries the booking, so a second call about the same step finds its
 * own earlier row and says nothing. Without that, every upload in a party of
 * four would ring the bell again for the three still missing.
 *
 * Never throws, for the same reason the rest of this area does not: a
 * reminder must not take down the upload it was reminding somebody about.
 */
export async function nudgeClient(admin: SupabaseClient, bookingId: string): Promise<boolean> {
  try {
    const { data: b } = await admin
      .from("bookings")
      .select(
        "id, status, trekker_id, party_size, start_date, total_usd_cents, deposit_usd_cents, hold_expires_at, insurance_verified_at, insurance_attested_at, offering:offerings(kind)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (!b?.trekker_id) return false;

    const [{ data: payments }, { data: instalments }, { data: documents }, { data: travellers }] =
      await Promise.all([
        admin
          .from("payments")
          .select("type, amount_usd_cents, status")
          .eq("booking_id", bookingId),
        admin
          .from("instalments")
          .select("seq, amount_usd_cents, due_date, status")
          .eq("booking_id", bookingId),
        admin
          .from("booking_documents")
          .select("type, traveller_id, verified_at, rejected_at, superseded_at")
          .eq("booking_id", bookingId),
        admin.from("booking_travellers").select("id, full_name").eq("booking_id", bookingId),
      ]);

    const today = new Date().toISOString().slice(0, 10);
    const due = bookingDue({ ...(b as any), payments, instalments }, today);
    // The guide's and the office's steps are left empty on purpose: none of
    // the client steps reads permits, the contract, the arrangements or the
    // payouts, and `nextNudge` only ever looks at steps owned by the client.
    // Loading five more tables to compute rows we then discard would make a
    // reminder cost more than the upload that triggered it.
    const readiness = tripReadiness({
      status: (b as any).status,
      kind: (b as any).offering?.kind,
      startDate: (b as any).start_date,
      partySize: (b as any).party_size,
      paidUp: due.outstandingUsdCents === 0,
      outstandingUsdCents: due.outstandingUsdCents,
      paymentDueOn: due.next.dueOn,
      documents: documents ?? [],
      travellers: (travellers ?? []) as Array<{ id: string; full_name: string }>,
      insuranceVerifiedAt: (b as any).insurance_verified_at,
      insuranceAttestedAt: (b as any).insurance_attested_at,
      permits: [],
      contractStatus: null,
      arrangements: [],
      guideAdvancePaid: false,
      todayIso: today,
    });

    const nudge = nextNudge(readiness, bookingId);
    if (!nudge) return false;

    const { data: already } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", (b as any).trekker_id)
      .eq("kind", nudge.kind)
      .eq("about_type", "booking")
      .eq("about_id", bookingId)
      .limit(1);
    if (already?.length) return false;

    return await notifyInApp(admin, {
      userId: (b as any).trekker_id,
      kind: nudge.kind,
      title: nudge.title,
      body: nudge.body,
      href: nudge.href,
      about: { type: "booking", id: bookingId },
    });
  } catch {
    /* a reminder is never worth failing the thing that triggered it */
    return false;
  }
}
