/**
 * The ordinary facts about a trip, and the words for them.
 *
 * Measured against the pages a trekker in Berlin compares us with, our trip
 * page was missing a whole tier of fact: how you move, how hard it is, what
 * your guide will speak on the day, whether somebody with a bad knee can
 * come, a reference to quote in an email, and the questions everybody asks.
 *
 * Codes live in the database (0066) so they stay filterable; the words live
 * here so a copywriter can change "Private vehicle" without a migration. Pure,
 * so the guide's form, the office's form and the public page cannot disagree
 * about what a valid trip says about itself.
 */

// ---------------------------------------------------------------------------
// How hard it is
// ---------------------------------------------------------------------------

export const ACTIVITY_LEVELS = [
  {
    key: "easy",
    label: "Easy",
    blurb: "Short distances on flat ground, with stops. Most people manage it.",
  },
  {
    key: "moderate",
    label: "Moderate",
    blurb: "A few hours walking, some hills. You should be comfortable on your feet.",
  },
  {
    key: "challenging",
    label: "Challenging",
    blurb: "Long days, real ascent, or altitude. Train for it.",
  },
  {
    key: "strenuous",
    label: "Strenuous",
    blurb: "Very long days, high passes, or technical ground. Experience expected.",
  },
] as const;

export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]["key"];

export function activityLevel(raw: string | null | undefined) {
  return ACTIVITY_LEVELS.find((l) => l.key === raw) ?? null;
}

// ---------------------------------------------------------------------------
// How you move
// ---------------------------------------------------------------------------

export const TRANSPORT = [
  { key: "walking", label: "On foot" },
  { key: "private_vehicle", label: "Private vehicle" },
  { key: "shared_jeep", label: "Shared jeep" },
  { key: "domestic_flight", label: "Domestic flight" },
  { key: "tourist_bus", label: "Tourist bus" },
  { key: "local_bus", label: "Local bus" },
  { key: "boat", label: "Boat" },
  { key: "cable_car", label: "Cable car" },
  { key: "motorbike", label: "Motorbike" },
] as const;

export type TransportKey = (typeof TRANSPORT)[number]["key"];

// ---------------------------------------------------------------------------
// Who can come
// ---------------------------------------------------------------------------

/**
 * `warn` marks the ones that are a caution rather than a welcome. They read
 * differently on the page, because "not suitable for limited mobility" listed
 * as a green tick beside "service animals welcome" is how you get a booking
 * somebody has to cancel.
 */
export const ACCESSIBILITY = [
  { key: "step_free", label: "Step-free for most of the route", warn: false },
  { key: "wheelchair", label: "Wheelchair accessible", warn: false },
  { key: "service_animals", label: "Service animals welcome", warn: false },
  { key: "hearing", label: "Works for deaf and hard-of-hearing guests", warn: false },
  { key: "vision", label: "Works for blind and low-vision guests", warn: false },
  { key: "kid_friendly", label: "Good with children", warn: false },
  { key: "stroller", label: "Pushchair friendly", warn: false },
  { key: "not_for_limited_mobility", label: "Not suitable if you have limited mobility", warn: true },
  { key: "altitude_health", label: "Ask your doctor first if you have heart or lung trouble", warn: true },
] as const;

export type AccessibilityKey = (typeof ACCESSIBILITY)[number]["key"];

// ---------------------------------------------------------------------------
// Reading the codes back
// ---------------------------------------------------------------------------

/** Codes → their words, dropping anything the app does not know. */
export function labelsFor(
  codes: readonly string[] | null | undefined,
  table: ReadonlyArray<{ key: string; label: string }>,
): string[] {
  if (!codes?.length) return [];
  return codes
    .map((c) => table.find((t) => t.key === c)?.label)
    .filter((l): l is string => Boolean(l));
}

export function transportLabels(codes: readonly string[] | null | undefined): string[] {
  return labelsFor(codes, TRANSPORT);
}

/** Welcomes first, cautions last, each with its flag. */
export function accessibilityRows(
  codes: readonly string[] | null | undefined,
): Array<{ label: string; warn: boolean }> {
  if (!codes?.length) return [];
  const rows = codes
    .map((c) => ACCESSIBILITY.find((a) => a.key === c))
    .filter((a): a is (typeof ACCESSIBILITY)[number] => Boolean(a))
    .map((a) => ({ label: a.label, warn: a.warn }));
  return [...rows.filter((r) => !r.warn), ...rows.filter((r) => r.warn)];
}

/**
 * What a trekker will hear on the day.
 *
 * An empty list on the trip means "whatever this guide speaks", which is the
 * normal case — only a trip deliberately led in a subset stores its own.
 */
export function tripLanguages(
  offeringLanguages: readonly string[] | null | undefined,
  guideLanguages: readonly string[] | null | undefined,
): string[] {
  const own = (offeringLanguages ?? []).filter(Boolean);
  if (own.length) return [...own];
  return [...(guideLanguages ?? []).filter(Boolean)];
}

// ---------------------------------------------------------------------------
// Questions everybody asks
// ---------------------------------------------------------------------------

export interface Faq {
  q: string;
  a: string;
}

/**
 * FAQs off a form field, checked rather than trusted.
 *
 * These render into the page and into FAQPage structured data, so a half-filled
 * pair is an invalid rich result. A question with no answer is dropped — it is
 * worse than nothing on a page whose job is to answer things.
 */
export function parseFaqs(raw: unknown, max = 12): Faq[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try {
      parsed = JSON.parse(t);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((e: any) => ({
      q: String(e?.q ?? "").trim().slice(0, 200),
      a: String(e?.a ?? "").trim().slice(0, 1200),
    }))
    .filter((e) => e.q.length > 2 && e.a.length > 2)
    .slice(0, max);
}

/** Codes off a form, keeping only the ones the database will accept. */
export function parseCodes(
  values: readonly string[],
  table: ReadonlyArray<{ key: string }>,
): string[] {
  const known = new Set(table.map((t) => t.key));
  return [...new Set(values.map((v) => String(v)).filter((v) => known.has(v)))];
}

/**
 * The reference a trekker quotes in an email.
 *
 * Mirrors offering_ref_code() in 0066 so a page can show it before a row has
 * been through the database, and so a missing one is never blank.
 */
export function refCodeWords(code: string | null | undefined): string | null {
  const c = (code ?? "").trim();
  return /^GN-[0-9A-F]{6}$/.test(c) ? c : null;
}
