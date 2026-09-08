/**
 * The trip pipeline — where a trip is, and what happens next.
 *
 * A booking status ("docs_pending") is an ops word. What a trekker in Berlin
 * and a guide in Namche need is the same thing a parcel tracker gives you:
 * the whole route, the step you are on, and the one thing that has to happen
 * next. This module turns the statuses we already store into that.
 *
 * The stages differ by experience, because the trips differ. A 14-day trek
 * needs passports, insurance and permits filed before anyone walks; a
 * half-day food tour needs a meeting point and an appetite. Showing a food
 * tour a "Permits filed" step it will never reach makes the whole track
 * meaningless — so each kind of experience gets its own.
 *
 * Pure on purpose: no database, so the stage a trip is on is testable and
 * cannot disagree between the group page, the chat and the guide's screen.
 */

export type OfferingKind = "trek" | "day_hike" | "food_culture" | "adventure" | "city";
export type StageState = "done" | "current" | "upcoming" | "stopped";

export interface Stage {
  key: string;
  label: string;
  /** What this step actually means, in the words we would say out loud. */
  hint: string;
  state: StageState;
}

interface StageDef {
  key: string;
  label: string;
  hint: string;
  /**
   * Where this stage sits on the one timeline a trip has. Negative positions
   * are the group forming before a booking exists; 0–5 are booking statuses,
   * in the order a booking moves through them.
   */
  at: number;
}

/** Booking statuses in the order a trip passes through them. */
export const BOOKING_ORDER = [
  "pending_deposit",
  "deposit_paid",
  "docs_pending",
  "confirmed",
  "active",
  "completed",
] as const;

const FORMING = -2;
const READY = -1;

/** Stages every trip shares before money moves. */
const START: StageDef[] = [
  {
    key: "forming",
    label: "Getting the group together",
    hint: "Invite the others and agree on dates.",
    at: FORMING,
  },
  {
    key: "ready",
    label: "Trip agreed",
    hint: "Everyone is in and the guide has the dates.",
    at: READY,
  },
];

/**
 * One track per kind of experience.
 *
 * The `at` numbers are what makes a shorter track correct rather than merely
 * shorter: a day hike has no papers stage, so a booking sitting at
 * `docs_pending` still reads as "Paid" on its track instead of falling off
 * the end of it.
 */
const TRACKS: Record<OfferingKind, StageDef[]> = {
  trek: [
    ...START,
    { key: "deposit", label: "Deposit paid", hint: "The dates are held. The balance is due before you fly.", at: 1 },
    { key: "papers", label: "Passports & insurance", hint: "Everyone uploads a passport page and their insurance.", at: 2 },
    { key: "permits", label: "Permits filed", hint: "TIMS and the park permits are with the office.", at: 3 },
    { key: "active", label: "On the trail", hint: "Walking. Your guide checks in each day.", at: 4 },
    { key: "done", label: "Home safe", hint: "Photos, the journal, and your guide gets paid.", at: 5 },
  ],
  // Climbing and rafting: the papers matter, and so does what you can do.
  adventure: [
    ...START,
    { key: "deposit", label: "Deposit paid", hint: "The date is held.", at: 1 },
    { key: "papers", label: "Papers & experience", hint: "Insurance that covers the activity, and what you have done before.", at: 2 },
    { key: "permits", label: "Permit & gear checked", hint: "The permit is filed and your guide has been through the kit list.", at: 3 },
    { key: "active", label: "On the mountain", hint: "Underway with your guide.", at: 4 },
    { key: "done", label: "Down safe", hint: "Photos, the journal, and your guide gets paid.", at: 5 },
  ],
  day_hike: [
    ...START,
    { key: "deposit", label: "Paid", hint: "The day is held.", at: 1 },
    { key: "confirmed", label: "Meeting point sent", hint: "Where to be, what time, what to bring.", at: 3 },
    { key: "active", label: "Out walking", hint: "Out with your guide today.", at: 4 },
    { key: "done", label: "Done", hint: "Photos, a review, and your guide gets paid.", at: 5 },
  ],
  food_culture: [
    ...START,
    { key: "deposit", label: "Paid", hint: "Your seat is held.", at: 1 },
    { key: "confirmed", label: "Where to meet", hint: "The address, the time, and anything you cannot eat.", at: 3 },
    { key: "active", label: "Out with your guide", hint: "Happening today.", at: 4 },
    { key: "done", label: "Done", hint: "Photos, a review, and your guide gets paid.", at: 5 },
  ],
  city: [
    ...START,
    { key: "deposit", label: "Paid", hint: "Your place is held.", at: 1 },
    { key: "confirmed", label: "Where to meet", hint: "The address and the time.", at: 3 },
    { key: "active", label: "Out with your guide", hint: "Happening today.", at: 4 },
    { key: "done", label: "Done", hint: "Photos, a review, and your guide gets paid.", at: 5 },
  ],
};

