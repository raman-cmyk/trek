/**
 * Trip groups — the pure part.
 *
 * Everything here is arithmetic and state names, testable without a database,
 * because the thing that goes wrong with split payments is never the SQL. It
 * is a rounding remainder that leaves the trip 3¢ short and nobody able to say
 * whose 3¢ it was.
 */

export type PaymentMode = "organiser" | "split";
export type GroupStatus =
  | "forming"
  | "requested"
  | "accepted"
  | "ready"
  | "booked"
  | "cancelled";
export type MemberStatus = "invited" | "joined" | "declined" | "removed";

export interface GroupMember {
  id: string;
  user_id: string | null;
  invited_email: string | null;
  display_name: string;
  role: "organiser" | "member";
  status: MemberStatus;
  share_usd_cents: number;
  paid_usd_cents: number;
}

export interface TripGroup {
  id: string;
  slug: string;
  name: string;
  organiser_id: string;
  offering_id: string | null;
  guide_id: string | null;
  start_date: string | null;
  party_target: number;
  payment_mode: PaymentMode;
  status: GroupStatus;
  booking_id: string | null;
  note: string | null;
  /** The request the guide is answering (0065). */
  enquiry_id?: string | null;
  /** When the guide agreed. Until then, invites are locked. */
  guide_accepted_at?: string | null;
}

/**
 * The four steps of a group trip, in the order they actually happen.
 *
 * They used to happen in a different order on paper than in the code: the
 * page invited everybody and collected the money first and asked the guide
 * last, while the gate that let the organiser ask required every share to be
 * paid — money nobody could pay, because there was no booking to pay into.
 * One list, so the page, the buttons and the rules cannot disagree again.
 */
export type GroupStep = "plan" | "asking" | "roster" | "paying" | "done";

export const GROUP_STEPS: Array<{ key: GroupStep; label: string; blurb: string }> = [
  { key: "plan", label: "Pick the trip", blurb: "A trek, a guide, a date." },
  { key: "asking", label: "Ask the guide", blurb: "They say yes before anyone else is asked." },
  { key: "roster", label: "Invite the others", blurb: "Everyone signs in and joins." },
  { key: "paying", label: "Everyone pays", blurb: "Each person pays their own share." },
  { key: "done", label: "Going", blurb: "Booked." },
];

/** Where this group is now. */
export function groupStep(group: TripGroup, members: GroupMember[]): GroupStep {
  if (group.status === "booked") return "done";
  if (!guideHasAgreed(group)) {
    return group.status === "requested" ? "asking" : "plan";
  }
  const active = activeMembers(members);
  const everyoneHere =
    active.length >= group.party_target && active.every((m) => m.status === "joined");
  return everyoneHere ? "paying" : "roster";
}

/** Has the guide taken the trip? Set by the accept, or by a booking existing. */
export function guideHasAgreed(group: TripGroup): boolean {
  return Boolean(group.guide_accepted_at || group.booking_id);
}

/**
 * Why the organiser cannot ask the guide yet.
 *
 * Deliberately short: a trip, a guide, a date in the future, and a number of
 * seats. Not the roster, and certainly not the money — asking is free, and
 * asking is what unlocks everything after it.
 */
export function blockedFromAsking(group: TripGroup, members: GroupMember[]): string | null {
  if (group.status === "cancelled") return "This group was cancelled.";
  if (group.status === "booked") return "This group is already booked.";
  if (guideHasAgreed(group)) return null;
  if (group.status === "requested") return "Already asked — waiting on the guide.";
  if (!group.offering_id) return "Pick the trip first.";
  if (!group.guide_id) return "Pick the trip first.";
  if (!group.start_date) return "Pick a start date.";
  const today = new Date().toISOString().slice(0, 10);
  if (group.start_date <= today) return "Pick a start date in the future.";
  if (group.party_target < 1) return "Say how many of you are going.";
  if (activeMembers(members).length === 0) return "Nobody is in the group yet.";
  return null;
}

/**
 * Members who were invited by email and have never signed in.
 *
 * They cannot pay, cannot upload a passport and cannot be named on a permit,
 * so a trip cannot leave with one of them still in this state. It is also the
 * commonest way a group stalls: one person never opens the link.
 */
export function membersWithoutAccounts(members: GroupMember[]): GroupMember[] {
  return activeMembers(members).filter((m) => !m.user_id);
}

/** People who count for pricing and for the roster: invited or joined. */
export function activeMembers<T extends { status: MemberStatus }>(members: T[]): T[] {
  return members.filter((m) => m.status === "invited" || m.status === "joined");
}

/**
 * Split a total into n shares that sum back to the total exactly.
 *
 * $1,000.00 across three people is not three times $333.33 — that is a dollar
 * short, and on a real trip somebody would have to notice. The remainder goes
 * to the earliest members one cent at a time, so the split is deterministic
 * (same roster, same answer) and the difference is a cent rather than a
 * rounding policy nobody can explain.
 */
