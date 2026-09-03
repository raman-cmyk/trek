/**
 * The languages a guide can say they speak, and how well.
 *
 * Shared, not server-only: the picker renders this list and the server
 * validates against it. That is the whole point of the file — until now the
 * application took a comma-separated string and the profile editor took free
 * text with a first-letter capitalise, so "german" and "German" became two
 * rows against a (guide_id, language) primary key, and the browse filter,
 * which is built from the distinct values in the table at request time,
 * inherited every typo anybody ever made.
 *
 * Keep PROFICIENCIES in step with the CHECK on guide_languages (0001).
 */

/** Nepal's own languages first — they are the ones guides actually list. */
export const LANGUAGES = [
  "Nepali",
  "English",
  "Hindi",
  "Sherpa",
  "Tamang",
  "Gurung",
  "Magar",
  "Newari",
  "Tibetan",
  "German",
  "French",
  "Spanish",
  "Italian",
  "Japanese",
  "Korean",
  "Chinese",
  "Russian",
  "Hebrew",
] as const;

export type Language = (typeof LANGUAGES)[number];

export const PROFICIENCIES = ["basic", "conversational", "fluent", "native"] as const;
export type Proficiency = (typeof PROFICIENCIES)[number];

/**
 * Said the way a guide would say it, not the way a database would. These are
 * the words already used in the profile editor; they live here now so the
 * application, the editor and the public profile cannot disagree.
 */
export const PROFICIENCY_LABELS: Record<Proficiency, string> = {
  basic: "A little",
  conversational: "Enough to guide",
  fluent: "Fluent",
  native: "First language",
};

/** How it reads on a public profile: "English (fluent)". */
export const PROFICIENCY_PUBLIC: Record<Proficiency, string> = {
  basic: "a little",
  conversational: "enough to guide",
  fluent: "fluent",
  native: "first language",
};

export function isLanguage(s: unknown): s is Language {
  return typeof s === "string" && (LANGUAGES as readonly string[]).includes(s);
}

export function isProficiency(s: unknown): s is Proficiency {
  return typeof s === "string" && (PROFICIENCIES as readonly string[]).includes(s);
}

export interface LanguageRow {
  language: Language;
  proficiency: Proficiency;
}

/**
 * Parse the picker's hidden JSON field. Defensive because it arrives as a
 * string from a form: anything unrecognised is dropped rather than allowed to
 * fail an insert halfway through an application, and duplicates are collapsed
 * because the primary key would otherwise reject the whole batch.
 */
export function parseLanguages(raw: unknown): LanguageRow[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: LanguageRow[] = [];
  for (const row of parsed) {
    const language = (row as any)?.language;
    const proficiency = (row as any)?.proficiency;
    if (!isLanguage(language) || !isProficiency(proficiency)) continue;
    if (seen.has(language)) continue;
    seen.add(language);
    out.push({ language, proficiency });
    if (out.length >= LANGUAGES.length) break;
  }
  return out;
}
