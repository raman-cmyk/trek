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

export type DocState = "verified" | "rejected" | "pending";

export interface ReviewedDoc {
  verified_at?: string | null;
  rejected_at?: string | null;
  rejected_reason?: string | null;
}

export function docState(d: ReviewedDoc): DocState {
  if (d.verified_at) return "verified";
  if (d.rejected_at) return "rejected";
  return "pending";
}

/** What the trekker sees on their own trip page. */
export const STATE_LABEL: Record<DocState, string> = {
  verified: "verified",
  rejected: "needs redoing",
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
  return docs.filter((d) => !d.rejected_at);
}

/**
 * Is every document we are still counting verified?
 *
 * A booking with nothing uploaded, or with nothing left after the rejections,
 * is not settled — there is simply nothing to confirm against.
 */
export function docsSettled(docs: ReviewedDoc[]): boolean {
  const live = liveDocs(docs);
  return live.length > 0 && live.every((d) => !!d.verified_at);
}

/** The rejections a trekker still has to act on. */
export function outstanding<T extends ReviewedDoc>(docs: T[]): T[] {
  return docs.filter((d) => !!d.rejected_at);
}
