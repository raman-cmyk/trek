/**
 * The one list on a guide's home screen.
 *
 * The founder, looking at it on a phone: *"Your experiences → Your journeys →
 * Booked trips → Block dates → Your money → Reviews → these areas look
 * confusing as hell to the guide, need to simplify this to the max so they
 * have nooo problem using this."*
 *
 * He is right, and the reason is not the styling. Home had five things
 * competing to be the list: a 2×3 grid of six nouns with arrows, a full-width
 * card for questions, another for writing up a trek, and a pair of stat tiles
 * that linked to two of the six again. Six labels, four shapes, three of them
 * pointing at the same two screens.
 *
 * Two of the labels were actively misleading. "Your experiences" is the trips
 * a guide offers; "Booked trips" is the trips they are leading — and neither
 * phrase says which is which to somebody reading English as a third language.
 * They are "Trips you offer" and "Trips you're leading" now, and nothing else
 * on the screen competes with them.
 *
 * This is the whole list, as data, so the screen cannot drift out of step
 * with it again: the six links used to be six hand-written `<Link>` elements
 * with their hrefs typed into the JSX.
 */

import { copy } from "~/lib/copy";

export interface HomeRow {
  key: string;
  to: string;
  label: string;
  note: string;
  /** A number worth a badge, or null. Zero is not worth one. */
  badge: number | null;
  /** The one row that is the point of the product, drawn loud. */
  loud?: boolean;
}

export interface HomeCounts {
  /** Live listings. Zero means this guide is not shown on the site at all. */
  offerings: number;
  /** Trips ahead of them, already paid for. */
  upcoming: number;
  /** People waiting on a public answer. */
  questions: number;
  /** Reviews nobody has replied to. */
  unrepliedReviews: number;
}

const c = copy.guide.home;

/**
 * The rows, in the order a guide works through a day: what they sell, when
 * they are free, who is coming, who is waiting, what they are owed, what was
 * said about them, and — last and loudest — the thing that wins the next one.
 */
export function homeRows(counts: HomeCounts): HomeRow[] {
  return [
    {
      key: "offer",
      to: "/g/experiences",
      label: c.offerLabel,
      note: c.offerNote,
      badge: null,
    },
    {
      key: "calendar",
      to: "/g/calendar",
      label: c.calendarLabel,
      note: c.calendarNote,
      badge: null,
    },
    {
      key: "leading",
      to: "/g/bookings",
      label: c.leadingLabel,
      note: c.leadingNote,
      badge: pos(counts.upcoming),
    },
    {
      key: "questions",
      to: "/g/questions",
      label: c.questionsLabel,
      note: c.questionsNote,
      badge: pos(counts.questions),
    },
    {
      key: "money",
      to: "/g/earnings",
      label: c.moneyLabel,
      note: c.moneyNote,
      badge: null,
    },
    {
      key: "reviews",
      to: "/g/reviews",
      label: c.reviewsLabel,
      note: c.reviewsNote,
      badge: pos(counts.unrepliedReviews),
    },
    {
      key: "writeup",
      to: "/g/journals",
      label: c.writeUpLabel,
      note: c.writeUpNote,
      badge: null,
      loud: true,
    },
  ];
}

/**
 * Whether the trips-you-offer row should be shouting.
 *
 * A guide with no live listing is not on the site — `public_guides` requires
 * one (migration 0110). It is the single most useful thing that screen can
 * say, and it is the only reason to raise a voice on a list of links.
 */
export function mustListATrip(counts: HomeCounts): boolean {
  return counts.offerings === 0;
}

/** Badges are for numbers somebody is waiting behind. Zero is not news. */
function pos(n: number | null | undefined): number | null {
  return n && n > 0 ? n : null;
}
