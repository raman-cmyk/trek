/**
 * Trip groups — the pure part.
 *
 * Everything here is arithmetic and state names, testable without a database,
 * because the thing that goes wrong with split payments is never the SQL. It
 * is a rounding remainder that leaves the trip 3¢ short and nobody able to say
 * whose 3¢ it was.
 */

export type PaymentMode = "organiser" | "split";
export type GroupStatus = "forming" | "ready" | "booked" | "cancelled";
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
}

export function groupMoney(members: GroupMember[]): GroupMoney {
  const active = activeMembers(members);
  const total = active.reduce((n, m) => n + m.share_usd_cents, 0);
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
    everyoneIn: owing.length === 0 && active.length > 0,
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
  const active = activeMembers(members);
  if (active.length < 1) return "Nobody has joined yet.";
  const joined = active.filter((m) => m.status === "joined");
  if (joined.length < active.length) {
    const waiting = active.length - joined.length;
    return `Waiting on ${waiting} ${waiting === 1 ? "person" : "people"} to accept.`;
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
