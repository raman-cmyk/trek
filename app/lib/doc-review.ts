/**
 * Checking a trekker's papers, and saying no to them.
 *
 * Ops had one verb — verify — so a blurry passport scan or a policy with no
 * helicopter cover had no ending. The document sat unverified, the trekker's
 * page said "checking" indefinitely, and whether anybody had told them was a
 * matter of whether somebody remembered to send a message.
 *
 * A rejection is only useful if it reaches the person who can fix it and says
 * what to fix, so the reason is required everywhere — here, in the form, and
 * in the database (0073).
 */

export type DocState = "verified" | "rejected" | "superseded" | "pending";

export interface ReviewedDoc {
  verified_at?: string | null;
  rejected_at?: string | null;
  rejected_reason?: string | null;
  /** Replaced by a newer copy of the same document (0101). Not a rejection. */
  superseded_at?: string | null;
}

export function docState(d: ReviewedDoc): DocState {
  // Replacement first: a superseded row keeps whatever verdict it had, and
  // showing a trekker "verified" against a scan that is no longer the one we
  // hold is how two people end up talking about different passports.
  if (d.superseded_at) return "superseded";
  if (d.verified_at) return "verified";
  if (d.rejected_at) return "rejected";
  return "pending";
}

/** What the trekker sees on their own trip page. */
export const STATE_LABEL: Record<DocState, string> = {
  verified: "verified",
  rejected: "needs redoing",
  superseded: "replaced",
  pending: "checking",
};

const MIN_REASON = 3;
const MAX_REASON = 600;

/**
 * Why this cannot be sent yet, or null.
 *
 * "Rejected" with an empty box is the failure worth designing against: it
 * tells the trekker their document is wrong and gives them no way to be right.
 */
export function rejectionProblem(reason: string): string | null {
  const text = reason.trim();
  if (text.length < MIN_REASON) {
    return "Say what is wrong with it — the trekker sees this and has to be able to fix it.";
  }
  if (text.length > MAX_REASON) {
    return `Keep it under ${MAX_REASON} characters.`;
  }
  return null;
}

/** Trimmed and capped, ready to store. */
export function cleanReason(reason: string): string {
  return reason.trim().slice(0, MAX_REASON);
}

/**
 * The documents that still count.
 *
 * A rejected document is superseded by whatever the trekker uploads next — and
 * an upload inserts a new row rather than replacing the old one — so a
 * rejection left in the list would block the booking from ever confirming,
 * which is the opposite of what rejecting one is for.
 */
export function liveDocs<T extends ReviewedDoc>(docs: T[]): T[] {
  return docs.filter((d) => !d.rejected_at && !d.superseded_at);
}

/**
 * `docsSettled` used to live here, and it was wrong.
 *
 * It asked `live.length > 0 && live.every(verified)` — which never looked at
 * the document TYPE and never looked at how many people were going, so one
 * verified passport and no insurance at all confirmed a booking for six and
 * fired the permit trigger. The rule now needs the roster (0099), so it lives
 * in `~/lib/travellers` as `documentsComplete`. It is gone from here rather
 * than deprecated here: the old answer is not a fallback, it is a hole.
 */

/**
 * The rejections a trekker still has to act on.
 *
 * A replaced document is not one of them — nobody said no to it, and telling
 * somebody their passport needs redoing because they sent us a better scan of
 * it is the bug 0101 exists to prevent.
 */
export function outstanding<T extends ReviewedDoc>(docs: T[]): T[] {
  return docs.filter((d) => !!d.rejected_at && !d.superseded_at);
}
