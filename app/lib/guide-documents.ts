/**
 * The kinds of paper the office collects from a guide.
 *
 * Shared, not server-only: the upload form and the file list render these
 * names, while the server validates against the same list. One place, so a
 * kind can never be offered in the form and rejected on save.
 *
 * Keep in step with the `kind` CHECK on guide_documents (migration 0048).
 */
export const GUIDE_DOC_KINDS = [
  "licence",
  "id_card",
  "passport",
  "police_cert",
  "first_aid",
  "altitude_training",
  "insurance",
  "payout_proof",
  "reference_letter",
  "other",
] as const;

export type GuideDocKind = (typeof GUIDE_DOC_KINDS)[number];

export const GUIDE_DOC_LABELS: Record<GuideDocKind, string> = {
  licence: "Trekking licence",
  id_card: "Government ID",
  passport: "Passport",
  police_cert: "Police clearance",
  first_aid: "First-aid certificate",
  altitude_training: "Altitude training",
  insurance: "Insurance",
  payout_proof: "Payout account proof",
  reference_letter: "Reference letter",
  other: "Other",
};
