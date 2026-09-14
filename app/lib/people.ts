/**
 * Deleting a person — the part with no database in it.
 *
 * `ops_delete_person` (migration 0059) either removes somebody or refuses
 * with counts. Turning that into the one sentence the office reads, and
 * deciding which rows in the People list may offer a delete button at all,
 * lives here so it can be tested without a connection.
 */

export type DeletePersonResult =
  | { ok: true; name: string; role: string }
  | { ok: false; reason: "not_found" }
  | {
      ok: false;
      reason: "has_history";
      name: string;
      role: string;
      bookings: number;
      payouts: number;
      contracts: number;
    };

/** Coerce whatever the RPC returned into a result we can reason about. */
export function parseDeleteResult(raw: unknown): DeletePersonResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.ok === true) {
    return { ok: true, name: String(r.name ?? ""), role: String(r.role ?? "") };
  }
  if (r.reason === "has_history") {
    return {
      ok: false,
      reason: "has_history",
      name: String(r.name ?? ""),
      role: String(r.role ?? ""),
      bookings: Number(r.bookings ?? 0),
      payouts: Number(r.payouts ?? 0),
      contracts: Number(r.contracts ?? 0),
    };
  }
  return { ok: false, reason: "not_found" };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Why somebody cannot be deleted, in words the office can act on. A guide
 * with trips is set to "removed" instead; a trekker with trips stays, because
 * their bookings are the record of money that moved.
 */
export function describeDeletionBlock(
  r: Extract<DeletePersonResult, { reason: "has_history" }>,
): string {
  const parts: string[] = [];
  if (r.bookings > 0) parts.push(plural(r.bookings, "trip"));
  if (r.payouts > 0) parts.push(plural(r.payouts, "payout"));
  if (r.contracts > 0) parts.push(plural(r.contracts, "contract"));
  const has = parts.length ? parts.join(", ") : "history";
  const advice =
    r.role === "guide"
      ? "Set their status to removed or suspended instead."
      : "Their trips are the record of money that moved, so they stay.";
  return `${r.name} can't be deleted — they have ${has} on the books. ${advice}`;
}

/** What the People list shows next to somebody who cannot be deleted. */
export function whyNotDeletable(opts: { isSelf: boolean; trips: number }): string | null {
  if (opts.isSelf) return "That's you";
  if (opts.trips > 0) return "Has trips";
  return null;
}