export function splitEvenly(totalUsdCents: number, n: number): number[] {
  if (n <= 0) return [];
  const total = Math.max(0, Math.round(totalUsdCents));
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * What each member owes.
 *
 * In organiser mode the organiser owes everything and everyone else owes
 * nothing — that is the whole point of the mode, and showing the others a
 * "$0 due" line is what tells them it is handled.
 */
export function assignShares(
  members: GroupMember[],
  totalUsdCents: number,
  mode: PaymentMode,
  organiserId: string,
): Map<string, number> {
  const active = activeMembers(members);
  const shares = new Map<string, number>();
  for (const m of members) shares.set(m.id, 0);

  if (mode === "organiser") {
    const organiser = active.find((m) => m.user_id === organiserId) ?? active[0];
    if (organiser) shares.set(organiser.id, Math.max(0, Math.round(totalUsdCents)));
    return shares;
  }

  const amounts = splitEvenly(totalUsdCents, active.length);
  active.forEach((m, i) => shares.set(m.id, amounts[i]));
  return shares;
}

export interface GroupMoney {
  totalUsdCents: number;
  paidUsdCents: number;
  outstandingUsdCents: number;
  /** Members whose share is not fully paid, in roster order. */
  owing: GroupMember[];
  /** 0–1, for the progress bar. 1 when there is nothing to pay. */
  progress: number;
  everyoneIn: boolean;
  /** Seats on a booked trip that nobody has claimed yet. */
  unclaimedSeats: number;
}

/**
 * @param tripTotalUsdCents The booked bill, when there is one. Without it the
 *   total is the sum of the shares that exist — which understates a booked
 *   trip whose other seats nobody has claimed yet. A trip booked for four at
 *   $129.60 costs $129.60 whether or not the other three have signed in, and
 *   showing "$0 of $32" makes it look like a different, cheaper trip.
 */
export function groupMoney(
  members: GroupMember[],
  tripTotalUsdCents?: number,
  seats?: number,
): GroupMoney {
  const active = activeMembers(members);
  const shareSum = active.reduce((n, m) => n + m.share_usd_cents, 0);
  const total = tripTotalUsdCents ?? shareSum;
  // A member cannot pay more than their share into the group's total — an
  // overpayment is a refund question, not a reason to show 103% collected.
  const paid = active.reduce((n, m) => n + Math.min(m.paid_usd_cents, m.share_usd_cents), 0);
  const owing = active.filter((m) => m.paid_usd_cents < m.share_usd_cents);
  return {
    totalUsdCents: total,
    paidUsdCents: paid,
    outstandingUsdCents: Math.max(0, total - paid),
    owing,
    progress: total === 0 ? 1 : Math.min(1, paid / total),
    // Everyone who is on the list has paid, AND every seat is on the list.
    // Without the second half a trip booked for four is "fully paid" the
    // moment its single member settles up.
    everyoneIn:
      owing.length === 0 && active.length > 0 && (seats ?? active.length) <= active.length,
    unclaimedSeats: Math.max(0, (seats ?? active.length) - active.length),
  };
}

/**
 * Can this group become a booking?
 *
 * Returns the reason it cannot, so the button can say why instead of being
 * mysteriously disabled — the thing that makes a group organiser email
 * support.
 */
export function blockedFromBooking(
  group: TripGroup,
  members: GroupMember[],
): string | null {
  if (group.status === "booked") return "This group is already booked.";
  if (group.status === "cancelled") return "This group was cancelled.";
  if (!group.offering_id) return "Pick the trip first.";
  if (!group.start_date) return "Pick a start date.";
  // The guide's yes comes before anything else is asked of anybody.
  if (!guideHasAgreed(group)) {
    return group.status === "requested"
      ? "Waiting on the guide to accept."
      : "Ask the guide first.";
  }
  const active = activeMembers(members);
  if (active.length < 1) return "Nobody has joined yet.";
  const joined = active.filter((m) => m.status === "joined");
  if (joined.length < active.length) {
    const waiting = active.length - joined.length;
    return `Waiting on ${waiting} ${waiting === 1 ? "person" : "people"} to accept.`;
  }
  const strangers = membersWithoutAccounts(members);
  if (strangers.length) {
    const n = strangers.length;
    return `${n === 1 ? `${strangers[0].display_name} has` : `${n} people have`} not signed in yet — everyone going needs an account of their own.`;
  }
  const money = groupMoney(members);
  if (!money.everyoneIn) {
    const n = money.owing.length;
    return group.payment_mode === "organiser"
      ? "Waiting on the deposit."
      : `Waiting on ${n} ${n === 1 ? "share" : "shares"}.`;
  }
  return null;
}

/**
 * A group's URL slug. Human-readable stem plus random tail: the page names
 * everyone who is going, so it must not be guessable from the trip name, and
 * a member who pastes the link into a chat should still see what it is.
 */
export function groupSlug(name: string, random: string): string {
  const stem = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 32)
    .replace(/-+$/, "");
  return `${stem || "trip"}-${random}`;
}

/** Random tail for a slug: no vowels, so it cannot accidentally spell one. */
export function slugTail(bytes: Uint8Array): string {
  const alphabet = "bcdfghjkmnpqrstvwxz23456789";
  return Array.from(bytes.slice(0, 8), (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * What to call a group on screen.
 *
 * A group carries a name of its own, and neither source of that name is much
 * use as a headline. One a trekker makes by hand is suggested as "<first
 * name>'s trip", so a list of them reads "Odonell's trip, Sarah's trip, Ben's
 * trip" with the actual trek in small grey type underneath — you cannot find
 * the Everest one by looking. One created automatically when a guide accepts
 * is named after the offering, so the card printed the same sentence twice.
 *
 * The trek leads. The group's own name follows it, and only when it says
 * something the trek has not already said.
 */
export function groupHeading(g: {
  name?: string | null;
  offeringTitle?: string | null;
}): { title: string; sub: string | null } {
  const name = (g.name ?? "").trim();
  const trek = (g.offeringTitle ?? "").trim();

  // No trek chosen yet: the group's own name is all there is to go on. What to
  // say about the missing trek is left to the page — the list says "No trek
  // picked yet", the group's own page can offer the guide instead.
  if (!trek) return { title: name || "Trip", sub: null };
  return { title: trek, sub: sameThing(name, trek) ? null : name || null };
}

/** Two labels that would read as a repetition rather than as two facts. */
function sameThing(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[’'`]/g, "'")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return norm(a) === norm(b);
}
