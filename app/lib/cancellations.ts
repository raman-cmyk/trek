/**
 * Telling people a trip is off.
 *
 * A cancellation has three audiences and they need three different sentences.
 * The trekker knows — they pressed it. The guide has just lost a fortnight's
 * work and needs to know who cancelled, how close to the start, and whether
 * anything is still owed to them. The office needs to know it happened at all.
 *
 * Pure, so the wording can be tested and so the same row cannot be described
 * one way in an email and another way on a dashboard.
 */

export type CancelReason = "trekker" | "guide" | "force_majeure" | "nonpayment";

/** The booking status each reason lands on. */
export const CANCEL_STATUS: Record<CancelReason, string> = {
  trekker: "cancelled_trekker",
  guide: "cancelled_guide",
  force_majeure: "cancelled_force_majeure",
  nonpayment: "cancelled_trekker",
};

export function reasonFromStatus(status: string): CancelReason | null {
  if (status === "cancelled_guide") return "guide";
  if (status === "cancelled_force_majeure") return "force_majeure";
  if (status === "cancelled_trekker") return "trekker";
  return null;
}

export function isCancelled(status: string | null | undefined): boolean {
  return !!status && status.startsWith("cancelled");
}

export interface CancelledTrip {
  id: string;
  status: string;
  startDate: string;
  cancelledAt: string | null;
  guideSawAt: string | null;
  trekkerName: string;
  title: string;
  partySize: number;
  /** What the guide is still owed, if the bands left them anything. */
  guideKeepsUsdCents: number;
}

/**
 * The cancellations a guide has not been shown yet, newest first.
 *
 * Unseen rather than recent: a guide who does not open the app for a week
 * must still be told, and one who read it this morning must not be told twice.
 */
export function unseenByGuide(trips: CancelledTrip[]): CancelledTrip[] {
  return trips
    .filter((t) => isCancelled(t.status) && !t.guideSawAt)
    .sort((a, b) => (b.cancelledAt ?? "").localeCompare(a.cancelledAt ?? ""));
}

/**
 * How many days out the trip was when it was called off. Null if unknown.
 *
 * Calendar days between the two dates, not hours between two instants: this
 * has to agree with the number the refund bands used, or the guide is told
 * "18 days" beside a refund the rules worked out for 19. Cancelling on the
 * morning of the start is nought days, not minus one.
 */
export function noticeDays(t: CancelledTrip): number | null {
  if (!t.cancelledAt) return null;
  const on = t.cancelledAt.slice(0, 10);
  const start = Date.parse(`${t.startDate}T00:00:00Z`);
  const at = Date.parse(`${on}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(at)) return null;
  return Math.round((start - at) / 86_400_000);
}

/**
 * What the guide reads. Who cancelled comes first, because that is the thing
 * they will want to know before anything else.
 */
export function guideHeadline(t: CancelledTrip): string {
  const reason = reasonFromStatus(t.status);
  if (reason === "force_majeure") return `${t.title} was called off`;
  if (reason === "guide") return `You cancelled ${t.title}`;
  return `${t.trekkerName} cancelled ${t.title}`;
}

export function guideDetail(
  t: CancelledTrip,
  fmtDate: (iso: string) => string,
  fmtNpr: (paisa: number) => string,
  fxRateNpr: number,
): string {
  const days = noticeDays(t);
  const when =
    days === null
      ? `It was due to start ${fmtDate(t.startDate)}.`
      : days <= 0
        ? `It was due to start ${fmtDate(t.startDate)} — the day had come.`
        : `That was ${days} ${days === 1 ? "day" : "days"} before the start on ${fmtDate(t.startDate)}.`;
  const money =
    t.guideKeepsUsdCents > 0
      ? ` You keep ${fmtNpr(Math.round(t.guideKeepsUsdCents * fxRateNpr))} of it — it will appear in your payouts.`
      : " Nothing is owed on it.";
  return `${when} Those days are open on your calendar again.${money}`;
}

/** One line for the office: what happened, to whom, how much notice. */
export function opsLine(t: CancelledTrip, fmtDate: (iso: string) => string): string {
  const reason = reasonFromStatus(t.status) ?? "trekker";
  const who =
    reason === "guide"
      ? "the guide"
      : reason === "force_majeure"
        ? "the office"
        : t.trekkerName;
  const days = noticeDays(t);
  const notice = days === null ? "" : ` · ${days} days' notice`;
  return `${t.title}, ${fmtDate(t.startDate)} — cancelled by ${who}${notice}`;
}

/** The subject line the office gets by email. */
export function opsSubject(t: Pick<CancelledTrip, "title" | "startDate">): string {
  return `Cancelled: ${t.title}, ${t.startDate}`;
}
