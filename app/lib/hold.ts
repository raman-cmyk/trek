/**
 * The clock on a held booking.
 *
 * When a guide accepts, their calendar days are marked held and the trekker
 * has a window to pay the deposit. That window was real — `hold_expires_at`
 * is set at acceptance and a nightly sweep releases the days and cancels the
 * booking when it passes — but nothing on the checkout page said so. The
 * trekker saw a price and a button, and a booking could evaporate for a reason
 * they were never shown.
 *
 * Every competitor's checkout counts down. Pure, so the countdown, the copy
 * and the sweep cannot disagree about when the hold ends.
 */

import { DEPOSIT_HOLD_HOURS } from "./config";

export { DEPOSIT_HOLD_HOURS };

export type HoldState = "none" | "running" | "soon" | "expired";

export interface Hold {
  state: HoldState;
  /** Whole seconds left, floored at zero. */
  secondsLeft: number;
  /** "2:59:41" while hours remain, "9:41" inside the last hour. */
  clock: string;
  /** The sentence beside the clock. */
  words: string;
}

/** Inside this, the clock is urgent rather than informational. */
export const SOON_SECONDS = 30 * 60;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The clock, as a reader sees it.
 *
 * Hours are dropped inside the last hour: "9:41" is read instantly, "0:09:41"
 * has to be parsed. Nothing shows a negative.
 */
export function clockFor(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** How long the hold is, in the words the page uses. */
export function holdWindowWords(hours: number = DEPOSIT_HOLD_HOURS): string {
  if (hours === 1) return "one hour";
  if (hours < 24) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "24 hours" : `${days} days`;
}

/**
 * The hold on this booking right now.
 *
 * `expiresAt` null means there is no hold to show — a booking already paid, or
 * one that never had one. That is "none", not "expired": an absent clock and a
 * finished clock mean opposite things to a reader.
 */
export function holdStatus(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): Hold {
  if (!expiresAt) {
    return { state: "none", secondsLeft: 0, clock: "", words: "" };
  }
  const iso = expiresAt.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) {
    return { state: "none", secondsLeft: 0, clock: "", words: "" };
  }
  const secondsLeft = Math.max(0, Math.floor((end - now.getTime()) / 1000));

  if (secondsLeft === 0) {
    return {
      state: "expired",
      secondsLeft: 0,
      clock: clockFor(0),
      words: "Your hold has ended — these dates are open to other trekkers again.",
    };
  }
  return {
    state: secondsLeft <= SOON_SECONDS ? "soon" : "running",
    secondsLeft,
    clock: clockFor(secondsLeft),
    words: "Holding your dates",
  };
}

/**
 * What the reader should do about it.
 *
 * The expired case is the one that matters: the honest answer is not "too
 * late", it is that the days went back on the guide's calendar and a message
 * is the way back in.
 */
export function holdAdvice(state: HoldState, guideFirstName: string): string | null {
  if (state === "expired") {
    return `Message ${guideFirstName} — if the days are still free they can hold them again.`;
  }
  if (state === "soon") {
    return "Pay now, or the dates go back on the calendar.";
  }
  if (state === "running") {
    return `Nobody else can book these days while the clock runs. Nothing is charged until you pay.`;
  }
  return null;
}
