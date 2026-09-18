/**
 * Insurance, as a queue rather than a field on thirty-seven booking pages.
 *
 * Every trek needs cover that pays for a helicopter above 4,000 m, and from
 * 2026 the TIMS card will not be issued without it. That makes insurance a
 * job of its own — somebody sits down and works through the ones waiting —
 * and it was only ever visible one trip at a time, which meant the way you
 * found an unverified policy was to open a booking and notice.
 *
 * Pure: the state of one booking's insurance, derived from the columns we
 * already store, so the queue, the booking page and the readiness bar cannot
 * disagree about whether a policy is in.
 */

import type { StatusFilter } from "~/lib/status-filter";
import { allOf } from "~/lib/status-filter";

/**
 * What the two cover questions are called in `insurance_meta`, and which of
 * them actually stop a trek.
 *
 * Altitude and helicopter are the two that matter: a policy that covers a
 * broken ankle in Kathmandu and not a longline off a col at 5,000 m is the
 * policy people arrive with, and the one the office has to catch.
 */
export const REQUIRED_COVER = ["altitude", "helicopter"] as const;

export type InsuranceState =
  | "verified"
  | "help_wanted"
  | "cover_short"
  | "waiting"
  | "sent_back"
  | "not_declared";

export interface InsuranceRow {
  status?: string | null;
  insurance_attested_at?: string | null;
  insurance_verified_at?: string | null;
  insurance_rejected_at?: string | null;
  insurance_meta?: Record<string, unknown> | null;
  /** They asked us to find them a policy (0097). */
  insurance_help_asked_at?: string | null;
  insurance_help_closed_at?: string | null;
}

/** Does the declared policy cover the two things a trek needs? */
export function coverIsEnough(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return false;
  return REQUIRED_COVER.every((k) => Boolean(meta[k]));
}

/**
 * Where one booking's insurance stands.
 *
 * Order matters, and each line of it is a decision.
 *
 * Verified is verified even where a cover box is unticked — a person cleared
 * that, and the queue arguing with them helps nobody.
 *
 * "They asked us" comes next and outranks every unfinished state, because it
 * is the only one where WE have made a promise. The product told them a real
 * person was sorting their insurance out. Until that person has, the ask
 * outranks whether they happen to have declared a policy of their own.
 *
 * Short cover then beats plain waiting: it is a different job. Not "check
 * this" but "tell them to go and buy a different one", and it needs saying
 * weeks out rather than the night before.
 */
export function insuranceState(b: InsuranceRow): InsuranceState {
  if (b.insurance_verified_at) return "verified";
  if (b.insurance_help_asked_at && !b.insurance_help_closed_at) return "help_wanted";
  if (b.insurance_rejected_at) return "sent_back";
  if (!b.insurance_attested_at) return "not_declared";
  return coverIsEnough(b.insurance_meta) ? "waiting" : "cover_short";
}

/** Which cover boxes are missing, for a line that says what to ask for. */
export function missingCover(meta: Record<string, unknown> | null | undefined): string[] {
  return REQUIRED_COVER.filter((k) => !meta?.[k]);
}

export const INSURANCE_STATES: InsuranceState[] = [
  "verified",
  "help_wanted",
  "cover_short",
  "waiting",
  "sent_back",
  "not_declared",
];

/**
 * The tabs, in the order somebody works them.
 *
 * Short cover first: it is the only one where the answer is "this trip cannot
 * go as insured", and burying it under the ordinary queue is how it gets
 * found late.
 */
export const INSURANCE_FILTERS: StatusFilter[] = [
  allOf(),
  { key: "help_wanted", label: "Asked us to sort it", statuses: ["help_wanted"] },
  { key: "cover_short", label: "Cover too thin", statuses: ["cover_short"] },
  { key: "waiting", label: "Waiting on us", statuses: ["waiting"] },
  { key: "not_declared", label: "Nothing declared", statuses: ["not_declared"] },
  { key: "sent_back", label: "Sent back", statuses: ["sent_back"] },
  { key: "verified", label: "Verified", statuses: ["verified"] },
];

export const INSURANCE_LABEL: Record<InsuranceState, string> = {
  verified: "verified",
  help_wanted: "asked us to sort it",
  cover_short: "cover too thin",
  waiting: "waiting on us",
  sent_back: "sent back",
  not_declared: "nothing declared",
};

export const INSURANCE_TONE: Record<InsuranceState, "green" | "red" | "amber" | "neutral" | "blue"> =
  {
    verified: "green",
    help_wanted: "blue",
    cover_short: "red",
    waiting: "amber",
    sent_back: "blue",
    not_declared: "neutral",
  };

/**
 * Soonest trek first, and a trip with no date last.
 *
 * The one that leaves first is the one whose insurance hurts first. An empty
 * date sorting to the front — which is what a bare string compare does — puts
 * the least urgent rows where the eye lands.
 */
export function bySoonestStart<T extends { start_date?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    (a.start_date ?? "9999-99-99").localeCompare(b.start_date ?? "9999-99-99"),
  );
}

/**
 * Trips whose insurance is still somebody's job, worst first.
 *
 * Cancelled bookings are not work. Nor is a trek that has already been
 * walked: chasing a policy for a trip that finished in August is noise, and
 * the queue's whole value is that everything in it is worth doing.
 */
export function needsAttention<T extends InsuranceRow & { start_date?: string | null }>(
  rows: T[],
  todayIso: string,
): T[] {
  // Our own promise first. Then the trip that cannot go as insured, then the
  // ordinary queue, then the ones waiting on somebody else.
  const rank: Record<InsuranceState, number> = {
    help_wanted: 0,
    cover_short: 1,
    waiting: 2,
    not_declared: 3,
    sent_back: 4,
    verified: 9,
  };
  return bySoonestStart(
    rows.filter((r) => {
      if (String(r.status ?? "").startsWith("cancelled")) return false;
      if (String(r.status ?? "") === "completed") return false;
      if ((r.start_date ?? "9999") < todayIso) return false;
      return insuranceState(r) !== "verified";
    }),
  ).sort((a, b) => rank[insuranceState(a)] - rank[insuranceState(b)]);
}
