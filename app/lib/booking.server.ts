import type { SupabaseClient } from "@supabase/supabase-js";
import { computePricing, computeDeposit, type PriceBreakdown } from "~/lib/pricing";
import { partyAmounts, type PriceBreakdown as ExperienceBreakdown } from "~/lib/experience-pricing";
import { instalmentSchedule } from "~/lib/instalments";
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
  /** v3 lines that have no legacy column — snapshotted onto the booking so
   *  the stored lines always sum to the stored total (audit B2). */
  logisticsUsdCents: number;
  fundUsdCents: number;
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
    .select("kind, days, price_usd_cents, price_breakdown, route_id, guide_id")
    .eq("id", offeringId)
    .single();
  if (!o) throw new Error("offering not found");

  let breakdown: PriceBreakdown;
  let logisticsUsdCents = 0;
  let fundUsdCents = 0;
  const pb = (o as any).price_breakdown as ExperienceBreakdown | null;
  if (pb?.guide_fee_total_usd_cents) {
    // v3: charge exactly what the page displayed — derive from the breakdown.
    const a = partyAmounts(pb, partySize);
    const guideReceives = a.guideUsdCents;
    logisticsUsdCents = a.logisticsUsdCents;
    fundUsdCents = a.fundUsdCents;
    breakdown = {
      guideFeeUsdCents: a.guideUsdCents,
      porterFeeUsdCents: a.portersUsdCents,
      permitFeesUsdCents: a.permitsUsdCents,
      serviceFeeUsdCents: a.trekUsdCents, // the 10% Trek fee is the platform's cut
      permitHandlingUsdCents: 0,
      totalUsdCents: a.totalUsdCents, // guide+porters+permits+logistics+trek+fund
      commissionUsdCents: a.trekUsdCents,
      guideReceivesUsdCents: guideReceives,
      guidePayoutNprPaisa: Math.round(guideReceives * FX_RATE_NPR),
    };
  } else {
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
    breakdown = computePricing({
      isMultiDay: o.kind === "trek",
      partySize,
      fxRateNpr: FX_RATE_NPR,
      days: o.days,
      dayRateUsdCents: guide?.day_rate_usd_cents ?? 0,
      permitFeesPerPersonUsdCents: permitPp,
      offeringPriceUsdCents: o.price_usd_cents ?? 0,
    });
  }

  const endDate = addDays(startDate, Math.max(0, o.days - 1));
  const daysUntil = daysBetween(new Date().toISOString().slice(0, 10), startDate);
  // Two-track (v3 §1e): day experiences are paid in full at checkout — no
  // deposit/balance split. Multi-day treks keep the 30% deposit flow.
  const depositUsdCents =
    o.kind === "trek"
      ? computeDeposit(breakdown.totalUsdCents, daysUntil)
      : breakdown.totalUsdCents;

  return { ...breakdown, depositUsdCents, endDate, days: o.days, logisticsUsdCents, fundUsdCents };
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
      logistics_usd_cents: q.logisticsUsdCents,
      fund_usd_cents: q.fundUsdCents,
      // Accepted holds expire if the deposit isn't paid (released by the
      // enquiry-expiry sweep — audit B3).
      hold_expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
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
    .select("id, status, deposit_usd_cents, total_usd_cents, instalment_count, guide_id, start_date, end_date, enquiry_id, offering:offerings(kind)")
    .eq("id", bookingId)
    .single();
  if (!booking) return { applied: false };
  // Only fulfill a booking still awaiting its deposit — guards against a stray
  // or duplicate webhook (even one carrying a different PaymentIntent) after the
  // deposit has already been recorded.
  if (booking.status !== "pending_deposit") return { applied: false };

  // Checkout may have pre-created this row as `pending` (PI reuse) — settle it
  // rather than inserting a duplicate.
  await admin.from("payments").upsert(
    {
      booking_id: bookingId,
      stripe_payment_intent: paymentIntentId,
      type: "deposit",
      amount_usd_cents: booking.deposit_usd_cents,
      status: "succeeded",
    },
    { onConflict: "stripe_payment_intent,type" },
  );

  await admin
    .from("bookings")
    .update({ status: "deposit_paid", deposit_paid_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "pending_deposit");

  // Paid in full at checkout (day experiences / inside the full-payment
  // window): there is no balance to sweep — advance straight past it. Day
  // experiences need no documents, so they confirm immediately (v3 §1e).
  const balance = booking.total_usd_cents - booking.deposit_usd_cents;
  if (balance <= 0) {
    const isTrek = (booking as any).offering?.kind === "trek";
    await admin
      .from("bookings")
      .update({
        balance_paid_at: new Date().toISOString(),
        status: isTrek ? "docs_pending" : "confirmed",
      })
      .eq("id", bookingId);
  }

  // Generate the interest-free instalment schedule for the balance (v3 §1d).
  if ((booking.instalment_count ?? 1) > 1 && balance > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const sched = instalmentSchedule(balance, booking.instalment_count, today, booking.start_date);
    await admin.from("instalments").insert(
      sched.map((s) => ({
        booking_id: bookingId,
        seq: s.seq,
        amount_usd_cents: s.amountUsdCents,
        due_date: s.dueDate,
      })),
    );
  }

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

/** Cancel a booking, computing the refund per policy (docs/02).
 *
 * Idempotent: an already-cancelled booking returns a zero outcome without a
 * second refund. The refund is split across the actual PaymentIntents (deposit,
 * balance, instalments), capped at each PI's amount — a single-PI refund larger
 * than that PI's charge is rejected by real Stripe (audit B1). The booking's
 * cancelled status is written BEFORE the refund calls so a Stripe failure
 * can't leave a live booking that already released its calendar. `nonpayment`
 * marks a platform-initiated auto-cancel (no punitive trekker bands). */
export async function cancelBooking(
  admin: SupabaseClient,
  stripe: StripeClient,
  bookingId: string,
  reason: "trekker" | "guide" | "force_majeure" | "nonpayment",
  env?: Env,
) {
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, total_usd_cents, guide_fee_usd_cents, start_date, deposit_usd_cents")
    .eq("id", bookingId)
    .single();
  if (!b) throw new Error("booking not found");
  if (b.status.startsWith("cancelled")) {
    return computeCancellation({
      totalPaidUsdCents: 0,
      guideFeeUsdCents: b.guide_fee_usd_cents,
      daysUntilStart: 999,
      reason: reason === "nonpayment" ? "trekker" : reason,
    });
  }

  // What the trekker has paid so far (sum of non-refund succeeded payments).
  const { data: pays } = await admin
    .from("payments")
    .select("amount_usd_cents, type, stripe_payment_intent")
    .eq("booking_id", bookingId)
    .eq("status", "succeeded");
  const charges = (pays ?? []).filter(
    (p) => p.type !== "refund" && p.stripe_payment_intent,
  );
  const paid = charges.reduce((s, p) => s + p.amount_usd_cents, 0);

  const daysUntil = daysBetween(new Date().toISOString().slice(0, 10), b.start_date);
  const outcome = computeCancellation({
    totalPaidUsdCents: paid,
    guideFeeUsdCents: b.guide_fee_usd_cents,
    daysUntilStart: daysUntil,
    // Platform-initiated non-payment cancels refund like a guide cancel
    // would be unfair the other way: the trekker broke the deal, but the
    // platform picked the moment — use force-majeure's 100% base and let the
    // deposit terms live in copy. Simplest fair rule: treat as trekker band.
    reason: reason === "nonpayment" ? "trekker" : reason,
  });

  // Mark cancelled first (conditionally — beats a racing second cancel), then
  // stop future instalments, release the calendar, and finally move money.
  const statusMap = {
    trekker: "cancelled_trekker",
    guide: "cancelled_guide",
    force_majeure: "cancelled_force_majeure",
    nonpayment: "cancelled_trekker",
  } as const;
  const { data: updated } = await admin
    .from("bookings")
    .update({ status: statusMap[reason], cancellation_reason: reason })
    .eq("id", bookingId)
    .not("status", "like", "cancelled%")
    .select("id");
  if (!updated || updated.length === 0) return outcome; // lost the race

  await admin
    .from("instalments")
    .update({ status: "cancelled" })
    .eq("booking_id", bookingId)
    .eq("status", "scheduled");

  await admin
    .from("availability")
    .update({ status: "open", booking_id: null })
    .eq("booking_id", bookingId);

  // Refund PI-by-PI, largest first, capped at each PI's own charge.
  let remaining = outcome.refundToTrekkerUsdCents;
  for (const p of charges.sort((a, c) => c.amount_usd_cents - a.amount_usd_cents)) {
    if (remaining <= 0) break;
    const amt = Math.min(remaining, p.amount_usd_cents);
    const re = await stripe.refund({
      paymentIntentId: p.stripe_payment_intent!,
      amountUsdCents: amt,
    });
    await admin.from("payments").insert({
      booking_id: bookingId,
      stripe_payment_intent: p.stripe_payment_intent,
      stripe_refund_id: re.id,
      type: "refund",
      amount_usd_cents: -amt,
      status: "succeeded",
    });
    remaining -= amt;
  }

  if (env) {
    const { notifyBookingCancelled } = await import("~/lib/notifications.server");
    await notifyBookingCancelled(env, admin, bookingId, outcome.refundToTrekkerUsdCents);
  }
  return outcome;
}

// ---- Sweeps (called by cron; see routes/api.cron.$job.tsx) ------------------

/**
 * Record the guide's payout when a booking completes (audit: payouts were only
 * ever seeded — no code path created them, so earnings/ledgers went stale).
 * Idempotent per booking; amount is the NPR snapshot fixed at accept time.
 */
export async function createPayoutForBooking(admin: SupabaseClient, bookingId: string) {
  const { data: existing } = await admin
    .from("payouts")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: b } = await admin
    .from("bookings")
    .select("guide_id, guide_payout_npr_paisa, guide:guides(payout_method)")
    .eq("id", bookingId)
    .single();
  if (!b) return null;

  const { data: created } = await admin
    .from("payouts")
    .insert({
      guide_id: b.guide_id,
      booking_id: bookingId,
      amount_npr_paisa: b.guide_payout_npr_paisa,
      method: (b as any).guide?.payout_method ?? "bank",
      status: "payable",
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

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

  // Release accepted-but-unpaid holds past their TTL (audit B3): cancel the
  // pending_deposit booking and re-open its held calendar days.
  const { data: stale } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "pending_deposit")
    .lt("hold_expires_at", now);
  let released = 0;
  for (const b of stale ?? []) {
    await admin
      .from("bookings")
      .update({ status: "cancelled_trekker", cancellation_reason: "hold_expired" })
      .eq("id", b.id)
      .eq("status", "pending_deposit");
    await admin
      .from("availability")
      .update({ status: "open", booking_id: null })
      .eq("booking_id", b.id)
      .eq("status", "held");
    released++;
  }
  return { expiredEnquiries: expired?.length ?? 0, releasedHolds: released };
}

/** Charge balances at T-14 and auto-cancel unpaid at T-10 (docs/02). */
export async function runBalanceSweep(
  admin: SupabaseClient,
  stripe: StripeClient,
  todayIso: string,
  env?: Env,
) {
  // Bookings that have paid a deposit but not the balance, starting within 14d.
  const { data: due } = await admin
    .from("bookings")
    .select("id, total_usd_cents, deposit_usd_cents, start_date, balance_paid_at, instalment_count")
    .eq("status", "deposit_paid")
    .is("balance_paid_at", null);

  let charged = 0;
  let cancelled = 0;
  let instalmentsCharged = 0;
  for (const b of due ?? []) {
    // Instalment bookings pay the balance on their own schedule — never
    // auto-charge the whole balance or cancel them via the 14-day sweep.
    if ((b.instalment_count ?? 1) > 1) {
      instalmentsCharged += await sweepInstalments(admin, stripe, b, todayIso, env);
      continue;
    }
    const daysUntil = daysBetween(todayIso, b.start_date);
    const balance = Math.max(0, b.total_usd_cents - b.deposit_usd_cents);
    if (daysUntil <= 10) {
      await cancelBooking(admin, stripe, b.id, "nonpayment", env);
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
        if (env) {
          const { notifyBalanceCharged } = await import("~/lib/notifications.server");
          await notifyBalanceCharged(env, admin, b.id, balance);
        }
      }
    }
  }
  return { charged, cancelled, instalmentsCharged };
}

