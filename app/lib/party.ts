/**
 * How many people, said the same way everywhere.
 *
 * Every trip here is private to the party that books it: the guide walks with
 * you and nobody is added to your group. That is worth stating on the card and
 * on the page in the same words, because on most trekking sites a price like
 * ours is a seat on somebody else's departure.
 */
export function partyWords(min: number | null, max: number | null): string {
  const lo = min && min > 0 ? min : 1;
  if (!max) return `Private trip, from ${lo} ${lo === 1 ? "person" : "people"}`;
  if (max === lo) return `Private trip for ${lo} ${lo === 1 ? "person" : "people"}`;
  return `Private trip for ${lo} to ${max} people`;
}
