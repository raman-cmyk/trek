/**
 * Time-gated unlocks for My Trips (docs/04). Pure functions of the trek start
 * date and "now" so they're deterministic and testable (the M7 done-criterion's
 * "time-travel" check is just passing different `now` values).
 */
export function daysUntilStart(startIso: string, nowIso: string): number {
  return Math.ceil((Date.parse(startIso) - Date.parse(nowIso)) / 86_400_000);
}

/** Pre-trek brief (packing list, altitude notes) unlocks 7 days before start. */
export function briefUnlocked(startIso: string, nowIso: string): boolean {
  return daysUntilStart(startIso, nowIso) <= 7;
}

/** The guide's phone number is released 48 hours before start. */
export function guidePhoneUnlocked(startIso: string, nowIso: string): boolean {
  return daysUntilStart(startIso, nowIso) <= 2;
}
