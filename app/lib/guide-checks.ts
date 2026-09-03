/**
 * The verification checks the office runs on a guide.
 *
 * One list. The labels were duplicated verbatim in two ops routes and the
 * starting set was a third copy in the application form, so adding a check
 * type meant remembering three files.
 *
 * Keep in step with the CHECK on guide_verifications.check_type (0001).
 */

export const CHECK_TYPES = [
  "licence",
  "id_match",
  "phone",
  "payout_account",
  "reference_1",
  "reference_2",
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
  payout_account: "Payout account",
  reference_1: "Reference call 1",
  reference_2: "Reference call 2",
  police_cert: "Police clearance",
  first_aid: "Wilderness first-aid cert",
  altitude_training: "Altitude training",
  insurance: "Insurance",
};

/**
 * What a new application starts with. The other four are added by hand when
 * the office decides a particular guide needs them.
 */
export const PENDING_CHECKS: readonly CheckType[] = [
  "licence",
  "id_match",
  "phone",
  "payout_account",
  "reference_1",
  "first_aid",
];

export function checkLabel(t: string): string {
  return (CHECK_LABELS as Record<string, string>)[t] ?? t;
}
