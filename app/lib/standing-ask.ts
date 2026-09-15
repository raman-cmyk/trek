import { isCancelledBooking } from "~/lib/ask-guard";

/**
 * What the booking widget should say about a request you have already made.
 *
 * "Request sent to Pemba. They have 48 hours to reply" came from the fetcher,
 * so it lived exactly as long as the tab did. Refresh, come back tomorrow to
 * check, open the page from the email — gone, and the button offering to send
 * a request is back, which reads as "it did not go through". The most anxious
 * moment in this whole product is the gap between asking a stranger in Nepal
 * for a fortnight of their life and hearing back, and the page was spending
 * that gap pretending nothing had happened.
 *
 * So the state comes from the database now. And because it does, it can also
 * say the thing that has never been said at all: what happened when the
 * answer was no.
 *
 * A decline is not an error and it is not the end. Guides say no because they
 * are already out on the mountain that fortnight. The useful response is the
 * one a human travel agent gives — "he can't do the 30th, here is what he
 * can do" — so the declined state keeps the guide, offers their other dates,
 * and only then offers other guides. Vanishing silently back to the form,
 * which is what happens today, teaches people that asking does nothing.
 */

export type AskState =
  | "none"
  | "waiting"
  | "accepted"
  | "booked"
  | "declined"
  | "expired";

export interface StandingAsk {
  status: string | null;
  startDate: string | null;
  expiresAt: string | null;
}

export interface AskNotice {
  state: AskState;
  /** How loudly to say it. */
  tone: "waiting" | "good" | "cool";
  text: string;
  /** Offer the calendar again — true whenever these dates are dead. */
  offerOtherDates: boolean;
  /** Offer other guides. Only when this guide has said no. */
  offerOtherGuides: boolean;
  /** Let them send a fresh request. */
  canAskAgain: boolean;
}

/**
 * Decide from the row, not from what just happened in the browser.
 *
 * `bookingStatus` wins every tie: "you have this booked" is more useful than
 * anything about the request that produced it, and a cancelled booking is not
 * a booking — the same rule ask-guard applies when deciding whether a new
 * request is a duplicate.
 */
export function askNotice(
  ask: StandingAsk | null,
  bookingStatus: string | null | undefined,
  guideName: string,
  now: Date = new Date(),
): AskNotice {
  const who = guideName || "your guide";

  if (bookingStatus && !isCancelledBooking(bookingStatus)) {
    return {
      state: "booked",
      tone: "good",
      text: `You already have this booked with ${who} for these dates — it is in My trips.`,
      offerOtherDates: false,
      offerOtherGuides: false,
      canAskAgain: false,
    };
  }

  const status = ask?.status ?? null;

  if (status === "open" || status === "quoted") {
    // An expiry that has passed but which nothing has swept yet. Saying "they
    // have until yesterday" is worse than saying nothing about the clock.
    const left = timeLeft(ask?.expiresAt ?? null, now);
    return {
      state: "waiting",
      tone: "waiting",
      text: left
        ? `Request sent to ${who}. ${left} to reply — it is in My trips until then, and we will email you.`
        : `Request sent to ${who}. It is in My trips until they answer, and we will email you.`,
      offerOtherDates: false,
      offerOtherGuides: false,
      canAskAgain: false,
    };
  }

  if (status === "accepted" || status === "converted") {
    return {
      state: "accepted",
      tone: "good",
      text: `${who} said yes. Finish it in My trips.`,
      offerOtherDates: false,
      offerOtherGuides: false,
      canAskAgain: false,
    };
  }

  if (status === "declined") {
    return {
      state: "declined",
      tone: "cool",
      // No reason is stored, so none is invented. "Cannot" rather than
      // "will not": guides decline because they are already on a mountain,
      // and the reader should not be left thinking they were turned down.
      text: `${who} can't take ${dateWords(ask?.startDate ?? null)}. Their open dates are on the calendar above — pick another and ask again.`,
      offerOtherDates: true,
      offerOtherGuides: true,
      canAskAgain: true,
    };
  }

  if (status === "expired") {
    return {
      state: "expired",
      tone: "cool",
      text: `${who} didn't answer in time, so ${dateWords(ask?.startDate ?? null)} is free again. You can ask once more, or try another date.`,
      offerOtherDates: true,
      offerOtherGuides: true,
      canAskAgain: true,
    };
  }

  // Withdrawn, or never asked. Nothing happened that is worth a notice — the
  // trekker cancelled it themselves and knows.
  return {
    state: "none",
    tone: "cool",
    text: "",
    offerOtherDates: false,
    offerOtherGuides: false,
    canAskAgain: true,
  };
}

/** "About 20 hours" / "About 40 minutes", or null once it has run out. */
export function timeLeft(expiresAt: string | null, now: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 90) return `About ${Math.max(1, mins)} ${mins === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `About ${hours} hours`;
  const days = Math.round(hours / 24);
  return `About ${days} days`;
}

/** "30 November" — the date said the way a person would say it. */
export function dateWords(iso: string | null): string {
  if (!iso) return "those dates";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "those dates";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