export function trackFor(kind: string | null | undefined): StageDef[] {
  return TRACKS[(kind ?? "trek") as OfferingKind] ?? TRACKS.trek;
}

/**
 * The track as a reader sees it BEFORE they book.
 *
 * Same definitions the live pipeline uses, so what an experience page promises
 * and what the trip page then shows cannot drift apart — the commonest way a
 * booking flow starts lying is two lists of steps maintained in two places.
 * The forming stages are dropped: somebody reading a listing is not a group
 * yet, and "invite the others" is not an answer to "what happens if I book
 * this".
 */
export function previewTrack(
  kind: string | null | undefined,
): Array<{ key: string; label: string; hint: string }> {
  return trackFor(kind)
    .filter((d) => d.at >= 0)
    .map(({ key, label, hint }) => ({ key, label, hint }));
}

export interface TripState {
  /** 'forming' | 'ready' | 'booked' | 'cancelled' — null for a plain booking. */
  groupStatus?: string | null;
  /** The booking's status, once there is a booking. */
  bookingStatus?: string | null;
}

/** Where the trip is on the one timeline, as a position the stages compare to. */
export function position(state: TripState): number {
  const booking = state.bookingStatus ?? null;
  if (booking && !String(booking).startsWith("cancelled")) {
    const i = BOOKING_ORDER.indexOf(booking as (typeof BOOKING_ORDER)[number]);
    if (i >= 0) return i;
  }
  // No booking yet (or a cancelled one): the group is still the whole story.
  return state.groupStatus === "ready" || state.groupStatus === "booked" ? READY : FORMING;
}

export function isStopped(state: TripState): boolean {
  return (
    state.groupStatus === "cancelled" ||
    String(state.bookingStatus ?? "").startsWith("cancelled")
  );
}

/**
 * The stage track for a trip: every step, with the one it is on marked.
 *
 * A finished trip has no current step — every stage is done, and a track with
 * a pulsing "current" dot on a trip that ended in April is a lie. A cancelled
 * one keeps the steps it reached and marks the rest stopped rather than
 * pretending they are still coming.
 */
export function tripPipeline(
  kind: string | null | undefined,
  state: TripState,
): { stages: Stage[]; stopped: boolean; currentKey: string | null } {
  const defs = trackFor(kind);
  const pos = position(state);
  const stopped = isStopped(state);
  const finished = pos >= BOOKING_ORDER.length - 1;

  // The current stage is the last one the trip has reached — not the first one
  // it has not, which is how a track ends up one step ahead of the truth.
  let currentIndex = 0;
  defs.forEach((d, i) => {
    if (d.at <= pos) currentIndex = i;
  });

  const stages = defs.map((d, i) => {
    let state: StageState;
    if (stopped) state = i < currentIndex ? "done" : i === currentIndex ? "stopped" : "stopped";
    else if (i < currentIndex || finished) state = "done";
    else if (i === currentIndex) state = "current";
    else state = "upcoming";
    return { key: d.key, label: d.label, hint: d.hint, state };
  });

  return {
    stages,
    stopped,
    currentKey: stopped || finished ? null : (defs[currentIndex]?.key ?? null),
  };
}

/** The one line worth showing when there is no room for the whole track. */
export function nextStep(
  kind: string | null | undefined,
  state: TripState,
): { label: string; hint: string } | null {
  const { stages, stopped } = tripPipeline(kind, state);
  if (stopped) return null;
  const current = stages.find((s) => s.state === "current");
  return current ? { label: current.label, hint: current.hint } : null;
}