/**
 * Charge any instalments now due (due_date on/before today, still scheduled) for
 * one booking. When the last instalment is paid the booking's balance is settled
 * and it advances to docs_pending — same terminal state as the balance sweep.
 * Returns the number of instalments charged this run.
 */
async function sweepInstalments(
  admin: SupabaseClient,
  stripe: StripeClient,
  booking: { id: string; balance_paid_at: string | null },
  todayIso: string,
  env?: Env,
): Promise<number> {
  const { data: rows } = await admin
    .from("instalments")
    .select("id, seq, amount_usd_cents, due_date, status")
    .eq("booking_id", booking.id)
    .order("seq", { ascending: true });
  if (!rows || rows.length === 0) return 0;

  let n = 0;
  for (const it of rows) {
    if (it.status !== "scheduled") continue;
    if (it.due_date > todayIso) continue; // not due yet
    const pi = await stripe.createDepositIntent({
      amountUsdCents: it.amount_usd_cents,
      bookingId: booking.id,
      saveCard: false,
    });
    const res = await stripe.retrievePaymentIntent(pi.paymentIntentId);
    if (res.status !== "succeeded") continue;
    await admin.from("payments").insert({
      booking_id: booking.id,
      stripe_payment_intent: pi.paymentIntentId,
      type: "balance",
      amount_usd_cents: it.amount_usd_cents,
      status: "succeeded",
    });
    await admin
      .from("instalments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", it.id)
      .eq("status", "scheduled");
    n++;
    if (env) {
      const { notifyInstalmentCharged } = await import("~/lib/notifications.server");
      await notifyInstalmentCharged(env, admin, booking.id, it.amount_usd_cents);
    }
  }

  // If nothing is left scheduled, the balance is fully paid → advance the booking.
  const { count: remaining } = await admin
    .from("instalments")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id)
    .eq("status", "scheduled");
  if ((remaining ?? 0) === 0) {
    await admin
      .from("bookings")
      .update({ balance_paid_at: new Date().toISOString(), status: "docs_pending" })
      .eq("id", booking.id)
      .is("balance_paid_at", null);
  }
  return n;
}
