/**
 * Trek Journals — shared types and the pure display logic.
 *
 * A journal is the unit of proof: one completed trek, told by the guide who
 * led it. Everything here is deliberately dumb — consent and publication are
 * enforced in the database (migration 0032), not in this file, so a page that
 * forgets to check something cannot leak a client's name.
 */

export interface JournalPhoto {
  url: string;
  alt?: string;
  /** Is a client recognisable? Drives the consent filter in public_journal_entries. */
  people?: boolean;
}

export interface JournalEntry {
  id: string;
  day_no: number;
  title: string;
  body: string | null;
  altitude_m: number | null;
  is_hard_day: boolean;
  layout: "full" | "two" | "portrait";
  photos: JournalPhoto[];
}

export interface PublicJournal {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date: string;
  days: number;
  max_altitude_m: number | null;
  distance_km: number | null;
  pass_crossed: string | null;
  weather_note: string | null;
  cover_photo_url: string | null;
  guide_note: string | null;
  client_note: string | null;
  group_display: string | null;
  client_note_author: string | null;
  published_at: string | null;
  guide_id: string;
  guide_slug: string;
  guide_name: string;
  guide_avatar_url: string | null;
  guide_tier: number;
  guide_only_with_me: string | null;
  guide_district: string | null;
  route_id: string | null;
  route_slug: string | null;
  route_name: string | null;
  route_region: string | null;
}

export const JOURNAL_COLS =
  "id, slug, title, start_date, end_date, days, max_altitude_m, distance_km, pass_crossed, weather_note, cover_photo_url, guide_note, client_note, group_display, client_note_author, published_at, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_only_with_me, guide_district, route_id, route_slug, route_name, route_region";

/**
 * The one mono line under the cover:
 * "14 days · 5,106 m · Oct 12–26, 2025 · with Jef & Simon, BE"
 * Built in UTC so SSR and the client always agree.
 */
export function journalStatLine(j: PublicJournal): string {
  const bits: string[] = [`${j.days} days`];
  if (j.max_altitude_m) bits.push(`${j.max_altitude_m.toLocaleString("en-US")} m`);
  bits.push(journalDateRange(j.start_date, j.end_date));
  if (j.group_display) bits.push(`with ${j.group_display}`);
  return bits.join(" · ");
}

/** "Oct 12–26, 2025" / "Sep 28 – Oct 4, 2025". */
export function journalDateRange(startIso: string, endIso: string): string {
  const s = new Date(startIso + "T00:00:00Z");
  const e = new Date(endIso + "T00:00:00Z");
  const mon = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = e.getUTCFullYear();
  return s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === year
    ? `${mon(s)} ${s.getUTCDate()}–${e.getUTCDate()}, ${year}`
    : `${mon(s)} ${s.getUTCDate()} – ${mon(e)} ${e.getUTCDate()}, ${year}`;
}

/** "Oct 2025" — the short form used on journal cards. */
export function journalMonth(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** First sentence of the guide's closing note — the hook on a journal card. */
export function firstSentence(text: string | null, max = 130): string {
  if (!text) return "";
  const t = text.trim();
  const stop = t.search(/[.!?](\s|$)/);
  const s = stop > 0 ? t.slice(0, stop + 1) : t;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/**
 * Photo layouts rotate down the page so no two adjacent day blocks share a
 * grid shape (Not-AI doc: never repeat one grid down a page). The guide's own
 * choice wins; this only fills in when a block was left on the default.
 */
export type PhotoLayout = "full" | "two" | "three" | "portrait" | "pano";

export function layoutFor(entry: JournalEntry, index: number): PhotoLayout {
  const n = entry.photos.length;
  if (n === 0) return "full";
  if (n >= 3) return "three";
  if (n === 2) return "two";
  // One photo: alternate full-bleed, tall-with-text, and panorama so the page
  // never settles into a rhythm. Index-based, so it is stable across renders.
  const cycle: PhotoLayout[] = ["full", "portrait", "pano"];
  return entry.layout !== "full" ? (entry.layout as PhotoLayout) : cycle[index % cycle.length];
}

/**
 * Elevation profile points for the strip. Entries without an altitude are
 * skipped rather than interpolated — a made-up altitude on a page whose whole
 * job is "this really happened" is exactly the wrong kind of convenient.
 */
export function elevationPoints(entries: JournalEntry[]): { day: number; m: number }[] {
  return entries
    .filter((e) => e.altitude_m != null)
    .map((e) => ({ day: e.day_no, m: e.altitude_m! }))
    .sort((a, b) => a.day - b.day);
}


export interface JournalTag {
  kind: "season" | "difficulty" | "group" | "conditions" | "theme";
  value: string;
}

/** Human labels for the tag kinds, in the order they read best on a card. */
export const TAG_KIND_ORDER: JournalTag["kind"][] = [
  "conditions",
  "group",
  "theme",
  "season",
  "difficulty",
];

export function sortTags(tags: JournalTag[]): JournalTag[] {
  return [...tags].sort(
    (a, b) => TAG_KIND_ORDER.indexOf(a.kind) - TAG_KIND_ORDER.indexOf(b.kind),
  );
}

/**
 * The tag vocabulary. Closed on purpose: a free-text tag field gives you
 * "Autumn", "autumn", "Fall" and "post-monsoon" for the same week, and then
 * /journals?tag=… returns three of the four. Guides pick from this list; the
 * one thing they type freely is the journal itself.
 */
export const TAG_VOCAB: Record<JournalTag["kind"], { label: string; values: string[] }> = {
  season: {
    label: "Season",
    values: ["Spring", "Monsoon", "Autumn", "Winter"],
  },
  difficulty: {
    label: "How hard it was",
    values: ["Easy", "Moderate", "Hard", "Strenuous"],
  },
  group: {
    label: "Who was on it",
    values: ["Solo", "Couple", "Family", "Friends", "Small group", "Large group"],
  },
  conditions: {
    label: "Conditions",
    values: ["Clear", "Snow", "Windy", "Monsoon rain", "Cold snap", "Smoke haze"],
  },
  theme: {
    label: "What it was about",
    values: [
      "First-timer",
      "Altitude",
      "Photography",
      "Turned back",
      "Teahouse",
      "Camping",
      "Culture",
      "Off the trail",
      "Fast",
      "Slow and steady",
    ],
  },
};

/** The season a trek's start month falls in — the default season tag. */
export function seasonOf(iso: string): string {
  const m = Number(iso.slice(5, 7));
  if (m >= 3 && m <= 5) return "Spring";
  if (m >= 6 && m <= 8) return "Monsoon";
  if (m >= 9 && m <= 11) return "Autumn";
  return "Winter";
}
