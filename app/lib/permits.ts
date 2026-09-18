/**
 * The permit tracker's filters.
 *
 * Every permit application for every upcoming trek in one list, sorted by how
 * soon the trek leaves. That is the right order to work in and the wrong one
 * to answer a question in: "what is still waiting on documents" meant reading
 * every row. The filters are the questions actually asked of this page.
 */

export const PERMIT_STATUSES = [
  "awaiting_docs",
  "filed",
  "approved",
  "ready",
  "rejected",
] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];

export const PERMIT_TONE: Record<PermitStatus, "neutral" | "amber" | "blue" | "green" | "red"> = {
  awaiting_docs: "neutral",
  filed: "amber",
  approved: "blue",
  ready: "green",
  rejected: "red",
};

/**
 * Soonest trek first — the one that will hurt first if its permit is late.
 * A row with no date sorts last rather than first, where an empty string would
 * otherwise put it.
 */
export function bySoonest<T extends { booking?: { start_date?: string | null } | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const x = a.booking?.start_date ?? "";
    const y = b.booking?.start_date ?? "";
    if (!x) return 1;
    if (!y) return -1;
    return x.localeCompare(y);
  });
}

/** What ops is allowed to write when logging one by hand. */
export function manualEntryProblem(input: {
  bookingId: string;
  permitId: string;
  status: string;
}): string | null {
  if (!input.bookingId) return "Pick the booking this permit is for.";
  if (!input.permitId) return "Pick which permit it is.";
  if (!PERMIT_STATUSES.includes(input.status as PermitStatus)) {
    return "That is not a permit status.";
  }
  return null;
}

/** The timestamps a status implies, so a hand-logged row reads like a filed one. */
export function stampsFor(status: string, now = new Date()): Record<string, string> {
  const iso = now.toISOString();
  const stamps: Record<string, string> = {};
  if (status === "filed" || status === "approved" || status === "ready") stamps.filed_at = iso;
  if (status === "approved" || status === "ready") stamps.approved_at = iso;
  return stamps;
}

/* ── What kind of permit it is (0102) ───────────────────────────────────── */

/**
 * The codes a permit row carries, and the words the office uses for them.
 *
 * TIMS is in this list because it is an ordinary permit and always was. It had
 * grown a second life as its own table, its own panel and its own issue
 * button, which could not see the permits model and so issued blue cards for
 * routes with no TIMS permit on them at all.
 */
export const PERMIT_CODES = [
  { code: "tims", label: "TIMS card" },
  { code: "park_entry", label: "National park entry" },
  { code: "municipality", label: "Rural municipality fee" },
  { code: "restricted", label: "Restricted area permit" },
  { code: "acap", label: "ACAP (Annapurna)" },
  { code: "mcap", label: "MCAP (Manaslu)" },
  { code: "conservation", label: "Conservation area permit" },
  { code: "other", label: "Something else" },
] as const;

export type PermitCode = (typeof PERMIT_CODES)[number]["code"];

export const permitCodeLabel = (code: string): string =>
  PERMIT_CODES.find((c) => c.code === code)?.label ?? code;

/**
 * Guess the code from the name the office typed.
 *
 * The same rules as the 0102 backfill, kept here so a permit added from the
 * route form lands in the same buckets as the seeded ones. A guess, not a
 * ruling: `other` is a real answer and the office can leave it there.
 */
export function permitCodeFor(name: string): PermitCode {
  const n = name.toLowerCase();
  if (n.includes("tims")) return "tims";
  if (n.includes("national park")) return "park_entry";
  if (n.includes("municipality")) return "municipality";
  if (n.includes("restricted")) return "restricted";
  if (n.includes("mcap") || n.includes("manaslu conservation")) return "mcap";
  if (n.includes("acap") || n.includes("annapurna conservation")) return "acap";
  if (n.includes("conservation")) return "conservation";
  return "other";
}

/** Does this route's permit list include a TIMS card? */
export function routeNeedsTims(permits: Array<{ code?: string | null }>): boolean {
  return permits.some((p) => p.code === "tims");
}
