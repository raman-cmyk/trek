/**
 * "When are you planning your Nepal trip?"
 *
 * Asked once, early, of a stranger. The whole design problem is that most
 * people cannot answer it — and a form that only accepts an answer they do
 * not have is a form they close.
 *
 * So there are three honest answers, and all three are first-class:
 *
 *   dates   — they know. Take the dates, show them who is free.
 *   season  — they know roughly: "autumn", "next spring". Take the season.
 *   unsure  — they genuinely do not know, and pretending otherwise to get
 *             past a popup gives us a date we will act on and they will not.
 *             "I'm just looking" is real data, not a failure to convert.
 *
 * Everything here is pure. The window a season maps to is a fact about Nepal
 * and gets tested rather than typed into a component.
 */

export type IntentMode = "dates" | "season" | "unsure";

export const INTENT_MODES: IntentMode[] = ["dates", "season", "unsure"];

export function isIntentMode(v: unknown): v is IntentMode {
  return typeof v === "string" && (INTENT_MODES as string[]).includes(v);
}

export type SeasonKey = "spring" | "summer" | "autumn" | "winter";

export interface Season {
  key: SeasonKey;
  label: string;
  /** Months, 1-12, in the order they run. */
  months: number[];
  /** Why somebody would pick it — the part that actually helps them choose. */
  note: string;
}

/**
 * Nepal's trekking year, in the order a visitor meets it.
 *
 * Autumn first because it is the season most people mean and the one most of
 * the country is set up for — putting January first because it is month one
 * would front the hardest season with the shortest days.
 */
export const SEASONS: Season[] = [
  {
    key: "autumn",
    label: "Autumn",
    months: [9, 10, 11],
    note: "Clearest skies of the year. The busiest trails too.",
  },
  {
    key: "spring",
    label: "Spring",
    months: [3, 4, 5],
    note: "Rhododendron in flower, warm valleys, some afternoon haze.",
  },
  {
    key: "winter",
    label: "Winter",
    months: [12, 1, 2],
    note: "Cold and very quiet. Lower treks stay comfortable.",
  },
  {
    key: "summer",
    label: "Summer / monsoon",
    months: [6, 7, 8],
    note: "Rain in most of the country — but Mustang and Dolpo stay dry.",
  },
];

/** "Sep–Nov" — enough to recognise a season without reading a sentence. */
export function monthsLabel(season: Season): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const first = season.months[0];
  const last = season.months[season.months.length - 1];
  return `${names[first - 1]}–${names[last - 1]}`;
}

export function seasonByKey(key: string): Season | null {
  return SEASONS.find((s) => s.key === key) ?? null;
}

/**
 * The next time that season comes round, as a first and last date.
 *
 * "Autumn" asked in November means *this* autumn if there is any of it left,
 * and next year's if there is not. Anchored on a passed-in date so the
 * rollover is testable rather than a thing that only misbehaves in December.
 */
export function seasonWindow(
  key: SeasonKey,
  now: Date = new Date(),
): { start: string; end: string } | null {
  const season = seasonByKey(key);
  if (!season) return null;
  const y = now.getUTCFullYear();
  const first = season.months[0];
  const last = season.months[season.months.length - 1];
  // Winter wraps the new year: Dec of one year through Feb of the next.
  const wraps = last < first;

  for (const startYear of [y - 1, y, y + 1]) {
    const start = Date.UTC(startYear, first - 1, 1);
    const endYear = wraps ? startYear + 1 : startYear;
    // Day 0 of the following month is the last day of this one.
    const end = Date.UTC(endYear, last, 0);
    if (end >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
      return { start: iso(start), end: iso(end) };
    }
  }
  return null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface TripIntentDraft {
  mode: IntentMode;
  /** mode === "dates" */
  start?: string | null;
  end?: string | null;
  /** mode === "season" */
  season?: string | null;
  email: string;
  /** Straight off a form, so a string is as valid as a number here. */
  partySize?: number | string | null;
}

export interface IntentProblem {
  field: "email" | "dates" | "season" | "mode";
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * What is wrong with this, in the order a person would fix it.
 *
 * Returns every problem rather than the first, because a dialog that reveals
 * one fault at a time is a dialog people abandon on the second round.
 */
export function validateIntent(draft: TripIntentDraft): IntentProblem[] {
  const problems: IntentProblem[] = [];

  if (!isIntentMode(draft.mode)) {
    problems.push({ field: "mode", message: "Tell us roughly when." });
  }

  if (draft.mode === "dates") {
    if (!draft.start || !draft.end) {
      problems.push({ field: "dates", message: "Pick a start and an end date." });
    } else if (draft.end < draft.start) {
      problems.push({ field: "dates", message: "The end date is before the start." });
    }
  }

  if (draft.mode === "season" && !seasonByKey(draft.season ?? "")) {
    problems.push({ field: "season", message: "Pick a season." });
  }

  if (!EMAIL.test(normaliseEmail(draft.email))) {
    problems.push({ field: "email", message: "Enter an email we can reach you at." });
  }

  return problems;
}

/**
 * What we tell them we heard, in their words rather than ours.
 *
 * Read back before anything is saved. Somebody handing over an email wants to
 * see that the thing they picked was understood — and it is the cheapest way
 * to catch a mis-tap on a phone.
 */
export function intentSummary(draft: TripIntentDraft, now: Date = new Date()): string {
  if (draft.mode === "dates" && draft.start && draft.end) {
    return `Nepal, ${prettyRange(draft.start, draft.end)}`;
  }
  if (draft.mode === "season") {
    const season = seasonByKey(draft.season ?? "");
    if (season) {
      const w = seasonWindow(season.key, now);
      const year = w ? ` ${w.start.slice(0, 4)}` : "";
      return `Nepal, ${season.label.toLowerCase()}${year}`;
    }
  }
  return "Nepal, dates open";
}

/** "12–26 Oct 2026", or with both months when it straddles one. */
export function prettyRange(start: string, end: string): string {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${start} – ${end}`;
  const mon = (d: Date) =>
    d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const left = sameMonth ? `${a.getUTCDate()}` : `${a.getUTCDate()} ${mon(a)}`;
  return `${left}–${b.getUTCDate()} ${mon(b)} ${b.getUTCFullYear()}`;
}

/**
 * The window to search availability in, whatever they told us.
 *
 * One shape out of three different answers, so everything downstream — the
 * "who is free" query, the email, the guide's view of the lead — takes a
 * start and an end and does not care which button was pressed. "Unsure"
 * becomes the next six months, which is a guess, and is labelled as one
 * everywhere it is shown.
 */
export function intentWindow(
  draft: TripIntentDraft,
  now: Date = new Date(),
): { start: string; end: string; exact: boolean } {
  if (draft.mode === "dates" && draft.start && draft.end) {
    return { start: draft.start, end: draft.end, exact: true };
  }
  if (draft.mode === "season") {
    const w = seasonWindow((draft.season ?? "") as SeasonKey, now);
    if (w) return { ...w, exact: false };
  }
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, now.getUTCDate());
  return { start: iso(from), end: iso(to), exact: false };
}

/** Party size, clamped to something a guide can actually take. */
export function cleanPartySize(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(Math.round(n), 16);
}

/** Where to send them once we have the answer — browse, already filtered. */
export function browseHref(draft: TripIntentDraft, now: Date = new Date()): string {
  const w = intentWindow(draft, now);
  const params = new URLSearchParams({ from: w.start, to: w.end });
  return `/guides?${params.toString()}`;
}
