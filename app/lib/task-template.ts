/**
 * The 30 things a trek needs and the 15 an experience needs, as data.
 *
 * Straight out of Raman's ops spec, including its own numbering, stages and
 * "done when" column — this file is that table and nothing else, so when the
 * spec changes the diff is readable by the person who wrote it.
 *
 * Two things the spec leaves implicit and this makes explicit:
 *
 * **Owner is who moves first.** The spec writes "Trekker + office" for a
 * passport, because the trekker uploads it and the office checks it. Nothing
 * happens until the trekker uploads, so the owner is the client and the
 * office's half is the `verify` task it already has. Two owners on one row is
 * two people each assuming the other has it.
 *
 * **Not every task has a date.** "Daily", "As needed", "Within 24h" and
 * "Once" are not T-minus offsets, and inventing one would put a red overdue
 * badge on a task that is not late. Those carry `offsetDays: null` and simply
 * have no due date.
 */

export type TaskOwner = "client" | "guide" | "office" | "system";

export interface TaskSpec {
  /** Stable across regenerations — the conflict key on (booking_id, key). */
  key: string;
  /** The spec's own grouping, used as the checklist's headings. */
  stage: string;
  label: string;
  owner: TaskOwner;
  /** The spec's "Done when" column, shown to whoever has to do it. */
  doneWhen: string;
  /** Counted from departure unless stated. */
  from?: "departure" | "booking";
  /** Days before (negative) or after (positive) the anchor. Null = no date. */
  offsetDays: number | null;
  /** Time of day, where the spec gives one ("6pm"). Experiences run to it. */
  at?: string;
}

/**
 * The trek lifecycle, T-120 to T+14.
 *
 * Numbered as the spec numbers it, so row 13 here is row 13 there.
 */
export const TREK_TASKS: TaskSpec[] = [
  // 1–4 · getting to a booked trip
  { key: "quote", stage: "Inquiry", label: "Answer the enquiry and send a quote", owner: "office", doneWhen: "Quote sent", offsetDays: null },
  { key: "deposit", stage: "Booked", label: "Deposit charged and recorded", owner: "system", doneWhen: "Payment ID stored", from: "booking", offsetDays: 0 },
  { key: "guide_accept", stage: "Booked", label: "Guide accepts the trip", owner: "guide", doneWhen: "Accepted in the app", from: "booking", offsetDays: 1 },
  { key: "contract", stage: "Booked", label: "Guide contract signed", owner: "office", doneWhen: "Both signatures", from: "booking", offsetDays: 7 },

  // 5–9 · documents
  { key: "passport", stage: "Documents", label: "Passports uploaded and verified", owner: "client", doneWhen: "Verified, 6+ months valid", offsetDays: -120 },
  { key: "insurance", stage: "Documents", label: "Insurance verified", owner: "client", doneWhen: "Altitude, helicopter and dates all covered", offsetDays: -120 },
  { key: "health", stage: "Documents", label: "Altitude health questions answered", owner: "client", doneWhen: "Submitted, flags reviewed", offsetDays: -90 },
  { key: "emergency_call", stage: "Documents", label: "Emergency contact confirmed by phone", owner: "office", doneWhen: "Call logged", offsetDays: -60 },
  { key: "waiver", stage: "Documents", label: "Waiver signed", owner: "client", doneWhen: "Signed", offsetDays: -60 },

  // 10–14 · logistics
  { key: "flights", stage: "Logistics", label: "Domestic flights booked both ways", owner: "office", doneWhen: "Ticket numbers stored", offsetDays: -75 },
  { key: "porter", stage: "Logistics", label: "Porter assigned, insured and accepted", owner: "office", doneWhen: "Porter named", offsetDays: -60 },
  { key: "hotel", stage: "Logistics", label: "Kathmandu hotel booked", owner: "office", doneWhen: "Confirmation stored", offsetDays: -45 },
  { key: "permits", stage: "Logistics", label: "Permits bought for the route", owner: "office", doneWhen: "Permit numbers stored", offsetDays: -30 },
  { key: "pickup", stage: "Logistics", label: "Airport pickup scheduled", owner: "office", doneWhen: "Driver named", offsetDays: -30 },

  // 15–19 · the last fortnight
  { key: "balance", stage: "Final prep", label: "Balance charged", owner: "system", doneWhen: "Paid in full", offsetDays: -14 },
  { key: "briefing", stage: "Final prep", label: "Briefing pack sent to the trekker", owner: "system", doneWhen: "Opened", offsetDays: -7 },
  { key: "reconfirm_flights", stage: "Final prep", label: "Flights reconfirmed", owner: "office", doneWhen: "Reconfirmed", offsetDays: -3 },
  { key: "trip_sheet", stage: "Final prep", label: "Trip sheet sent to the guide", owner: "system", doneWhen: "Opened by the guide", offsetDays: -2 },
  { key: "advance", stage: "Final prep", label: "Cash advance handed to the guide", owner: "office", doneWhen: "Amount logged", offsetDays: -1 },

  // 20–21 · the day they land
  { key: "arrival", stage: "Arrival", label: "Picked up, hotel, briefing, gear check", owner: "office", doneWhen: "All four tapped", offsetDays: 0 },
  { key: "handover", stage: "Arrival", label: "Guide handover", owner: "office", doneWhen: "Tapped", offsetDays: 0 },

  // 22–25 · on the trail
  { key: "checkin", stage: "On trail", label: "Evening check-in every day", owner: "guide", doneWhen: "Check-in by 8pm", offsetDays: null },
  { key: "deviation", stage: "On trail", label: "Any deviation logged", owner: "guide", doneWhen: "Logged", offsetDays: null },
  { key: "return_flight", stage: "Return", label: "Return flight flown", owner: "guide", doneWhen: "Tapped", offsetDays: null },
  { key: "dropoff", stage: "Return", label: "Drop-off done", owner: "office", doneWhen: "Tapped", offsetDays: null },

  // 26–30 · settling up
  { key: "receipts", stage: "Settle", label: "Teahouse receipts submitted", owner: "guide", doneWhen: "Uploaded", offsetDays: 3 },
  { key: "reconcile", stage: "Settle", label: "Advance reconciled", owner: "office", doneWhen: "Balanced", offsetDays: 5 },
  { key: "payout", stage: "Settle", label: "Guide and porter paid, Fund moved", owner: "office", doneWhen: "Payout IDs stored", offsetDays: 7 },
  { key: "review", stage: "Close", label: "Review requested", owner: "system", doneWhen: "Sent", offsetDays: 2 },
  { key: "journal", stage: "Close", label: "Trek journal published, incidents closed", owner: "office", doneWhen: "Trip locked", offsetDays: 14 },
];

