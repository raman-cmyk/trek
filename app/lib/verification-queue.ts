/**
 * The verification queue, as two queues.
 *
 * The office had one list: guides who had applied or were in review, each
 * reduced to "2/6 passed". Which two, and what is still missing, took opening
 * the profile — and a verified or rejected guide could not be found here at
 * all. Trekkers' documents were not in the queue in any form, so the passport
 * a trip is waiting on lived only inside that trip's page.
 *
 * Pure: the stages, what counts as each, and the sentence for a row.
 */

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

/** Guide statuses, as the office thinks of them. */
export const GUIDE_STAGES = [
  { key: "waiting", label: "Waiting on us", match: ["applied", "in_review"] },
  { key: "applied", label: "Applied", match: ["applied"] },
  { key: "in_review", label: "In review", match: ["in_review"] },
  { key: "verified", label: "Verified", match: ["verified"] },
  { key: "rejected", label: "Rejected", match: ["removed", "suspended"] },
  { key: "all", label: "Everyone", match: ["applied", "in_review", "verified", "removed", "suspended"] },
] as const;

export type GuideStageKey = (typeof GUIDE_STAGES)[number]["key"];

export function guideStage(raw: string | null | undefined) {
  return GUIDE_STAGES.find((s) => s.key === raw) ?? GUIDE_STAGES[0];
}

/** A guide's status in the words the queue prints. */
export function guideStatusLabel(status: string): string {
  if (status === "in_review") return "In review";
  if (status === "removed") return "Rejected";
  if (status === "suspended") return "Suspended";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export interface CheckRow {
  check_type: string;
  status: string;
}

/**
 * Where a guide's paperwork stands, in one line.
 *
 * Settled counts a check the office has finished with, which includes "we
 * looked and this one does not apply" — otherwise a fully-reviewed guide sits
 * at 5/6 for ever and nobody can tell why.
 */
export function checkTally(checks: CheckRow[]) {
  const passed = checks.filter((c) => c.status === "passed").length;
  const failed = checks.filter((c) => c.status === "failed" || c.status === "expired").length;
  const settled = checks.filter((c) =>
    ["passed", "failed", "expired", "not_required"].includes(c.status),
  ).length;
  return {
    passed,
    failed,
    pending: checks.length - settled,
    total: checks.length,
    /** Nothing left for the office to do on this guide's checks. */
    complete: checks.length > 0 && settled === checks.length,
  };
}

/** What still needs doing, or what is wrong. Null when there is neither. */
export function guideBlocker(
  checks: CheckRow[],
  label: (t: string) => string,
): string | null {
  const bad = checks.filter((c) => c.status === "failed" || c.status === "expired");
  if (bad.length) return `${bad.map((c) => label(c.check_type)).join(", ")} — not passed`;
  const pending = checks.filter((c) => c.status === "pending");
  if (pending.length) return `Waiting on ${pending.map((c) => label(c.check_type)).join(", ")}`;
  return null;
}

// ---------------------------------------------------------------------------
// Trekkers' documents
// ---------------------------------------------------------------------------

export const DOC_STAGES = [
  { key: "unverified", label: "Waiting on us" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "Everything" },
] as const;

export type DocStageKey = (typeof DOC_STAGES)[number]["key"];

export function docStage(raw: string | null | undefined): DocStageKey {
  return (DOC_STAGES.find((s) => s.key === raw)?.key ?? "unverified") as DocStageKey;
}

export interface DocRow {
  verified_at: string | null;
  rejected_at: string | null;
}

export type DocState = "verified" | "rejected" | "unverified";

/**
 * A document's state. The later of the two timestamps wins: a document that
 * was turned down and then re-uploaded and passed is verified, and one passed
 * by mistake and then rejected is rejected.
 */
export function docState(d: DocRow): DocState {
  if (d.verified_at && d.rejected_at) {
    return d.verified_at > d.rejected_at ? "verified" : "rejected";
  }
  if (d.verified_at) return "verified";
  if (d.rejected_at) return "rejected";
  return "unverified";
}

export function docMatchesStage(d: DocRow, stage: DocStageKey): boolean {
  if (stage === "all") return true;
  return docState(d) === stage;
}

/** Passport or insurance, said the way the office says it. */
export function docTypeLabel(type: string): string {
  if (type === "passport") return "Passport page";
  if (type === "insurance") return "Insurance certificate";
  return type;
}

/**
 * Why a document was turned down has to be a sentence the trekker can act on.
 * An empty reason is refused, because "rejected" alone starts a support
 * thread instead of a re-upload.
 */
export function validateRejection(reason: unknown): { reason: string } | { error: string } {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length < 4) {
    return { error: "Say what is wrong with it — they will read this and upload another." };
  }
  return { reason: r.slice(0, 300) };
}
