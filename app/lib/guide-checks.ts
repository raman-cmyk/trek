/**
 * The verification checks the office runs on a guide.
 *
 * One list. The labels were duplicated verbatim in two ops routes and the
 * starting set was a third copy in the application form, so adding a check
 * type meant remembering three files.
 *
 * Keep in step with the CHECKs on guide_verifications (0001, narrowed in 0050).
 */

export const CHECK_TYPES = [
  "licence",
  "id_match",
  "phone",
  "pan_card",
  "payout_account",
  "police_cert",
  "first_aid",
  "altitude_training",
  "insurance",
] as const;

export type CheckType = (typeof CHECK_TYPES)[number];

export const CHECK_LABELS: Record<CheckType, string> = {
  licence: "Trekking licence",
  id_match: "Government ID matches licence",
  phone: "Phone verified",
  pan_card: "PAN card",
  payout_account: "Payout account",
  police_cert: "Police clearance",
  first_aid: "Wilderness first-aid cert",
  altitude_training: "Altitude training",
  insurance: "Insurance",
};

/**
 * What a new application starts with. The rest are added by hand when the
 * office decides a particular guide needs them.
 */
export const PENDING_CHECKS: readonly CheckType[] = [
  "licence",
  "id_match",
  "phone",
  "pan_card",
  "payout_account",
  "first_aid",
];

export function checkLabel(t: string): string {
  return (CHECK_LABELS as Record<string, string>)[t] ?? t;
}

/**
 * Check outcomes. `not_required` is the office saying "we looked, this one
 * does not apply to this guide" — which is a different fact from "we have not
 * got to it yet", and the reason a fully-checked guide used to be left with
 * items sitting pending forever.
 */
export const CHECK_STATUSES = [
  "pending",
  "passed",
  "failed",
  "expired",
  "not_required",
] as const;

export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  pending: "pending",
  passed: "passed",
  failed: "failed",
  expired: "expired",
  not_required: "not needed",
};

/** Dealt with, one way or another — nothing left for the office to do. */
export function isSettled(status: string): boolean {
  return status === "passed" || status === "failed" || status === "not_required";
}

/** Counts toward "this guide is checked out". */
export function isCleared(status: string): boolean {
  return status === "passed" || status === "not_required";
}
