/**
 * Taking an experience off the market, and saying why.
 *
 * A pause is not a small act: it is somebody's listing, and therefore
 * somebody's income, switched off. The rule here is the same one we apply to
 * rejecting a route — say why, because the guide gets this back and has to be
 * able to fix it.
 *
 * The reason is required rather than encouraged. An optional box is an empty
 * box, and an empty box a week later is the office arguing about what it
 * decided.
 */

export const PAUSE_REASON_MIN = 10;
export const PAUSE_REASON_MAX = 500;

/** What is wrong with this reason, in a sentence the office can act on. */
export function pauseProblem(reason: string): string | null {
  const r = (reason ?? "").trim();
  if (!r) return "Say why it is being paused — the guide is told, and has to be able to fix it.";
  if (r.length < PAUSE_REASON_MIN) {
    return "A few more words. The guide reads this and has to know what to change.";
  }
  if (r.length > PAUSE_REASON_MAX) {
    return `Keep it under ${PAUSE_REASON_MAX} characters — the rest belongs in a message.`;
  }
  return null;
}

/** The reason, cleaned up for storage. */
export function cleanReason(reason: string): string {
  return (reason ?? "").trim().replace(/\s*\n\s*\n\s*/g, "\n").slice(0, PAUSE_REASON_MAX);
}

/**
 * How long it has been off the market.
 *
 * A listing paused on Tuesday and a listing paused in March are different
 * problems, and the second one is usually somebody forgetting.
 */
export function pausedFor(pausedAtIso: string | null, nowIso: string): string | null {
  if (!pausedAtIso) return null;
  const then = Date.parse(pausedAtIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now) || now < then) return null;
  const days = Math.floor((now - then) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/** Long enough off the market that somebody should look at it again. */
export function isStalePause(pausedAtIso: string | null, nowIso: string): boolean {
  if (!pausedAtIso) return false;
  const then = Date.parse(pausedAtIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return false;
  return now - then >= 30 * 86_400_000;
}

/** What the guide is told, in words that say what to do next. */
export function pauseSms(title: string, reason: string, url: string): string {
  return `Guides of Nepal: we've paused "${title.slice(0, 24)}" — ${reason.slice(0, 60)}. Fix it and tell us: ${url}`;
}
