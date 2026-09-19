import { activityLevel, transportLabels } from "~/lib/offering-details";

/**
 * The row of plain facts directly under the guide.
 *
 * Every page a trekker in Berlin compares us with puts one here — Viator's is
 * "4 to 10 hours · Pickup offered · Group discounts · Mobile ticket · Offered
 * in English" — and it is the first thing read after the photographs. Ours
 * carried the same facts, but scattered: the meeting point two screens down,
 * how hard it is in "Other details" at the very bottom, the languages beside
 * it, and the party size only inside the booking widget.
 *
 * The rule this module exists to enforce is that **we only claim what we
 * hold**. Viator's row includes "Mobile ticket" and there is no ticket on this
 * platform — a tick beside it would be a small lie of exactly the kind
 * app/lib/standards.ts was written to stop, and it is not here. Anything the
 * trip has not filled in drops out of the row rather than rendering as a
 * hopeful blank or a default.
 *
 * Pure, so the row cannot drift from what the page says further down: both
 * read the same offering columns through the same helpers.
 */

export interface FactSource {
  kind?: string | null;
  days?: number | null;
  /** "08:30:00" out of Postgres. */
  meet_time?: string | null;
  meeting_point?: string | null;
  transport?: readonly string[] | null;
  activity_level?: string | null;
  min_party?: number | null;
  max_party?: number | null;
}

export interface TripFact {
  key: string;
  /** The headline — short enough to read at a glance. */
  label: string;
  /** The detail under it, where there is one worth the line. */
  hint?: string;
}

/**
 * "08:30:00" → "8:30 am".
 *
 * A 4:30 start is the single most consequential fact about a sunrise hike and
 * it was on no page. Twelve-hour, because the trips that have one are day
 * trips and the reader is a tourist, not a timetable.
 */
export function meetTimeLabel(raw: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return null;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

/** "How long" in the words the trip's own shape deserves. */
export function durationLabel(days: number | null | undefined): string | null {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return null;
  return d === 1 ? "One day" : `${d} days`;
}

/**
 * What the party size means to somebody reading it.
 *
 * "max_party 8" is a database column. "Never more than 8 of you" is the fact,
 * and a trip that can only be walked alone or only in a pair is a different
 * fact again — the kind somebody finds out at the payment screen otherwise.
 */
export function partyLabel(
  min: number | null | undefined,
  max: number | null | undefined,
): { label: string; hint?: string } | null {
  const lo = Number(min);
  const hi = Number(max);
  const hasHi = Number.isFinite(hi) && hi > 0;
  const hasLo = Number.isFinite(lo) && lo > 0;
  if (!hasHi && !hasLo) return null;
  if (hasHi && hi === 1) return { label: "Just you", hint: "This trip runs one at a time." };
  if (!hasHi) return { label: `${lo} people minimum` };
  const label = `Up to ${hi} people`;
  // A minimum above one is the thing that stops a trip running, so it is said
  // here rather than discovered when the request is declined.
  return hasLo && lo > 1 ? { label, hint: `Needs at least ${lo} to run` } : { label };
}

/**
 * Every fact this trip can honestly show, in reading order.
 *
 * `languages` comes in resolved rather than raw, because the trip's own list
 * is empty on all fifty-seven and the real answer is the guide's — which is a
 * decision `tripLanguages` already owns and this module has no business
 * repeating.
 */
export function tripFacts(
  o: FactSource,
  opts: {
    languages?: readonly string[];
    /** True when the per-person price actually falls as the party grows. */
    groupPriceDrops?: boolean;
    /** Days before departure a booking can still be cancelled for nothing. */
    freeCancellationDays?: number | null;
  } = {},
): TripFact[] {
  const out: TripFact[] = [];

  const duration = durationLabel(o.days);
  if (duration) {
    const start = meetTimeLabel(o.meet_time);
    out.push({ key: "duration", label: duration, hint: start ? `Starts ${start}` : undefined });
  }

  if (o.meeting_point?.trim()) {
    out.push({ key: "meeting_point", label: `Meet at ${o.meeting_point.trim()}` });
  }

  const transport = transportLabels(o.transport);
  if (transport.length > 0) {
    // The labels are capitalised for the pills further down the page, where
    // each stands alone. Joined into a sentence they read "Domestic flight
    // and On foot", so the tail of the list is lowered.
    out.push({ key: "transport", label: `Travel by ${sentenceList(transport.map(lower))}` });
  }

  const party = partyLabel(o.min_party, o.max_party);
  if (party) out.push({ key: "party", label: party.label, hint: party.hint });

  if (opts.groupPriceDrops) {
    out.push({
      key: "group_price",
      label: "Cheaper with more of you",
      hint: "The guide's fee is split across the party.",
    });
  }

  const langs = (opts.languages ?? []).filter(Boolean);
  if (langs.length > 0) {
    out.push({ key: "languages", label: `Guided in ${sentenceList(langs)}` });
  }

  const level = activityLevel(o.activity_level);
  if (level) out.push({ key: "activity", label: level.label, hint: level.blurb });

  const cancel = Number(opts.freeCancellationDays);
  if (Number.isFinite(cancel) && cancel > 0) {
    out.push({
      key: "cancellation",
      label: "Free cancellation",
      hint: `Up to ${cancel} days before you go.`,
    });
  }

  return out;
}

/** "Domestic flight" → "domestic flight". Nothing here is a proper noun. */
function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** "Flight, jeep and on foot" — a list a person would say out loud. */
export function sentenceList(items: readonly string[]): string {
  const list = items.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Why travellers loved this — the rating, and the reviews worth quoting here.
 *
 * Longest first rather than newest: this block is two quotations under a
 * number, and a two-word review under a 4.9 argues against the 4.9. The full
 * list stays further down the page in the order it was written, so nothing is
 * hidden — this only decides which two come up beside the guide.
 */
export function lovedFor<
  T extends { body: string | null; overall: number; published_at: string | null },
>(
  reviews: readonly T[] | null | undefined,
  limit = 2,
): T[] {
  return [...(reviews ?? [])]
    .filter((r) => (r.body ?? "").trim().length >= 40)
    .sort(
      (a, b) =>
        b.overall - a.overall ||
        (b.body ?? "").length - (a.body ?? "").length ||
        Date.parse(b.published_at ?? "") - Date.parse(a.published_at ?? ""),
    )
    .slice(0, limit);
}
