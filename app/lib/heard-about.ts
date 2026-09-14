/**
 * "How did you hear about Guides of Nepal?"
 *
 * Asked of every guide who applies, because for a guide-first marketplace the
 * answer is the business. Guides do not arrive from advertising; they arrive
 * because another guide told them, and knowing WHICH guide is the difference
 * between a channel you can grow and a number on a dashboard.
 *
 * So the referral answers carry a second question — who? — and that is the
 * one worth reading. The rest exist so the referral answer stays honest:
 * without "Facebook" on the list, everyone who saw a post picks "a guide told
 * me" because it is closest.
 */

export interface HeardOption {
  value: string;
  label: string;
  /** Asked underneath when this is picked. Null when there is nothing to ask. */
  detail: string | null;
}

export const HEARD_OPTIONS: HeardOption[] = [
  { value: "guide", label: "Another guide told me", detail: "Which guide? Their name is enough." },
  { value: "trekker", label: "A trekker I guided told me", detail: "Who? Their name, if you remember." },
  {
    value: "agency",
    label: "My agency, or TAAN / NMA",
    detail: "Which agency or association?",
  },
  { value: "facebook", label: "Facebook or Instagram", detail: null },
  { value: "search", label: "I searched for it", detail: null },
  { value: "friend", label: "A friend or family", detail: null },
  { value: "contacted", label: "Someone from Guides of Nepal contacted me", detail: null },
  { value: "other", label: "Somewhere else", detail: "Where?" },
];

export const HEARD_VALUES = HEARD_OPTIONS.map((o) => o.value);

/** The options whose answer is worth a name. */
export const REFERRAL_VALUES = HEARD_OPTIONS.filter((o) => o.detail).map((o) => o.value);

export function isHeardValue(v: unknown): boolean {
  return typeof v === "string" && HEARD_VALUES.includes(v);
}

/** How it reads back in the office. */
export function heardLabel(value: string | null | undefined): string {
  return HEARD_OPTIONS.find((o) => o.value === value)?.label ?? "Not asked";
}

/** The follow-up question for this answer, or null. */
export function detailPromptFor(value: string | null | undefined): string | null {
  return HEARD_OPTIONS.find((o) => o.value === value)?.detail ?? null;
}

/**
 * What is wrong with this answer.
 *
 * The dropdown is required — a field half the applicants skip tells you
 * nothing, and it is one question. The name is not: somebody who genuinely
 * cannot remember which guide mentioned us should not be stuck on the form.
 */
export function heardProblem(value: unknown): string | null {
  if (!value || (typeof value === "string" && !value.trim())) {
    return "Tell us how you heard about us — it is how we find more guides like you.";
  }
  if (!isHeardValue(value)) return "Pick one of the options.";
  return null;
}

/** The name, tidied. Kept short: it is a name, not a story. */
export function cleanDetail(detail: unknown): string | null {
  const d = typeof detail === "string" ? detail.trim().replace(/\s{2,}/g, " ") : "";
  return d ? d.slice(0, 120) : null;
}

/**
 * One line for the office: "Another guide told me — Pemba Sherpa".
 *
 * The two halves are stored apart so they can be counted, and joined here so
 * nobody has to read two columns to get one fact.
 */
export function heardLine(
  value: string | null | undefined,
  detail: string | null | undefined,
): string {
  const label = heardLabel(value);
  const d = (detail ?? "").trim();
  return d ? `${label} — ${d}` : label;
}

/**
 * Where guides are coming from, commonest first.
 *
 * Counted over answers actually given: applicants from before the question
 * existed are not "somewhere else", they are not data, and folding them in
 * would quietly rank a category nobody chose.
 */
export function heardBreakdown(
  rows: { heard_about: string | null }[],
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!isHeardValue(r.heard_about)) continue;
    counts.set(r.heard_about!, (counts.get(r.heard_about!) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: heardLabel(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
