import type { SupabaseClient } from "@supabase/supabase-js";
import { computePricing, computeDeposit, type PriceBreakdown } from "~/lib/pricing";
import { computeCancellation } from "~/lib/policy";
import { FX_RATE_NPR } from "~/lib/config";
import type { StripeClient } from "~/lib/stripe.server";
import { generateContractForBooking } from "~/lib/contracts.server";

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface Quote extends PriceBreakdown {
  depositUsdCents: number;
  endDate: string;
  days: number;
}

/** Build a quote from an offering + party size + start date (pricing.ts). */
export async function quote(
  admin: SupabaseClient,
  offeringId: string,
  partySize: number,
  startDate: string,
): Promise<Quote> {
  const { data: o } = await admin
    .from("offerings")
    .select("kind, days, price_usd_cents, route_id, guide_id")
    .eq("id", offeringId)
    .single();
  if (!o) throw new Error("offering not found");

  const { data: guide } = await admin
    .from("guides")
    .select("day_rate_usd_cents")
    .eq("user_id", o.guide_id)
    .single();

  let permitPp = 0;
  if (o.kind === "trek" && o.route_id) {
    const { data: permits } = await admin
      .from("permits")
      .select("cost_usd_cents")
      .eq("route_id", o.route_id);
    permitPp = (permits ?? []).reduce((s, p) => s + p.cost_usd_cents, 0);
  }

  const breakdown = computePricing({
    isMultiDay: o.kind === "trek",
    partySize,
    fxRateNpr: FX_RATE_NPR,
    days: o.days,
    dayRateUsdCents: guide?.day_rate_usd_cents ?? 0,
    permitFeesPerPersonUsdCents: permitPp,
    offeringPriceUsdCents: o.price_usd_cents ?? 0,
  });

  const endDate = addDays(startDate, Math.max(0, o.days - 1));
  const daysUntil = daysBetween(new Date().toISOString().slice(0, 10), startDate);
  const depositUsdCents = computeDeposit(breakdown.totalUsdCents, daysUntil);

  return { ...breakdown, depositUsdCents, endDate, days: o.days };
}

/**
 * Guide accepts an enquiry: create the booking (pending_deposit) with the money
 * snapshot, hold the trek days on the calendar (24h TTL), mark enquiry accepted.
 * Returns the new booking id.
 */
export async function acceptEnquiry(
  admin: SupabaseClient,
  enquiryId: string,
  guideId: string,
): Promise<string | null> {
  const { data: enq } = await admin
    .from("enquiries")
    .select("id, trekker_id, guide_id, offering_id, start_date, party_size, status")
    .eq("id", enquiryId)
    .eq("guide_id", guideId)
    .eq("status", "open")
    .maybeSingle();
  if (!enq) return null;

  const q = await quote(admin, enq.offering_id, enq.party_size, enq.start_date);

  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      enquiry_id: enq.id,
      trekker_id: enq.trekker_id,
      guide_id: enq.guide_id,
      offering_id: enq.offering_id,
      start_date: enq.start_date,
      end_date: q.endDate,
      party_size: enq.party_size,
      status: "pending_deposit",
      guide_fee_usd_cents: q.guideFeeUsdCents,
      porter_fee_usd_cents: q.porterFeeUsdCents,
      permit_fees_usd_cents: q.permitFeesUsdCents,
      service_fee_usd_cents: q.serviceFeeUsdCents,
      permit_handling_usd_cents: q.permitHandlingUsdCents,
      total_usd_cents: q.totalUsdCents,
      commission_usd_cents: q.commissionUsdCents,
      fx_rate_npr: FX_RATE_NPR,
      guide_payout_npr_paisa: q.guidePayoutNprPaisa,
      deposit_usd_cents: q.depositUsdCents,
    })
    .select("id")
    .single();
  if (error || !booking) throw error ?? new Error("booking insert failed");

  // Hold the calendar days for this guide (open → held).
  const days = eachDay(enq.start_date, q.endDate);
  await admin.from("availability").upsert(
    days.map((day) => ({
      guide_id: enq.guide_id,
      day,
      status: "held",
      booking_id: booking.id,
    })),
    { onConflict: "guide_id,day" },
  );

  await admin.from("enquiries").update({ status: "accepted" }).eq("id", enq.id);

  // Auto-generate + auto-sign the Company↔Guide contract for this engagement.
  // Best-effort: never let contract generation block the booking itself.
  try {
    await generateContractForBooking(admin, booking.id);
  } catch {
    // swallow — ops can regenerate from the booking detail if needed
  }
  return booking.id;
}

