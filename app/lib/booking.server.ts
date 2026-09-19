import type { SupabaseClient } from "@supabase/supabase-js";
import { computePricing, computeDeposit, type PriceBreakdown } from "~/lib/pricing";
import { partyAmounts, type PriceBreakdown as ExperienceBreakdown , hasBreakdown } from "~/lib/experience-pricing";
import { instalmentSchedule } from "~/lib/instalments";
import { computeCancellation } from "~/lib/policy";
import { BALANCE_AUTOCANCEL_DAYS_BEFORE, FX_RATE_NPR } from "~/lib/config";
import { isCancelledBooking, isUniqueViolation } from "~/lib/ask-guard";
import { outstandingUsdCents } from "~/lib/group-pay";
import { missedRunEndingAt, needsWelfareCheck } from "~/lib/checkin";
import type { StripeClient } from "~/lib/stripe.server";
import { generateContractForBooking } from "~/lib/contracts.server";
import { applyBookingStatus } from "~/lib/booking-status.server";
import { siteUrl } from "~/lib/site-url";

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

/**
 * Build a quote from an offering + party size + start date (pricing.ts).
 *
 * `override` prices a package that is no longer the offering: a proposal the
 * guide adjusted — a day added, an option the trekker ticked, a line written
 * for this trip alone. It runs through the same arithmetic rather than beside
 * it, so an agreed package cannot be priced differently from a listed one.
 */
export async function quote(
  admin: SupabaseClient,
  offeringId: string,
  partySize: number,
  startDate: string,
  override?: { breakdown: ExperienceBreakdown; days: number },
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
  const days = override ? Math.max(1, Math.round(override.days)) : o.days;
  const pb = (override?.breakdown ?? (o as any).price_breakdown) as ExperienceBreakdown | null;
  if (hasBreakdown(pb)) {
    // v3: charge exactly what the page displayed — derive from the breakdown.
    const a = partyAmounts(pb, partySize, startDate);
    const guideReceives = a.guideUsdCents;
    logisticsUsdCents = a.logisticsUsdCents;
    fundUsdCents = a.fundUsdCents;
    breakdown = {
      guideFeeUsdCents: a.guideUsdCents,
      porterFeeUsdCents: a.portersUsdCents,
      permitFeesUsdCents: a.permitsUsdCents,
      serviceFeeUsdCents: a.trekUsdCents, // our 10% fee is the platform's cut
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
      days,
      dayRateUsdCents: guide?.day_rate_usd_cents ?? 0,
      permitFeesPerPersonUsdCents: permitPp,
      offeringPriceUsdCents: o.price_usd_cents ?? 0,
    });
  }

  const endDate = addDays(startDate, Math.max(0, days - 1));
  const daysUntil = daysBetween(new Date().toISOString().slice(0, 10), startDate);
  // Two-track (v3 §1e): day experiences are paid in full at checkout — no
  // deposit/balance split. Multi-day treks keep the 30% deposit flow.
  const depositUsdCents =
    o.kind === "trek"
      ? computeDeposit(breakdown.totalUsdCents, daysUntil)
      : breakdown.totalUsdCents;

  return { ...breakdown, depositUsdCents, endDate, days, logisticsUsdCents, fundUsdCents };
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
    // 'quoted' too: a guide who proposed a different package and then thought
    // better of it could not accept the original request at all — the button
    // was there and answered "expired or already handled" every time.
    .in("status", ["open", "quoted"])
    .maybeSingle();
  if (!enq) return null;

  // A second booking must not be created out of one request. Guarded on the
  // bookings themselves rather than the enquiry's status, which is the thing
  // that can drift.
  const { data: already } = await admin
    .from("bookings")
    .select("id, status")
    .eq("enquiry_id", enq.id)
    .limit(5);
  if ((already ?? []).some((b: any) => !isCancelledBooking(b.status))) {
    return null;
  }

  // Nor out of two requests. Before 2026-09-07 a trekker could send the
  // identical ask twice, and the guide's list showed the same trek on the same
  // dates twice with no way to tell them apart; accepting both booked the
  // fortnight twice. The duplicate ask is now refused at the door and by an
  // index, but requests made before that are still sitting in guides' lists,
  // so the accept refuses them too rather than trusting the queue to be clean.
  const { data: twinBooking } = await admin
    .from("bookings")
    .select("id, status")
    .eq("trekker_id", enq.trekker_id)
    .eq("offering_id", enq.offering_id)
    .eq("start_date", enq.start_date)
    .limit(5);
  if ((twinBooking ?? []).some((b: any) => !isCancelledBooking(b.status))) {
    return null;
  }

  const q = await quote(admin, enq.offering_id, enq.party_size, enq.start_date);
  // Requests are not held while they wait, so by the time one is accepted the
  // days may have gone to somebody else. Accepting anyway used to overwrite
  // the other booking's calendar rows and double-book the guide in silence.
  const clash = await clashingDays(admin, enq.guide_id, enq.start_date, q.endDate);
  if (clash.length) throw new DaysTakenError(clash);
  return bookFromQuote(admin, enq, q);
}