/**
 * The day-experience lifecycle.
 *
 * Timed from the slot rather than from a departure, and most of it happens the
 * evening before. Rows 1 and 2 of the spec — creating the product and
 * generating the month's slots — are not a booking's tasks; they belong to the
 * product, and there is no slot model yet (the spec's phase 2). They are left
 * out here rather than attached to whoever happens to book first.
 */
export const EXPERIENCE_TASKS: TaskSpec[] = [
  { key: "booking", stage: "Booking", label: "Payment, waiver and pickup point", owner: "client", doneWhen: "All three done", from: "booking", offsetDays: 0 },
  { key: "minimum", stage: "Slot check", label: "Decide the slot if it is below minimum", owner: "office", doneWhen: "Run, merge or cancel", offsetDays: -1, at: "6pm" },
  { key: "assign", stage: "Slot check", label: "Guide and vehicle assigned", owner: "office", doneWhen: "Both named", offsetDays: -1, at: "6pm" },
  { key: "confirmations", stage: "Confirm", label: "Pickup details sent to every guest", owner: "system", doneWhen: "Sent", offsetDays: -1, at: "7pm" },
  { key: "ack", stage: "Confirm", label: "Guide and driver acknowledge the run sheet", owner: "guide", doneWhen: "Acknowledged", offsetDays: -1, at: "8pm" },
  { key: "chase", stage: "Confirm", label: "Call the guests who did not reply", owner: "office", doneWhen: "Call logged", offsetDays: -1, at: "9pm" },
  { key: "weather", stage: "Morning", label: "Weather check — go or cancel", owner: "office", doneWhen: "Decision logged", offsetDays: 0, at: "1h before" },
  { key: "pickups", stage: "Morning", label: "Every pickup tapped, no-shows marked", owner: "guide", doneWhen: "All tapped", offsetDays: 0 },
  { key: "started", stage: "Live", label: "Started", owner: "guide", doneWhen: "Tapped", offsetDays: 0 },
  { key: "finished", stage: "Live", label: "Finished and dropped off", owner: "guide", doneWhen: "Tapped", offsetDays: 0 },
  { key: "headcount", stage: "Close", label: "Final headcount and expenses", owner: "guide", doneWhen: "Submitted", offsetDays: 0 },
  { key: "review", stage: "Close", label: "Review request sent", owner: "system", doneWhen: "Sent", offsetDays: 0 },
  { key: "payout", stage: "Settle", label: "Guide, driver and host paid", owner: "office", doneWhen: "Paid", offsetDays: 7 },
];

const DAY = 86_400_000;

/** Add days to an ISO date, by UTC midnight so a timezone cannot shift it. */
export function shiftDate(iso: string, days: number): string {
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return new Date(t + days * DAY).toISOString().slice(0, 10);
}

export interface ResolvedTask extends TaskSpec {
  /** The calendar date this is due, or null where the spec gives no date. */
  dueOn: string | null;
}

/**
 * The tasks a booking of this kind has, with the offsets resolved.
 *
 * `kind` is the offering's kind, and only treks get the trek list — a momo
 * crawl does not grow a permits task. The trek/day split is the same one
 * `trackFor` in pipeline.ts makes, and both read `kind === "trek"`.
 */
export function tasksFor(
  kind: string | null | undefined,
  dates: { startDate?: string | null; bookedOn?: string | null },
): ResolvedTask[] {
  const specs = kind === "trek" ? TREK_TASKS : EXPERIENCE_TASKS;
  return specs.map((t) => {
    const anchor = t.from === "booking" ? dates.bookedOn : dates.startDate;
    const dueOn =
      t.offsetDays === null || !anchor ? null : shiftDate(anchor, t.offsetDays);
    return { ...t, dueOn };
  });
}

/** The stages in the order the spec lists them, for a checklist's headings. */
export function stagesFor(kind: string | null | undefined): string[] {
  const seen: string[] = [];
  for (const t of kind === "trek" ? TREK_TASKS : EXPERIENCE_TASKS) {
    if (!seen.includes(t.stage)) seen.push(t.stage);
  }
  return seen;
}