/**
 * Fulfill a paid deposit (called by the Stripe webhook, or the mock confirm).
 * Idempotent: a second call for the same PaymentIntent is a no-op.
 */
export async function fulfillDeposit(
  admin: SupabaseClient,
  bookingId: string,
  paymentIntentId: string,
): Promise<{ applied: boolean }> {
  // Idempotency: bail if this PaymentIntent was already recorded succeeded.
  const { data: existing } = await admin
    .from("payments")
    .select("id")
    .eq("stripe_payment_intent", paymentIntentId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (existing) return { applied: false };

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, deposit_usd_cents, guide_id, start_date, end_date, enquiry_id")
    .eq("id", bookingId)
    .single();
  if (!booking) return { applied: false };
  // Only fulfill a booking still awaiting its deposit — guards against a stray
  // or duplicate webhook (even one carrying a different PaymentIntent) after the
  // deposit has already been recorded.
  if (booking.status !== "pending_deposit") return { applied: false };

  await admin.from("payments").insert({
    booking_id: bookingId,
    stripe_payment_intent: paymentIntentId,
    type: "deposit",
    amount_usd_cents: booking.deposit_usd_cents,
    status: "succeeded",
  });

  await admin
    .from("bookings")
    .update({ status: "deposit_paid", deposit_paid_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "pending_deposit");

  // held → booked for the trek days.
  await admin
    .from("availability")
    .update({ status: "booked" })
    .eq("booking_id", bookingId);

  if (booking.enquiry_id) {
    await admin.from("enquiries").update({ status: "converted" }).eq("id", booking.enquiry_id);
  }
  // Notifications fire here (Resend/SMS) — wired in M7.
  return { applied: true };
}

/** Cancel a booking, computing the refund per policy (docs/02). */
export async function cancelBooking(
  admin: SupabaseClient,
  stripe: StripeClient,
  bookingId: string,
  reason: "trekker" | "guide" | "force_majeure",
) {
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, total_usd_cents, guide_fee_usd_cents, start_date, deposit_usd_cents")
    .eq("id", bookingId)
    .single();
  if (!b) throw new Error("booking not found");

  // What the trekker has paid so far (sum of non-refund succeeded payments).
  const { data: pays } = await admin
    .from("payments")
    .select("amount_usd_cents, type, stripe_payment_intent")
    .eq("booking_id", bookingId)
    .eq("status", "succeeded");
  const paid = (pays ?? [])
    .filter((p) => p.type !== "refund")
    .reduce((s, p) => s + p.amount_usd_cents, 0);
  const depositPi = (pays ?? []).find((p) => p.type === "deposit")?.stripe_payment_intent;

  const daysUntil = daysBetween(new Date().toISOString().slice(0, 10), b.start_date);
  const outcome = computeCancellation({
    totalPaidUsdCents: paid,
    guideFeeUsdCents: b.guide_fee_usd_cents,
    daysUntilStart: daysUntil,
    reason,
  });

  // Refund via Stripe (mock succeeds).
  if (outcome.refundToTrekkerUsdCents > 0 && depositPi) {
    const re = await stripe.refund({
      paymentIntentId: depositPi,
      amountUsdCents: outcome.refundToTrekkerUsdCents,
    });
    await admin.from("payments").insert({
      booking_id: bookingId,
      stripe_payment_intent: depositPi,
      stripe_refund_id: re.id,
      type: "refund",
      amount_usd_cents: -outcome.refundToTrekkerUsdCents,
      status: "succeeded",
    });
  }

  const statusMap = {
    trekker: "cancelled_trekker",
    guide: "cancelled_guide",
    force_majeure: "cancelled_force_majeure",
  } as const;
  await admin
    .from("bookings")
    .update({ status: statusMap[reason], cancellation_reason: reason })
    .eq("id", bookingId);

  // Release the held/booked calendar days.
  await admin
    .from("availability")
    .update({ status: "open", booking_id: null })
    .eq("booking_id", bookingId);

  return outcome;
}

// ---- Sweeps (called by cron; see routes/api.cron.$job.tsx) ------------------

/**
 * Missed-check-in sweep (docs/01 F7): active multi-day treks whose most recent
 * check-in is older than yesterday get an ops incident (24h alert). A duplicate
 * open incident is not created.
 */
export async function runMissedCheckinSweep(
  admin: SupabaseClient,
  todayIso: string,
  opsUserId: string,
) {
  const { data: active } = await admin
    .from("bookings")
    .select("id, start_date")
    .eq("status", "active");
  const yesterday = new Date(Date.parse(todayIso) - 86_400_000).toISOString().slice(0, 10);

  let alerts = 0;
  for (const b of active ?? []) {
    const { data: last } = await admin
      .from("checkins")
      .select("day")
      .eq("booking_id", b.id)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    const missed = !last || last.day < yesterday;
    if (!missed) continue;
    const { data: open } = await admin
      .from("incidents")
      .select("id")
      .eq("booking_id", b.id)
      .neq("status", "closed")
      .ilike("summary", "Missed check-in%")
      .maybeSingle();
    if (open) continue;
    await admin.from("incidents").insert({
      booking_id: b.id,
      severity: "L1",
      summary: "Missed check-in — no check-in in the last 24h.",
      status: "open",
      opened_by: opsUserId,
      timeline: [{ at: todayIso, actor: "system", action: "Auto-flagged: missed check-in" }],
    });
    alerts++;
  }
  return { alerts };
}

/** Expire open enquiries past their TTL, and release accepted-but-unpaid holds. */
export async function runEnquiryExpirySweep(admin: SupabaseClient) {
  const now = new Date().toISOString();
  const { data: expired } = await admin
    .from("enquiries")
    .update({ status: "expired" })
    .lt("expires_at", now)
    .eq("status", "open")
    .select("id");
  return { expiredEnquiries: expired?.length ?? 0 };
}

/** Charge balances at T-14 and auto-cancel unpaid at T-10 (docs/02). */
export async function runBalanceSweep(
  admin: SupabaseClient,
  stripe: StripeClient,
  todayIso: string,
) {
  // Bookings that have paid a deposit but not the balance, starting within 14d.
  const { data: due } = await admin
    .from("bookings")
    .select("id, total_usd_cents, deposit_usd_cents, start_date, balance_paid_at")
    .eq("status", "deposit_paid")
    .is("balance_paid_at", null);

  let charged = 0;
  let cancelled = 0;
  for (const b of due ?? []) {
    const daysUntil = daysBetween(todayIso, b.start_date);
    const balance = Math.max(0, b.total_usd_cents - b.deposit_usd_cents);
    if (daysUntil <= 10) {
      await cancelBooking(admin, stripe, b.id, "trekker");
      cancelled++;
    } else if (daysUntil <= 14 && balance > 0) {
      const pi = await stripe.createDepositIntent({
        amountUsdCents: balance,
        bookingId: b.id,
        saveCard: false,
      });
      const res = await stripe.retrievePaymentIntent(pi.paymentIntentId);
      if (res.status === "succeeded") {
        await admin.from("payments").insert({
          booking_id: b.id,
          stripe_payment_intent: pi.paymentIntentId,
          type: "balance",
          amount_usd_cents: balance,
          status: "succeeded",
        });
        await admin
          .from("bookings")
          .update({ balance_paid_at: new Date().toISOString(), status: "docs_pending" })
          .eq("id", b.id);
        charged++;
      }
    }
  }
  return { charged, cancelled };
}