/**
 * Days in this span the guide is no longer free for.
 *
 * A day with no row at all counts as free: guides who never opened a calendar
 * still take bookings, and a proposal's dates are typed by the guide, who is
 * the authority on whether they are free that week.
 */
export async function clashingDays(
  admin: SupabaseClient,
  guideId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const { data } = await admin
    .from("availability")
    .select("day, status")
    .eq("guide_id", guideId)
    .gte("day", startDate)
    .lte("day", endDate)
    .in("status", ["held", "booked", "blocked"]);
  return (data ?? []).map((r: { day: string }) => r.day);
}

/** Thrown when the calendar moved under a request between asking and accepting. */
export class DaysTakenError extends Error {
  constructor(public readonly days: string[]) {
    super(`days no longer free: ${days.join(", ")}`);
    this.name = "DaysTakenError";
  }
}

/**
 * Turn an agreed trip into a booking.
 *
 * Shared by the two ways a trip gets agreed: the guide accepting the enquiry
 * as it was asked, and a trekker approving a package the guide proposed. One
 * implementation, so an adjusted package cannot end up with a different hold,
 * a different contract, or no group.
 */
async function bookFromQuote(
  admin: SupabaseClient,
  enq: {
    /** Null when the package was agreed in a conversation, not an enquiry. */
    id: string | null;
    trekker_id: string;
    guide_id: string;
    offering_id: string;
    start_date: string;
    party_size: number;
  },
  q: Quote,
): Promise<string> {
  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      enquiry_id: enq.id,
      trekker_id: enq.trekker_id,
      guide_id: enq.guide_id,
      offering_id: enq.offering_id,
      start_date: enq.start_date,
      end_date: q.endDate,
      // The party and the length come from what was agreed, which on an
      // approved proposal is not what the offering says.
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

  if (enq.id) {
    await admin.from("enquiries").update({ status: "accepted" }).eq("id", enq.id);
  }

  // Auto-generate + auto-sign the Company↔Guide contract for this engagement.
  // Best-effort: never let contract generation block the booking itself.
  try {
    await generateContractForBooking(admin, booking.id);
  } catch {
    // swallow — ops can regenerate from the booking detail if needed
  }

  // A trip for two or more gets a group: somewhere to invite the others, talk,
  // and split the bill. Only now that the guide has confirmed — a group around
  // an unconfirmed trip is a room full of people with nothing to plan. Also
  // best-effort: the booking is the thing that must not fail.
  // ...and a booking a group asked for is linked back to that group, whatever
  // its size, so the organiser does not end up with two pages for one trek.
  //
  // The condition that used to sit here — `enq.party_size > 1 || enq.id` — was
  // always true, since enq.id is the enquiry we are accepting. groupForBooking
  // is the one place that decides, so there is no second copy of the rule to
  // drift out of step with it.
  try {
    const { groupForBooking } = await import("~/lib/groups.server");
    await groupForBooking(admin, booking.id);
  } catch {
    // swallow — the trekker can still make one by hand from /groups
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
  // Insert, and if the checkout already left a pending row for this intent,
  // settle that one instead.
  //
  // Deliberately NOT an upsert. The unique index this table relies on is
  // partial (`where stripe_payment_intent is not null`, from 0028), and
  // Postgres will only infer a non-partial index for ON CONFLICT — so every
  // upsert here returned 42P10 and silently recorded nothing. 0114 fixes the
  // index, but this path must not wait for a migration to start recording
  // money, and it is better off not depending on the shape of an index that
  // PostgREST cannot fully express.
  //
  // The race is covered: two writers both inserting means the loser gets
  // 23505 from that same index and takes the update path.
  let payErr: { message: string } | null = null;
  const { error: insErr } = await admin.from("payments").insert({
    booking_id: bookingId,
    stripe_payment_intent: paymentIntentId,
    type: "deposit",
    amount_usd_cents: booking.deposit_usd_cents,
    status: "succeeded",
  });
  if (insErr && isUniqueViolation(insErr)) {
    const { error: updErr } = await admin
      .from("payments")
      .update({ status: "succeeded", amount_usd_cents: booking.deposit_usd_cents })
      .eq("stripe_payment_intent", paymentIntentId)
      .eq("type", "deposit");
    payErr = updErr;
  } else {
    payErr = insErr;
  }
  // This is the record that money arrived, and it used to be fired without
  // anyone reading the answer. It always failed (0114), so the first real
  // deposit taken on this platform advanced a booking while leaving the
  // payments table empty. If it fails again, the booking must NOT advance:
  // a trek marked paid with no payment row cannot be reconciled or refunded,
  // and the idempotency guard above reads this very row.
  if (payErr) {
    console.error("[fulfillDeposit] could not record payment", bookingId, payErr.message);
    throw new Error(`could not record payment for booking ${bookingId}: ${payErr.message}`);
  }

  await advanceOnDepositPaid(admin, bookingId);
  return { applied: true };
}

/**
 * The deposit is in — move the booking on.
 *
 * Split out because a deposit now arrives two ways: one payer through
 * checkout, or every member of a group paying their own share (0069). What
 * happens next must be identical either way, and the surest way to make it
 * identical is to have one copy of it.
 */
export async function advanceOnDepositPaid(admin: SupabaseClient, bookingId: string) {
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, deposit_usd_cents, total_usd_cents, instalment_count, guide_id, start_date, end_date, enquiry_id, offering:offerings(kind)")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.status !== "pending_deposit") return;

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
  // A group's page follows the booking, so it moves with it.
  await admin
    .from("trip_groups")
    .update({ status: "booked" })
    .eq("booking_id", bookingId)
    .neq("status", "cancelled");

  // The checklist (0103). Generated here rather than at enquiry: a trip
  // nobody has paid for has no logistics, and thirty open tasks against it
  // would bury the trips that do.
  const { generateTasks } = await import("~/lib/tasks.server");
  await generateTasks(admin, bookingId);

  // The deposit itself is one of those tasks, and it is done by definition.
  await admin
    .from("checklist_tasks")
    .update({ state: "done", done_at: new Date().toISOString() })
    .eq("subject_type", "booking")
    .eq("subject_id", bookingId)
    .eq("key", "deposit")
    .eq("state", "open");
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
  /**
   * `env` was a bare optional parameter, so a caller that simply left it off
   * cancelled a trip and told nobody. As an options bag the omission has to be
   * written down. `actorId` is who pressed it — null means the platform did,
   * which is the non-payment sweep and is a real answer, not a missing one.
   */
  opts: { env?: Env; actorId?: string | null } = {},
) {
  const { env } = opts;
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, total_usd_cents, guide_fee_usd_cents, start_date, deposit_usd_cents, enquiry_id")
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
    .update({
      status: statusMap[reason],
      cancellation_reason: reason,
      cancelled_at: new Date().toISOString(),
      cancelled_by: opts.actorId ?? null,
    })
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

  // The request that produced this trip ends here too (0107). Without it the
  // request stays "accepted" for ever and the trek page goes on telling the
  // trekker the guide said yes to a trip that no longer exists — which is
  // what every accepted request in production was doing.
  if (b.enquiry_id) {
    await admin
      .from("enquiries")
      .update({ status: "cancelled" })
      .eq("id", b.enquiry_id)
      .in("status", ["accepted", "converted"]);
  }

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

  // The guide and the office are told in the app whatever else happens. This
  // needs no API key and no phone number, and `env` here is OPTIONAL — a
  // caller that omits it used to cancel a trip in total silence.
  const { notifyCancelledInApp } = await import("~/lib/notifications.server");
  await notifyCancelledInApp(admin, bookingId, outcome.refundToTrekkerUsdCents);

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
  // kind, not just booking_id: a trip may also carry an advance paid before
  // anybody walked (0095). Without narrowing, this maybeSingle() would see two
  // rows, return an error rather than a row, and write a second settlement on
  // top of the first.
  const { data: existing } = await admin
    .from("payouts")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", "final")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: b } = await admin
    .from("bookings")
    .select("guide_id, guide_payout_npr_paisa, guide:guides(payout_method)")
    .eq("id", bookingId)
    .single();
  if (!b) return null;

  // The settlement is the fee minus whatever the guide has already had. An
  // advance that is not deducted is the office paying the same work twice.
  const { data: advance } = await admin
    .from("payouts")
    .select("amount_npr_paisa")
    .eq("booking_id", bookingId)
    .eq("kind", "advance")
    .maybeSingle();
  const owed = Math.max(
    0,
    (b.guide_payout_npr_paisa ?? 0) - (advance?.amount_npr_paisa ?? 0),
  );

  const { data: created } = await admin
    .from("payouts")
    .insert({
      guide_id: b.guide_id,
      booking_id: bookingId,
      amount_npr_paisa: owed,
      method: (b as any).guide?.payout_method ?? "bank",
      status: "payable",
      kind: "final",
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

/**
 * Missed-check-in sweep (docs/01 F7).
 *
 * Two thresholds, because one silent day and two silent days are different
 * situations. A guide walks past the last cell tower before lunch and fills
 * the day in that night: flagging it is right, waking anybody is not. Two days
 * in a row with no word is where the office stops assuming and picks up a
 * phone, so that one is an L2 and it emails every ops account rather than
 * waiting to be noticed on a board nobody has open.
 *
 * Counted as a RUN ending today, not as a total: a trek missing days 2 and 9
 * has been out of signal twice; a trek missing days 8 and 9 has not been heard
 * from since day seven. And a check-in filled in late closes the run, which is
 * why a guide catching up from the trail settles this without anyone acting.
 */
export async function runMissedCheckinSweep(
  admin: SupabaseClient,
  todayIso: string,
  opsUserId: string,
  env?: Env,
) {
  const { data: active } = await admin
    .from("bookings")
    .select("id, start_date, end_date")
    .eq("status", "active");

  let alerts = 0;
  let welfareChecks = 0;
  for (const b of active ?? []) {
    const { data: days } = await admin
      .from("checkins")
      .select("day")
      .eq("booking_id", b.id);
    const run = missedRunEndingAt(
      b.start_date,
      b.end_date ?? b.start_date,
      todayIso,
      (days ?? []).map((d: { day: string }) => d.day),
    );
    if (run < 1) continue;

    const welfare = needsWelfareCheck(run);
    const { data: open } = await admin
      .from("incidents")
      .select("id, severity")
      .eq("booking_id", b.id)
      .neq("status", "closed")
      .ilike("summary", "Missed check-in%")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // An open L1 that has now become two days of silence is raised rather
    // than left as it was — otherwise the first quiet day suppresses the
    // alert for the day that actually matters.
    if (open) {
      if (welfare && open.severity !== "L2") {
        await admin
          .from("incidents")
          .update({
            severity: "L2",
            summary: `Missed check-in — ${run} days with no word. Welfare check needed.`,
          })
          .eq("id", open.id);
        await notifyOpsWelfareCheck(env, admin, b.id, run);
        welfareChecks++;
      }
      continue;
    }

    await admin.from("incidents").insert({
      booking_id: b.id,
      severity: welfare ? "L2" : "L1",
      summary: welfare
        ? `Missed check-in — ${run} days with no word. Welfare check needed.`
        : "Missed check-in — no check-in in the last 24h.",
      status: "open",
      opened_by: opsUserId,
      timeline: [
        {
          at: todayIso,
          actor: "system",
          action: welfare
            ? `Auto-flagged: ${run} days with no check-in — welfare check`
            : "Auto-flagged: missed check-in",
        },
      ],
    });
    alerts++;
    if (welfare) {
      await notifyOpsWelfareCheck(env, admin, b.id, run);
      welfareChecks++;
    }
  }
  return { alerts, welfareChecks };
}

/**
 * Tell the office, by email, that somebody has not been heard from.
 *
 * An incident row is a thing you find when you go looking. Two days of silence
 * on a trek at altitude is a thing that has to find you. Best-effort on
 * purpose: a mail server having a bad morning must not stop the sweep
 * flagging the rest of the treks.
 */
async function notifyOpsWelfareCheck(
  env: Env | undefined,
  admin: SupabaseClient,
  bookingId: string,
  missedDays: number,
) {
  if (!env) return;
  try {
    const [{ data: b }, { data: ops }] = await Promise.all([
      admin
        .from("bookings")
        .select(
          "start_date, end_date, party_size, offering:offerings(title), trekker:users!bookings_trekker_id_fkey(full_name), guide:guides(users(full_name, phone))",
        )
        .eq("id", bookingId)
        .maybeSingle(),
      admin.from("users").select("email").eq("role", "ops"),
    ]);
    if (!b) return;
    const { sendEmail } = await import("~/lib/notify.server");
    const guide = (b as any).guide?.users;
    const body = [
      `${(b as any).offering?.title ?? "A trek"} has had no check-in for ${missedDays} days.`,
      "",
      `Trekker: ${(b as any).trekker?.full_name ?? "—"} (party of ${b.party_size})`,
      `Guide: ${guide?.full_name ?? "—"}${guide?.phone ? ` — ${guide.phone}` : ""}`,
      `Dates: ${b.start_date} → ${b.end_date}`,
      "",
      "Call the guide. If you cannot reach them, call the trekker's emergency",
      "contact and the guide's next of kin, both on the booking page:",
      `${siteUrl(env as any)}/ops/bookings/${bookingId}`,
    ].join("\n");

    for (const o of ops ?? []) {
      if (!o.email) continue;
      await sendEmail(env, o.email, `Welfare check — ${missedDays} days with no word`, body);
    }
  } catch {
    // never let a notification failure stop the sweep
  }
}

/** Expire open enquiries past their TTL, and release accepted-but-unpaid holds. */
/**
 * `env` is optional only because two callers predate it. Without it this sweep
 * does exactly what it always did — end things silently — which is the bug it
 * now exists to fix, so pass it.
 */
export async function runEnquiryExpirySweep(admin: SupabaseClient, env?: Env) {
  const now = new Date().toISOString();
  const { data: expired } = await admin
    .from("enquiries")
    .update({ status: "expired" })
    .lt("expires_at", now)
    .eq("status", "open")
    .select("id");

  // Telling people is deliberately outside the update: the status change is
  // the thing that must not fail, and a mail problem must never leave an
  // enquiry looking open when it is not. Each send is also its own try/catch
  // inside sendEmail, so one bad address cannot stop the rest of the sweep.
  if (env) {
    const { notifyEnquiryExpired } = await import("~/lib/notifications.server");
    for (const e of expired ?? []) await notifyEnquiryExpired(env, admin, e.id);
  }

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
    // Both sides. The trekker lost the dates their guide had agreed to, and
    // the guide has days to sell again — neither used to be told either thing.
    if (env) {
      const { notifyHoldReleased } = await import("~/lib/notifications.server");
      await notifyHoldReleased(env, admin, b.id);
    }
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
  let settled = 0;
  for (const b of due ?? []) {
    // What is actually still owed, counted from the money that has arrived
    // rather than from `total − deposit`. A group pays in shares against this
    // same booking; the old arithmetic could not see them, so five people
    // could pay for the whole trek and the organiser's card would still be
    // charged the balance — and, inside ten days, the trip cancelled for
    // nonpayment it had already made.
    const { data: paid } = await admin
      .from("payments")
      .select("type, amount_usd_cents, status")
      .eq("booking_id", b.id);
    const owed = outstandingUsdCents(b.total_usd_cents, paid ?? []);

    // Settled by whoever paid it. Checked before everything else, including
    // the cancellation, because a paid-up trip must never be cancelled.
    if (owed === 0 && b.total_usd_cents > 0) {
      await admin
        .from("bookings")
        .update({ balance_paid_at: new Date().toISOString() })
        .eq("id", b.id)
        .is("balance_paid_at", null);
      // The status follows from the facts rather than being named here: the
      // trip may now be confirmed, or still waiting on a passport.
      await applyBookingStatus(admin, b.id, todayIso);
      settled++;
      continue;
    }

    // Instalment bookings pay the balance on their own schedule — never
    // auto-charge the whole balance or cancel them via the 14-day sweep.
    if ((b.instalment_count ?? 1) > 1) {
      instalmentsCharged += await sweepInstalments(admin, stripe, b, todayIso, env);
      continue;
    }
    const daysUntil = daysBetween(todayIso, b.start_date);
    if (daysUntil <= 10) {
      // No actor: the sweep picked the moment, not a person.
      await cancelBooking(admin, stripe, b.id, "nonpayment", { env });
      cancelled++;
    } else if (daysUntil <= 14) {
      const pi = await stripe.createDepositIntent({
        amountUsdCents: owed,
        bookingId: b.id,
        saveCard: false,
      });
      const res = await stripe.retrievePaymentIntent(pi.paymentIntentId);
      if (res.status === "succeeded") {
        await admin.from("payments").insert({
          booking_id: b.id,
          stripe_payment_intent: pi.paymentIntentId,
          type: "balance",
          amount_usd_cents: owed,
          status: "succeeded",
        });
        await admin
          .from("bookings")
          .update({ balance_paid_at: new Date().toISOString() })
          .eq("id", b.id);
        await applyBookingStatus(admin, b.id, todayIso);
        charged++;
        if (env) {
          const { notifyBalanceCharged } = await import("~/lib/notifications.server");
          await notifyBalanceCharged(env, admin, b.id, owed);
        }
      } else if (env) {
        // The else that was never here. A declined card used to produce
        // nothing at all, and the next thing that happened to this trekker
        // was the T-10 cancellation with the deposit forfeit.
        const { notifyPaymentFailed } = await import("~/lib/notifications.server");
        await notifyPaymentFailed(env, admin, {
          bookingId: b.id,
          amountUsdCents: owed,
          daysUntil,
          daysLeft: daysUntil - BALANCE_AUTOCANCEL_DAYS_BEFORE,
          what: "balance",
        });
      }
    }
  }
  return { charged, cancelled, instalmentsCharged, settled };
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
  // start_date is already on the row the caller selects; it is named here so
  // a failed instalment can say how long is left before the trip is cancelled.
  booking: { id: string; balance_paid_at: string | null; start_date?: string | null },
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
    if (res.status !== "succeeded") {
      // `continue` was the whole of it. The row stayed `scheduled` and was
      // retried silently every day until departure, and nobody was ever told
      // that a payment they had agreed to had stopped going through.
      if (env) {
        const { notifyPaymentFailed } = await import("~/lib/notifications.server");
        const daysUntil = booking.start_date
          ? daysBetween(todayIso, booking.start_date)
          : BALANCE_AUTOCANCEL_DAYS_BEFORE;
        await notifyPaymentFailed(env, admin, {
          bookingId: booking.id,
          amountUsdCents: it.amount_usd_cents,
          daysUntil,
          daysLeft: daysUntil - BALANCE_AUTOCANCEL_DAYS_BEFORE,
          what: "instalment",
        });
      }
      continue;
    }
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
      .update({ balance_paid_at: new Date().toISOString() })
      .eq("id", booking.id)
      .is("balance_paid_at", null);
    await applyBookingStatus(admin, booking.id, todayIso);
  }
  return n;
}

/**
 * A trekker approves the package their guide proposed.
 *
 * This is the moment a negotiation becomes a trip: the proposal's own
 * breakdown — the extra day, the option they ticked, the line the guide wrote
 * — is what gets priced and what the deposit is taken against. The offering it
 * started from is not consulted again, so editing the listing next month
 * cannot change what somebody already agreed to.
 *
 * Returns the booking id, or null if the proposal is gone, already answered,
 * or is not this person's to answer.
 */
export async function approveProposal(
  admin: SupabaseClient,
  proposalId: string,
  trekkerId: string,
): Promise<string | null> {
  const { data: p } = await admin
    .from("package_proposals")
    .select(
      "id, enquiry_id, conversation_id, group_id, offering_id, guide_id, trekker_id, start_date, days, party_size, price_breakdown, status",
    )
    .eq("id", proposalId)
    .eq("trekker_id", trekkerId)
    .eq("status", "proposed")
    .maybeSingle();
  if (!p) return null;

  // A package agreed in a message thread has no enquiry behind it, so the
  // proposal carries the trip itself; one that came from the booking form
  // still reads it from there.
  const { data: enq } = p.enquiry_id
    ? await admin
        .from("enquiries")
        .select("id, trekker_id, guide_id, offering_id, status")
        .eq("id", p.enquiry_id)
        .maybeSingle()
    : { data: null };
  const offeringId = p.offering_id ?? enq?.offering_id;
  if (!offeringId) return null;

  // A booking already out of this enquiry means approving a second proposal
  // would sell the same trip twice. Checked against the bookings themselves
  // rather than the enquiry's status, which is the thing that could drift.
  if (enq) {
    const { data: already } = await admin
      .from("bookings")
      .select("id, status")
      .eq("enquiry_id", enq.id)
      .limit(5);
    if ((already ?? []).some((b: any) => !String(b.status ?? "").startsWith("cancelled"))) {
      return null;
    }
  }

  const q = await quote(admin, offeringId, p.party_size, p.start_date, {
    breakdown: p.price_breakdown as ExperienceBreakdown,
    days: p.days,
  });

  const bookingId = await bookFromQuote(
    admin,
    {
      id: enq?.id ?? null,
      trekker_id: p.trekker_id,
      guide_id: p.guide_id,
      offering_id: offeringId,
      start_date: p.start_date,
      party_size: p.party_size,
    },
    q,
  );

  await admin
    .from("package_proposals")
    .update({
      status: "approved",
      booking_id: bookingId,
      responded_at: new Date().toISOString(),
    })
    .eq("id", p.id);
  // Any other open proposal in the same conversation, enquiry or group is
  // now moot.
  const sibling = admin
    .from("package_proposals")
    .update({ status: "superseded" })
    .eq("status", "proposed");
  await (p.enquiry_id
    ? sibling.eq("enquiry_id", p.enquiry_id)
    : p.conversation_id
      ? sibling.eq("conversation_id", p.conversation_id)
      : sibling.eq("group_id", p.group_id));

  // A package agreed inside a group is the group's trip: the booking belongs
  // to it, the guide has plainly said yes, and the shares are re-split on the
  // price everybody just agreed to.
  if (p.group_id && bookingId) {
    const { groupTookBooking } = await import("~/lib/groups.server");
    await groupTookBooking(admin, p.group_id, bookingId, p.party_size);
  }

  return bookingId;
}

/**
 * Walk every live trip's status back past its own facts.
 *
 * `active` and `completed` are the two statuses no event produces: nothing
 * happens on the morning a trek starts, so until now the only thing that ever
 * wrote `active` was an ops drag on the kanban — which is why a trek on the
 * trail today could sit in "confirmed" for a fortnight and a finished one
 * stayed there until somebody noticed.
 *
 * Runs daily alongside the other sweeps. It only ever writes when the answer
 * has changed, and it never touches a cancelled booking.
 */
export async function runStatusSweep(
  admin: SupabaseClient,
  todayIso: string,
): Promise<{ checked: number; moved: Array<{ id: string; status: string }> }> {
  const { data: live } = await admin
    .from("bookings")
    .select("id, status")
    .in("status", ["deposit_paid", "docs_pending", "confirmed", "active"]);

  const moved: Array<{ id: string; status: string }> = [];
  for (const b of live ?? []) {
    const res = await applyBookingStatus(admin, (b as any).id, todayIso, {
      forwardOnly: true,
    });
    if (res.changed) moved.push({ id: (b as any).id, status: String(res.status) });
    // A trek that just finished owes a payout row and a recap, the same way
    // it would if the guide had closed it from the app.
    if (res.changed && res.status === "completed") {
      const { createRecap } = await import("~/lib/reviews.server");
      await createRecap(admin, (b as any).id);
      await createPayoutForBooking(admin, (b as any).id);
    }
  }
  return { checked: (live ?? []).length, moved };
}
