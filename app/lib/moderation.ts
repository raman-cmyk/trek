/**
 * What the office can do about a flagged message.
 *
 * The page had one button — Dismiss — so the only thing anybody could do
 * about a guide sending a WhatsApp number was to pretend they had not. The
 * founder's ask: "a Take action button next to the Dismiss option ... allowing
 * you to choose between blocking, banning, or issuing a warning."
 *
 * Three kinds, and the difference between them matters enough to be written
 * down rather than remembered:
 *
 *   warned     — nothing is restricted. It is on the record and the person is
 *                told. Most first offences are this: a guide who pastes their
 *                number is usually trying to be helpful, not to dodge us.
 *   suspended  — they cannot sign in, for a stated number of days. A guide's
 *                listings come down and go back up when it lifts.
 *   banned     — the same, and it does not end.
 *
 * The rules live here so they can be tested without a database: what a valid
 * action is, which block is in force, and what the person is told.
 */

export type ActionKind = "warned" | "suspended" | "banned";

export const ACTION_KINDS: ActionKind[] = ["warned", "suspended", "banned"];

/** Longest a suspension may run before it should just be a ban. */
export const MAX_SUSPENSION_DAYS = 180;
export const REASON_MIN = 10;
export const REASON_MAX = 500;

export interface BlockRow {
  kind: ActionKind;
  reason: string;
  starts_at: string;
  ends_at: string | null;
  lifted_at: string | null;
}

/** Is this an action we know how to take? */
export function isActionKind(v: unknown): v is ActionKind {
  return typeof v === "string" && (ACTION_KINDS as string[]).includes(v);
}

/**
 * What is wrong with this action, in a sentence the office can act on.
 *
 * The reason is required for all three, including a warning: the person is
 * sent it, and "you have been warned" with no cause attached is worse than
 * saying nothing.
 */
export function actionProblem(
  kind: string,
  reason: string,
  days?: number | null,
): string | null {
  if (!isActionKind(kind)) return "Pick what to do: warn, suspend or ban.";
  const r = (reason ?? "").trim();
  if (!r) return "Say why. They are sent this, and it goes on the record.";
  if (r.length < REASON_MIN) return "A few more words — they read this.";
  if (r.length > REASON_MAX) return `Keep it under ${REASON_MAX} characters.`;
  if (kind === "suspended") {
    if (!Number.isFinite(days) || (days ?? 0) < 1) {
      return "How many days? A suspension with no end is a ban — pick that instead if you mean it.";
    }
    if ((days as number) > MAX_SUSPENSION_DAYS) {
      return `Longer than ${MAX_SUSPENSION_DAYS} days is a ban in everything but name. Say ban.`;
    }
  }
  return null;
}

/** When a suspension of this many days, started now, runs out. */
export function suspensionEnd(days: number, nowIso: string): string {
  const end = new Date(Date.parse(nowIso) + Math.round(days) * 86_400_000);
  return end.toISOString();
}

/**
 * The block in force right now, if any.
 *
 * A warning never counts: it restricts nothing, and treating it as a block
 * would lock out everybody who has ever been told off. A suspension that has
 * run out is over whether or not anybody lifted it by hand — the alternative
 * is somebody staying locked out because an admin did not come back.
 */
export function activeBlock(rows: BlockRow[], nowIso: string): BlockRow | null {
  const now = Date.parse(nowIso);
  for (const r of rows) {
    if (r.kind === "warned") continue;
    if (r.lifted_at) continue;
    if (Date.parse(r.starts_at) > now) continue;
    if (r.ends_at && Date.parse(r.ends_at) <= now) continue;
    return r;
  }
  return null;
}

/** What a locked-out person is shown. Their words back, plus when it ends. */
export function blockMessage(block: BlockRow, nowIso: string): string {
  if (block.kind === "banned") {
    return `Your account has been closed. Reason given: ${block.reason}`;
  }
  const until = block.ends_at
    ? new Date(block.ends_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  const left = block.ends_at ? daysLeft(block.ends_at, nowIso) : null;
  return until
    ? `Your account is suspended until ${until}${left ? ` — ${left}` : ""}. Reason given: ${block.reason}`
    : `Your account is suspended. Reason given: ${block.reason}`;
}

function daysLeft(endsAt: string, nowIso: string): string | null {
  const ms = Date.parse(endsAt) - Date.parse(nowIso);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const days = Math.ceil(ms / 86_400_000);
  return days === 1 ? "1 day left" : `${days} days left`;
}

/** How an action reads in a list: "Suspended 14 days", "Warned", "Banned". */
export function actionLabel(kind: ActionKind, days?: number | null): string {
  if (kind === "warned") return "Warned";
  if (kind === "banned") return "Banned";
  return days ? `Suspended ${days} ${days === 1 ? "day" : "days"}` : "Suspended";
}

/**
 * Which side of the moderation page a flagged message belongs on.
 *
 * "Flagged messages originating from guides should appear in the guide
 * section, and flagged messages from clients should appear in the client
 * section." Anything that is neither — an ops account testing the filter,
 * a message whose sender was deleted — goes with the clients rather than
 * vanishing, because a flagged message nobody can see is the worst outcome
 * on a page whose whole job is seeing them.
 */
export function sideOf(role: string | null | undefined): "guides" | "clients" {
  return role === "guide" ? "guides" : "clients";
}

export function splitBySide<T>(
  rows: T[],
  roleOf: (row: T) => string | null | undefined,
): { guides: T[]; clients: T[] } {
  const guides: T[] = [];
  const clients: T[] = [];
  for (const row of rows) {
    (sideOf(roleOf(row)) === "guides" ? guides : clients).push(row);
  }
  return { guides, clients };
}
