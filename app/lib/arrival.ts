/**
 * The day the trekker lands in Kathmandu.
 *
 * Not the day the trek starts. A guide plans the briefing, the kit check and
 * the domestic flight around the arrival, and until now nothing recorded it —
 * so it lived in a chat message, or in nobody's head.
 *
 * Pure: what a typed date is allowed to be, and how the gap reads once it is
 * known.
 */

export type ArrivalProblem = "malformed" | "after_start" | "long_before";

/** More than this before the start and it was probably a typo for the year. */
export const MAX_DAYS_EARLY = 60;

export interface ArrivalCheck {
  date: string | null;
  problem: ArrivalProblem | null;
}

/**
 * Read an arrival date from a form.
 *
 * Empty is fine and means "not known yet" — most people book the trek before
 * the flight, and demanding a date they do not have would cost the booking.
 */
export function parseArrival(raw: unknown, startDate: string): ArrivalCheck {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { date: null, problem: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: null, problem: "malformed" };
  const at = Date.parse(`${s}T00:00:00Z`);
  const start = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(at) || Number.isNaN(start)) return { date: null, problem: "malformed" };
  if (at > start) return { date: null, problem: "after_start" };
  if ((start - at) / 86_400_000 > MAX_DAYS_EARLY) return { date: null, problem: "long_before" };
  return { date: s, problem: null };
}

export function arrivalError(problem: ArrivalProblem, startDate: string, fmtDate: (iso: string) => string): string {
  switch (problem) {
    case "malformed":
      return "That arrival date doesn't look like a date.";
    case "after_start":
      return `You can't land after the trek starts on ${fmtDate(startDate)}.`;
    case "long_before":
      return `That's more than ${MAX_DAYS_EARLY} days before the start — check the year.`;
  }
}

/** Nights in Nepal before the walk begins. Null when the arrival is unknown. */
export function daysBeforeStart(arrival: string | null, startDate: string): number | null {
  if (!arrival) return null;
  const at = Date.parse(`${arrival}T00:00:00Z`);
  const start = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(at) || Number.isNaN(start)) return null;
  return Math.round((start - at) / 86_400_000);
}

/**
 * What the guide reads on their booking card.
 *
 * The gap is the useful part: landing the same morning the trek starts is a
 * plan with no room in it, and a guide should see that before the day.
 */
export function arrivalLine(
  arrival: string | null,
  startDate: string,
  fmtDate: (iso: string) => string,
): string {
  if (!arrival) return "Arrival in Kathmandu: not told yet";
  const gap = daysBeforeStart(arrival, startDate);
  if (gap === 0) return `Lands in Kathmandu ${fmtDate(arrival)} — the morning the trek starts`;
  if (gap === 1) return `Lands in Kathmandu ${fmtDate(arrival)} — the day before`;
  return `Lands in Kathmandu ${fmtDate(arrival)} — ${gap} days before the start`;
}

/** True when there is no slack at all between landing and walking. */
export function isTightArrival(arrival: string | null, startDate: string): boolean {
  const gap = daysBeforeStart(arrival, startDate);
  return gap !== null && gap <= 1;
}
