/**
 * First names, everywhere a person is shown.
 *
 * Two reasons, and the second is the one that matters.
 *
 * Privacy: a guide's page carries their district, their licence tier, their
 * photograph and their availability. Adding a surname to that is a full
 * identity on a public page, indexed, for someone who signed up to lead treks.
 * Trekkers are worse — a review byline should not be a searchable name.
 *
 * Voice: "Pemba" is a person you might walk with. "Pemba Sherpa" is a listing.
 * The whole product rests on the difference.
 *
 * Ops is exempt. The verification queue, payouts and incidents are internal
 * and need the legal name — that is the point of them. Those screens call the
 * column directly and must keep doing so.
 */
export function firstName(full: string | null | undefined): string {
  if (!full) return "";
  const t = full.trim();
  if (!t) return "";
  // Split on whitespace only. A hyphenated or apostrophised given name
  // ("Jean-Pierre", "D'Angelo") is one name, not two.
  return t.split(/\s+/)[0];
}

/** "Pemba & Dawa", "Pemba, Dawa & Mingma" — first names, read as a sentence. */
export function firstNames(list: Array<string | null | undefined>): string {
  const names = list.map(firstName).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
