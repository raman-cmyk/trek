/**
 * A request to book, kept across the sign-in it needs.
 *
 * Tapping "Request to book" while signed out redirected to the login page and
 * threw the request away. After signing in the trekker landed back on the trip
 * with an empty form and had to choose the date, the party size and the extras
 * again — and on a phone, where the form lives in a bottom sheet, it looked
 * like the tap had simply done nothing.
 *
 * So the request is parked before the redirect and replayed afterwards. Pure:
 * what may be parked, and for how long. Nothing here is trusted on the way
 * back — the replay runs the same validation a fresh POST does — so this is a
 * convenience, not an authority.
 */

export interface PendingEnquiry {
  offeringId: string;
  guideId: string;
  startDate: string;
  partySize: number;
  message: string | null;
  arrivalDate: string | null;
  selectedOptions: string[];
  /** Where they were, so the confirmation can offer the way back. */
  returnTo: string;
  /** Milliseconds since the epoch, at parking time. */
  at: number;
}

/**
 * Long enough to read a sign-up email, short enough that a request does not
 * surface days later on somebody else's shared laptop.
 */
export const PENDING_TTL_MS = 30 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A same-site path, never an absolute URL — this is used as a destination. */
function ownPath(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.startsWith("/") && !s.startsWith("//") ? s.slice(0, 300) : "/";
}

export function packPending(
  fields: Omit<PendingEnquiry, "at">,
  nowMs: number = Date.now(),
): string {
  const p: PendingEnquiry = { ...fields, at: nowMs };
  return JSON.stringify(p);
}

/**
 * Read a parked request back, or null.
 *
 * Every field is checked rather than trusted: the cookie is signed, but a
 * shape that cannot be replayed is still better dropped here than turned into
 * a confusing error three functions later.
 */
export function unpackPending(
  raw: string | null | undefined,
  nowMs: number = Date.now(),
): PendingEnquiry | null {
  if (!raw) return null;
  let p: any;
  try {
    p = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!p || typeof p !== "object") return null;
  if (typeof p.at !== "number" || nowMs - p.at > PENDING_TTL_MS || p.at > nowMs + 60_000) {
    return null;
  }
  if (!UUID.test(String(p.offeringId ?? "")) || !UUID.test(String(p.guideId ?? ""))) {
    return null;
  }
  if (!DAY.test(String(p.startDate ?? ""))) return null;
  const party = Math.round(Number(p.partySize));
  if (!Number.isFinite(party) || party < 1 || party > 16) return null;

  return {
    offeringId: String(p.offeringId),
    guideId: String(p.guideId),
    startDate: String(p.startDate),
    partySize: party,
    message: typeof p.message === "string" ? p.message.slice(0, 2000) || null : null,
    arrivalDate: DAY.test(String(p.arrivalDate ?? "")) ? String(p.arrivalDate) : null,
    selectedOptions: Array.isArray(p.selectedOptions)
      ? p.selectedOptions
          .filter((v: unknown) => typeof v === "string")
          .map((v: string) => v.slice(0, 60))
          .slice(0, 20)
      : [],
    returnTo: ownPath(p.returnTo),
    at: p.at,
  };
}
