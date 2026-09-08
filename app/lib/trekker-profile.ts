/**
 * What a guide is told about the person asking them to give up two weeks.
 *
 * The whole platform is "know who is walking with you", answered in one
 * direction only: a trekker reads a guide's page, their reviews, their routes
 * and their voice, and the guide gets a first name and a country code. A guide
 * accepting a request is making the larger commitment of the two.
 *
 * Everything here is arithmetic over rows that already exist — bookings, and
 * the guide_to_trekker reviews /g/bookings has been writing since 0006 and
 * nothing has ever read.
 */

export type TrekExperience = "first" | "some" | "lots" | "expert";

export const EXPERIENCE_LABELS: Record<TrekExperience, string> = {
  first: "First time trekking",
  some: "A few treks",
  lots: "Many treks",
  expert: "Very experienced — technical ground too",
};

export const EXPERIENCE_ORDER: TrekExperience[] = ["first", "some", "lots", "expert"];

/**
 * What a guide is asked about a trekker, in a guide's words.
 *
 * The keys are the ones /g/bookings has always written; only the labels are
 * new, because until now nothing displayed them.
 */
export const TREKKER_SUB_RATINGS: Array<{ key: string; label: string; blurb: string }> = [
  {
    key: "fitness_honesty",
    label: "Said what they could do",
    blurb: "Their fitness and experience were as described.",
  },
  {
    key: "punctuality",
    label: "Ready on time",
    blurb: "Up, packed and walking when it was agreed.",
  },
  {
    key: "respect",
    label: "Good to travel with",
    blurb: "With the guide, the porters and the teahouses.",
  },
];

export interface TrekkerReview {
  id: string;
  overall: number;
  body: string | null;
  sub_ratings: Record<string, number> | null;
  published_at: string | null;
  /** The guide who wrote it. */
  author_name: string | null;
  author_slug: string | null;
  /** The trek it was written about. */
  trip_title: string | null;
  trip_date: string | null;
}

export interface CompletedTrek {
  bookingId: string;
  title: string;
  routeName: string | null;
  region: string | null;
  days: number;
  startDate: string;
  guideName: string | null;
  guideSlug: string | null;
  partySize: number;
}

export interface TrekkerRating {
  /** Mean of the overall scores, or null when nobody has rated them yet. */
  average: number | null;
  count: number;
  /** Mean per sub-rating, keyed as the reviews store them. */
  subAverages: Record<string, number>;
}

function mean(xs: number[]): number | null {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
}

export function rateTrekker(reviews: TrekkerReview[]): TrekkerRating {
  const published = reviews.filter((r) => r.published_at);
  const subAverages: Record<string, number> = {};
  for (const { key } of TREKKER_SUB_RATINGS) {
    const scores = published
      .map((r) => r.sub_ratings?.[key])
      .filter((n): n is number => typeof n === "number");
    const m = mean(scores);
    if (m !== null) subAverages[key] = m;
  }
  return {
    average: mean(published.map((r) => r.overall)),
    count: published.length,
    subAverages,
  };
}

/**
 * The one line at the top of the profile.
 *
 * Days walked rather than treks counted: somebody with one Manaslu circuit
 * behind them has more mountain in them than somebody with four day hikes,
 * and a guide reads the difference instantly.
 */
export function trekkerSummary(treks: CompletedTrek[]): {
  treks: number;
  days: number;
  regions: string[];
  highestSeason: string | null;
} {
  const regions = [...new Set(treks.map((t) => t.region).filter((r): r is string => !!r))].sort();
  return {
    treks: treks.length,
    days: treks.reduce((n, t) => n + Math.max(1, t.days), 0),
    regions,
    highestSeason: treks.length ? (treks[0]?.startDate?.slice(0, 4) ?? null) : null,
  };
}

/** Would a guide reading this see anything at all? */
export function profileIsEmpty(
  treks: CompletedTrek[],
  rating: TrekkerRating,
  about: { about_me?: string | null; trek_experience?: string | null } | null,
): boolean {
  return (
    treks.length === 0 &&
    rating.count === 0 &&
    !about?.about_me &&
    !about?.trek_experience
  );
}
