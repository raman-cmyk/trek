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
  /**
   * Say the hint even though this step is done.
   *
   * Normally only the step you are on explains itself — a track where every
   * row carries a paragraph is a wall. But a ticked "Permits filed" raises a
   * question it has to answer: does somebody have to go and fetch them? The
   * answer is no, and it belongs on that line.
   */
  emphasis?: boolean;
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

/**
 * How the permits themselves are doing.
 *
 * The track used to infer this from the booking's status, which cannot know
 * it. A booking sits at `confirmed` from the moment the papers are in until
 * the day the trek starts, so "Permits filed" stayed an open circle for weeks
 * after the permits had been issued and were sitting in the office in
 * Kathmandu. The office had done the work and the trekker was being told it
 * had not.
 */
export type PermitProgress = "none" | "waiting" | "filed" | "issued" | "problem";

/**
 * The one state a trip's permits are in, from however many applications it has.
 *
 * A trek needs several — the park entry, the municipality fee, TIMS — and they
 * are only really "done" when every one of them is. The worst news wins:
 * one rejected permit is the story, however well the others went.
 */
export function permitProgress(
  applications: Array<{ status?: string | null }> | null | undefined,
): PermitProgress {
  const all = applications ?? [];
  if (all.length === 0) return "none";
  const statuses = all.map((a) => String(a.status ?? ""));
  if (statuses.some((s) => s === "rejected")) return "problem";
  if (statuses.every((s) => s === "ready")) return "issued";
  if (statuses.some((s) => s === "filed" || s === "approved" || s === "ready")) return "filed";
  return "waiting";
}

export interface TripState {
  /** 'forming' | 'ready' | 'booked' | 'cancelled' — null for a plain booking. */
  groupStatus?: string | null;
  /** The booking's status, once there is a booking. */
  bookingStatus?: string | null;
  /** What the permit office has actually done, when the caller knows. */
  permits?: PermitProgress;
  /** Who collects them. First name — this is read by the person who booked. */
  guideName?: string | null;
  /**
   * Where to meet, once it is settled. On a day experience this is the whole
   * of the step called "Where to meet", and while it sat unticked with no
   * button under it, it read as a chore the trekker had failed to do — when
   * in fact the address had been agreed at the moment they booked.
   */
  meetingPoint?: string | null;
  /** When the trip starts, formatted by the caller ("23 Sep, 2026"). */
  startsOn?: string | null;
  /** The hour to be there, when the itinerary gives one ("18:00"). */
  meetingTime?: string | null;
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
 * The hour a day experience starts, out of the guide's own itinerary.
 *
 * A day trip's itinerary is a list of times rather than days — "18:00, Meet in
 * Thamel" — and the first of them is when to be there. A multi-day trek has no
 * such hour, and guessing one would be worse than leaving it out.
 */
export function meetingTimeOf(itinerary: unknown): string | null {
  if (!Array.isArray(itinerary)) return null;
  for (const step of itinerary) {
    const t = (step as any)?.time;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return null;
}

/**
 * The steps that are finished because the thing they describe is finished,
 * whatever the booking's status says.
 */
function settledSteps(state: TripState): Set<string> {
  const settled = new Set<string>();
  if (state.permits === "issued") settled.add("permits");
  // "Where to meet" on a day experience, "Meeting point sent" on a day hike.
  if ((state.meetingPoint ?? "").trim()) settled.add("confirmed");
  return settled;
}

/**
 * What a step says, once we know more than its position on the track.
 *
 * Only the permits step and the one after it change: everywhere else the
 * definition's own words are right. The founder's ask, in his words: once the
 * permits are ticked it "need to say Pemba(Guide) will collect it from the
 * office" — because a trekker who reads "issued" quite reasonably wonders
 * whether that means they have to go and fetch something.
 */
function hintFor(
  def: StageDef,
  index: number,
  currentIndex: number,
  state: TripState,
): string {
  const guide = (state.guideName ?? "").trim();
  if (def.key === "permits") {
    switch (state.permits) {
      case "issued":
        return guide
          ? `Issued and at our Kathmandu office. ${guide} collects them — nothing for you to do.`
          : "Issued and at our Kathmandu office. Your guide collects them — nothing for you to do.";
      case "problem":
        return "One came back from the permit office. We are sorting it out and will tell you if we need anything.";
      case "filed":
        return "Filed. We are waiting on the permit office.";
      default:
        return def.hint;
    }
  }
  // "Where to meet" is not a chore — it is the address, and it was agreed when
  // the trip was booked. Say it, rather than leaving an empty circle over a
  // hint that reads like homework.
  if (def.key === "confirmed") {
    const where = (state.meetingPoint ?? "").trim();
    if (where) {
      const when = [state.startsOn, state.meetingTime].filter(Boolean).join(", ");
      return when
        ? `Meet ${state.guideName ? `${state.guideName} ` : "your guide "}at ${where} — ${when}.`
        : `Meet ${state.guideName ? `${state.guideName} ` : "your guide "}at ${where}.`;
    }
    // Genuinely not settled yet. Then it IS waiting on somebody, and the
    // person it is waiting on is the guide, not the trekker.
    if (state.bookingStatus === "confirmed") {
      return "Your guide sends the address and the time before the day. Message them if you want it now.";
    }
  }

  // The step after a settled one becomes current the moment it settles, which
  // can be weeks before anybody walks. "Walking. Your guide checks in each
  // day." is not true yet.
  if (def.key === "active" && index === currentIndex && state.bookingStatus !== "active") {
    return `Everything is ready${state.startsOn ? ` for ${state.startsOn}` : ""}. Nothing left to do.`;
  }
  return def.hint;
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

  // Steps the booking's status genuinely cannot speak for.
  //
  // A booking sits at `confirmed` from the day the papers land until the day
  // the trip starts, so any step pinned to that status stays an open circle
  // for weeks after the thing it describes is finished — the permits issued
  // and in the office, the meeting place agreed at the moment of booking.
  // Both read as chores nobody has done, and neither has a button, because
  // there is nothing left to do.
  //
  // When the thing itself is settled the track moves on instead of waiting
  // for the calendar.
  const settled = settledSteps(state);
  while (
    !finished &&
    currentIndex < defs.length - 1 &&
    settled.has(defs[currentIndex].key)
  ) {
    currentIndex++;
  }

  const stages = defs.map((d, i) => {
    let stageState: StageState;
    if (stopped) stageState = i < currentIndex ? "done" : "stopped";
    else if (i < currentIndex || finished) stageState = "done";
    else if (i === currentIndex) stageState = "current";
    else stageState = "upcoming";
    return {
      key: d.key,
      label: d.label,
      hint: hintFor(d, i, currentIndex, state),
      state: stageState,
      // A settled step keeps explaining itself after it is ticked, because a
      // tick raises a question — who collects the permits, where do I meet —
      // that the line underneath has to answer.
      emphasis: settled.has(d.key) && stageState === "done",
    };
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
