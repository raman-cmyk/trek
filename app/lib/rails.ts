/**
 * Who appears in which row.
 *
 * Each row on the homepage filters the whole roster by an intent — speaks
 * German, works Annapurna, women guiding — and took the first eight matches.
 * A guide who matches three intents appeared in three rows with the same
 * photograph, the same line and the same rate, which reads as padding rather
 * than curation.
 *
 * So a guide appears in one row: the first that wants them. Rows are filled
 * in order, and a row left with too few to be a real choice is dropped rather
 * than padded — a row of one is a bug, not a recommendation.
 */

export interface Rail<T> {
  key: string;
  members: T[];
  /** How many match in total, before this row's share was taken. */
  total: number;
}

export function dedupeRails<T>(
  rails: Array<{ key: string; matched: T[] }>,
  idOf: (item: T) => string,
  opts: { perRail?: number; minPerRail?: number } = {},
): Array<Rail<T>> {
  const perRail = opts.perRail ?? 8;
  const minPerRail = opts.minPerRail ?? 3;
  const used = new Set<string>();
  const out: Array<Rail<T>> = [];

  for (const rail of rails) {
    const fresh = rail.matched.filter((m) => !used.has(idOf(m))).slice(0, perRail);
    if (fresh.length < minPerRail) continue;
    for (const m of fresh) used.add(idOf(m));
    // `total` stays the true size of the intent, not the size of this row:
    // "See all 12 →" should mean twelve people match, not twelve unseen ones.
    out.push({ key: rail.key, members: fresh, total: rail.matched.length });
  }
  return out;
}
