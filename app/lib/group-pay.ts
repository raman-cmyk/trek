import { activeMembers, splitEvenly, type GroupMember, type PaymentMode } from "~/lib/groups";

/**
 * Each person paying their own share.
 *
 * The database has been ready for this since 0039 — a share per member, a
 * member on every payment, a 'share' payment type — and nothing ever wrote to
 * any of it. Checkout was scoped to the booking's trekker, so only the
 * organiser could pay and the other five were told to settle up with them,
 * which is the errand a group feature exists to delete.
 *
 * Two amounts matter and they are different: the DEPOSIT share, which is what
 * a person owes today to hold the dates, and the TRIP share, which is what
 * they owe by the end. Confusing the two is how somebody pays 20% and thinks
 * they are done.
 */

/** What each member owes of the deposit, keyed by member id. */
export function depositShares(
  depositUsdCents: number,
  members: GroupMember[],
  mode: PaymentMode,
  organiserId: string,
): Map<string, number> {
  const active = activeMembers(members);
  const out = new Map<string, number>();
  for (const m of members) out.set(m.id, 0);
  if (active.length === 0) return out;

  if (mode === "organiser") {
    const organiser = active.find((m) => m.user_id === organiserId) ?? active[0];
    out.set(organiser.id, Math.max(0, Math.round(depositUsdCents)));
    return out;
  }

  // Same remainder rule as the trip total: the odd cent goes to the earliest
  // members, so the shares add back to the deposit exactly and two people
  // never both believe the other owes the extra cent.
  const amounts = splitEvenly(Math.max(0, Math.round(depositUsdCents)), active.length);
  active.forEach((m, i) => out.set(m.id, amounts[i]));
  return out;
}

/** Succeeded money in, against this booking, whoever paid it. */
export function collected(
  payments: Array<{ type: string; amount_usd_cents: number; status: string }>,
): number {
  return payments
    .filter((p) => p.status === "succeeded" && p.type !== "refund")
    .reduce((n, p) => n + p.amount_usd_cents, 0);
}

/** Is the deposit fully in, from however many people it took? */
export function depositIsCovered(
  payments: Array<{ type: string; amount_usd_cents: number; status: string }>,
  depositUsdCents: number,
): boolean {
  return collected(payments) >= depositUsdCents && depositUsdCents > 0;
}

export interface ShareState {
  /** What this person owes today. */
  dueUsdCents: number;
  /** What they have already put in. */
  paidUsdCents: number;
  /** Still to pay today. */
  outstandingUsdCents: number;
  /** Their share of the whole trip, for the sentence that follows. */
  tripShareUsdCents: number;
}

export function shareState(
  member: GroupMember | null | undefined,
  depositShare: number,
): ShareState {
  const paid = Math.max(0, member?.paid_usd_cents ?? 0);
  return {
    dueUsdCents: depositShare,
    paidUsdCents: paid,
    outstandingUsdCents: Math.max(0, depositShare - paid),
    tripShareUsdCents: member?.share_usd_cents ?? 0,
  };
}

/**
 * Who the group is still waiting for.
 *
 * The organiser's most useful sentence, and the reason to show it by name:
 * "waiting on 2 shares" makes everybody assume it is somebody else.
 */
export function stillOwing(
  members: GroupMember[],
  shares: Map<string, number>,
): GroupMember[] {
  return activeMembers(members).filter(
    (m) => m.paid_usd_cents < (shares.get(m.id) ?? 0),
  );
}
