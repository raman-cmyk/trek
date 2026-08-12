/**
 * First names only — the display rule for every person in the app.
 *
 * In Nepal a family name is an ethnicity: Sherpa, Tamang, Gurung, Thapa. A
 * marketplace that prints surnames on every card is inviting people to pick
 * a guide by caste, and a trekker's surname is simply nobody's business.
 * The public views enforce this at the database (migration 0042); this
 * helper is for the signed-in surfaces that read base tables directly.
 *
 * Full legal names still exist where the law needs them: the ops console,
 * contracts, TIMS cards, permits.
 */
export function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "";
}
