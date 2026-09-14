/**
 * Blocking an account — the reasoning, with no database in it.
 *
 * A block row (migration 0060) is either suspended or banned, open or lifted.
 * What stage it is in right now, which stages a filter shows, how long to
 * tell Supabase Auth to refuse sign-ins, and the sentence the person reads
 * are all decided here, where they can be tested.
 */

export type BlockKind = "suspended" | "banned";

export interface BlockRow {
  kind: BlockKind;
  ends_at: string | null;
  lifted_at: string | null;
}

/** Where a block is in its life. "expired" is a suspension whose date passed. */
export type BlockStage = "suspended" | "banned" | "expired" | "lifted";

export function blockStage(b: BlockRow, now: Date = new Date()): BlockStage {
  if (b.lifted_at) return "lifted";
  if (b.kind === "banned") return "banned";
  if (b.ends_at && new Date(b.ends_at).getTime() <= now.getTime()) return "expired";
  return "suspended";
}

/** A block that is keeping somebody out right now. */
export function isOpen(b: BlockRow, now: Date = new Date()): boolean {
  const s = blockStage(b, now);
  return s === "suspended" || s === "banned";
}

/** The filter chips on the Blocking page, in order. */
export const BLOCK_FILTERS = [
  { key: "active", label: "Blocked now" },
  { key: "suspended", label: "Suspended" },
  { key: "banned", label: "Banned" },
  { key: "lifted", label: "Lifted" },
  { key: "all", label: "Everything" },
] as const;

export type BlockFilter = (typeof BLOCK_FILTERS)[number]["key"];

export function isBlockFilter(s: string): s is BlockFilter {
  return BLOCK_FILTERS.some((f) => f.key === s);
}

export function filterMatches(filter: BlockFilter, stage: BlockStage): boolean {
  switch (filter) {
    case "active":
      return stage === "suspended" || stage === "banned";
    case "suspended":
      return stage === "suspended";
    case "banned":
      return stage === "banned";
    case "lifted":
      return stage === "lifted" || stage === "expired";
    case "all":
      return true;
  }
}

/**
 * What Supabase Auth is told. A ban has no end, and neither does a
 * suspension the office left open-ended, so both get a century; a dated
 * suspension gets the hours until it ends, rounded up so nobody slips in
 * during the last fifty-nine minutes.
 */
export function banDurationFor(
  kind: BlockKind,
  endsAt: string | null,
  now: Date = new Date(),
): string {
  if (kind === "banned" || !endsAt) return "876000h";
  const hours = Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 3_600_000);
  return `${Math.max(1, hours)}h`;
}

/** "2026-10-01" from a date input → the last second of that day, UTC. */
export function endOfDayIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T23:59:59Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** What a guide's status becomes while a block stands. */
export function guideStatusWhileBlocked(kind: BlockKind): "suspended" | "removed" {
  return kind === "banned" ? "removed" : "suspended";
}

/** The one line a blocked person reads on /blocked. */
export function blockedMessage(
  b: Pick<BlockRow, "kind" | "ends_at"> | null,
  fmtDate: (iso: string) => string,
): string {
  if (!b) return "Your account is paused.";
  if (b.kind === "banned") return "Your account has been closed.";
  if (b.ends_at) return `Your account is paused until ${fmtDate(b.ends_at)}.`;
  return "Your account is paused while we look into something.";
}
