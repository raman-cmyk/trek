/**
 * The office's booking board: which column a booking belongs in.
 *
 * Two things the old board got wrong, both for the same reason — it read
 * `bookings.status` and nothing else.
 *
 * 1. "Docs pending" is the passport and the insurance. Permits are a separate
 *    job, done by a different person, often weeks later, and they were
 *    invisible: a booking whose papers were in went straight to "Confirmed"
 *    and sat there whether or not anyone had filed a single permit.
 *
 * 2. A momo crawl and a fourteen-day trek to Everest do not have the same
 *    steps. Putting them on one board means every column has to be named
 *    vaguely enough to cover both, which is how a board stops being read.
 *
 * So: two boards, and the permit columns come from what the permit office has
 * actually done rather than from the booking's status. Pure, so the placement
 * rule is testable and the board cannot disagree with the trip page — both
 * read the same tracks in pipeline.ts.
 */

import { permitProgress, trackFor, type PermitProgress } from "~/lib/pipeline";

export type BoardKey = "treks" | "day";

export interface BoardDef {
  key: BoardKey;
  label: string;
  /** What the tab says under the name, so the split explains itself. */
  note: string;
  columns: string[];
}

/** A kind belongs to the trek board when its track has permits to file. */
export function needsPermits(kind: string | null | undefined): boolean {
  return trackFor(kind).some((s) => s.key === "permits");
}

export function boardFor(kind: string | null | undefined): BoardKey {
  return needsPermits(kind) ? "treks" : "day";
}

export const BOARDS: BoardDef[] = [
  {
    key: "treks",
    label: "Treks & adventures",
    note: "Papers and permits before anyone walks",
    columns: [
      "pending_deposit",
      "deposit_paid",
      "docs_pending",
      "permits_pending",
      "confirmed",
      "active",
      "completed",
    ],
  },
  {
    key: "day",
    label: "Day experiences",
    note: "Day hikes, food, culture and city walks — no permits, no passports",
    // No papers column: we collect neither a passport nor insurance for a
    // half-day walk, so a column for them would never hold anything.
    columns: ["pending_deposit", "deposit_paid", "confirmed", "active", "completed"],
  },
];

export const COLUMN_LABELS: Record<string, string> = {
  pending_deposit: "Pending deposit",
  deposit_paid: "Deposit paid",
  docs_pending: "Docs pending",
  permits_pending: "Permits pending",
  confirmed: "Confirmed",
  active: "Active",
  completed: "Completed",
};

/** What each column is waiting on, said plainly under its name. */
export const COLUMN_NOTES: Record<string, string> = {
  pending_deposit: "Nothing paid yet",
  deposit_paid: "Paid — ask for the papers",
  docs_pending: "Waiting on a passport page and insurance",
  permits_pending: "Papers in. TIMS and park permits still to file",
  confirmed: "Everything in. Waiting for the day",
  active: "Out there now",
  completed: "Walked. Pay the guide",
};

export interface BoardBooking {
  status?: string | null;
  offering?: { kind?: string | null } | null;
  permit_applications?: Array<{ status?: string | null }> | null;
}

/**
 * The column a booking sits in, on its own board.
 *
 * `confirmed` is the only status that splits. A trek's booking goes
 * `confirmed` the moment its last document is verified and stays there until
 * the day it starts, so the status alone cannot tell you whether the permits
 * have been dealt with — only the permit applications can, and one rejected
 * permit is the story however well the others went (permitProgress).
 *
 * Returns null for a booking that is not on any board — a cancellation — so
 * the caller decides what to do with it rather than it quietly landing in
 * whichever column happens to be last.
 */
export function columnFor(b: BoardBooking): string | null {
  const status = String(b.status ?? "");
  const kind = b.offering?.kind ?? null;
  const board = boardFor(kind);

  if (status.startsWith("cancelled")) return null;

  if (status === "confirmed") {
    if (board !== "treks") return "confirmed";
    const permits = permitProgress(b.permit_applications);
    return permitsSettled(permits) ? "confirmed" : "permits_pending";
  }

  // A day experience collects no papers, so `docs_pending` on that board just
  // means paid and not yet confirmed — which is what "Deposit paid" says.
  if (status === "docs_pending" && board !== "treks") return "deposit_paid";

  const columns = BOARDS.find((x) => x.key === board)!.columns;
  return columns.includes(status) ? status : null;
}

/**
 * Permits we no longer have to chase.
 *
 * "issued" is done. "problem" is NOT done, and deliberately stays in the
 * Permits pending column: a rejected permit is the single most urgent thing
 * on this board and hiding it under Confirmed is how a trek reaches the
 * trailhead without one.
 */
export function permitsSettled(p: PermitProgress): boolean {
  return p === "issued";
}

/** Group bookings into their columns, keeping the order they arrived in. */
export function byColumn<T extends BoardBooking>(
  bookings: T[],
  board: BoardKey,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const col of BOARDS.find((b) => b.key === board)!.columns) out[col] = [];
  for (const b of bookings) {
    if (boardFor(b.offering?.kind ?? null) !== board) continue;
    const col = columnFor(b);
    if (col && out[col]) out[col].push(b);
  }
  return out;
}
