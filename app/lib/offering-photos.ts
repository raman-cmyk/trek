/**
 * The pictures of a trip, as one list.
 *
 * A trip's photographs live in two places: `cover_photo_url` on the offering
 * itself, chosen to represent it, and the rows in `offering_photos` the guide
 * uploaded afterwards. The trek page used to show the uploads when there were
 * any and the cover only when there were none — so a trip with a cover and two
 * uploads showed two pictures and quietly dropped the one chosen to stand for
 * it.
 *
 * The cover leads, then anything not already in the list, deduplicated on the
 * URL because a guide who sets their cover from an upload has the same file
 * twice. Pure, so the card in a grid and the gallery on the trip page cannot
 * disagree about what a trip looks like.
 */

export interface PhotoRow {
  url: string;
  alt_text?: string | null;
  credit_name?: string | null;
}

export interface CardPhoto {
  url: string;
  alt: string;
  credit?: string | null;
}

export function galleryPhotos(
  cover: string | null | undefined,
  extras: readonly PhotoRow[] | null | undefined,
  title: string,
): CardPhoto[] {
  const out: CardPhoto[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined, alt: string, credit: string | null) => {
    const u = (url ?? "").trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push({ url: u, alt: alt || title, credit });
  };
  push(cover, title, null);
  for (const p of extras ?? []) push(p.url, p.alt_text ?? title, p.credit_name ?? null);
  return out;
}

/** Group the rows of one batched `offering_photos` select by offering. */
export function byOffering<T extends PhotoRow & { offering_id: string }>(
  rows: readonly T[] | null | undefined,
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of rows ?? []) (map[r.offering_id] ??= []).push(r);
  return map;
}
