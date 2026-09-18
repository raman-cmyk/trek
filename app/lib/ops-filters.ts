import { allOf, type StatusFilter } from "~/lib/status-filter";

/**
 * Every status filter in the console, in one file.
 *
 * Each list also carries the full vocabulary its table allows, taken from the
 * check constraint in the migration. The two are asserted against each other
 * in the tests: a status added to the database and not to a filter would
 * otherwise appear under All and nowhere else — invisible to anyone working
 * through a tab, and invisible to a code review that only read one of the two
 * files.
 */

/* ── Guides (0001) ──────────────────────────────────────────────────────── */
export const GUIDE_STATUSES = ["applied", "in_review", "verified", "suspended", "removed"];

// Verification is a queue and these are the questions asked of it. Suspended
// and removed share a tab: both mean "not taking trips", and two tabs holding
// one guide each is worse than one holding two.
export const GUIDE_FILTERS: StatusFilter[] = [
  allOf(),
  { key: "applied", label: "Applied", statuses: ["applied"] },
  { key: "in_review", label: "In review", statuses: ["in_review"] },
  { key: "verified", label: "Verified", statuses: ["verified"] },
  { key: "off", label: "Suspended or removed", statuses: ["suspended", "removed"] },
];

/* ── Experiences (0002 + 0043) ──────────────────────────────────────────── */
export const OFFERING_STATUSES = ["draft", "pending", "live", "paused"];

export const OFFERING_FILTERS: StatusFilter[] = [
  allOf(),
  // The only one that is somebody's turn to act, so it leads.
  { key: "pending", label: "Waiting on us", statuses: ["pending"] },
  { key: "live", label: "Live", statuses: ["live"] },
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "paused", label: "Paused", statuses: ["paused"] },
];

/* ── Group trips (0040) ─────────────────────────────────────────────────── */
export const EVENT_STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "review",
  "live",
  "declined",
  "cancelled",
];

export const EVENT_FILTERS: StatusFilter[] = [
  allOf(),
  // Submitted and review are both "on our desk"; an organiser cannot tell them
  // apart and neither should the queue.
  { key: "waiting", label: "Waiting on us", statuses: ["submitted", "review"] },
  { key: "accepted", label: "Accepted", statuses: ["accepted"] },
  { key: "live", label: "Live", statuses: ["live"] },
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "closed", label: "Declined or cancelled", statuses: ["declined", "cancelled"] },
];

/* ── Journals (0032) ────────────────────────────────────────────────────── */
export const JOURNAL_STATUSES = ["draft", "published"];

export const JOURNAL_FILTERS: StatusFilter[] = [
  allOf(),
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "published", label: "Published", statuses: ["published"] },
];

/* ── Routes (0046) ──────────────────────────────────────────────────────── */
export const ROUTE_STATUSES = ["pending", "live", "rejected"];

export const ROUTE_FILTERS: StatusFilter[] = [
  allOf(),
  { key: "pending", label: "Proposed", statuses: ["pending"] },
  { key: "live", label: "Live", statuses: ["live"] },
  { key: "rejected", label: "Sent back", statuses: ["rejected"] },
];

/* ── Incidents (0005) ───────────────────────────────────────────────────── */
export const INCIDENT_STATUSES = ["open", "monitoring", "closed"];

export const INCIDENT_FILTERS: StatusFilter[] = [
  allOf(),
  { key: "open", label: "Open", statuses: ["open"] },
  { key: "monitoring", label: "Monitoring", statuses: ["monitoring"] },
  { key: "closed", label: "Closed", statuses: ["closed"] },
];

/* ── Permits (0003) ─────────────────────────────────────────────────────── */
export const PERMIT_APP_STATUSES = ["awaiting_docs", "filed", "approved", "ready", "rejected"];

export const PERMIT_FILTERS: StatusFilter[] = [
  allOf(),
  { key: "awaiting", label: "Awaiting documents", statuses: ["awaiting_docs"] },
  // Filed and approved are one question — sent off and not back yet.
  { key: "in_flight", label: "With the department", statuses: ["filed", "approved"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
];


/* ── Trekker documents (0003 + 0073) ────────────────────────────────────
   Not a column: `docState()` derives these three from verified_at and
   rejected_at, which is why the vocabulary is spelled out here rather than
   read off a check constraint. */
export const DOC_REVIEW_STATUSES = ["pending", "verified", "rejected"];

export const DOC_FILTERS: StatusFilter[] = [
  allOf(),
  // The only one that is somebody's turn to act, so it leads.
  { key: "pending", label: "Waiting on us", statuses: ["pending"] },
  { key: "verified", label: "Verified", statuses: ["verified"] },
  { key: "rejected", label: "Sent back", statuses: ["rejected"] },
];

/* ── Cancellations ──────────────────────────────────────────────────────
   Filtered on `cancellation_reason`, never on status. `nonpayment` is mapped
   onto `cancelled_trekker` by cancelBooking, so status tabs would tell the
   office that trekkers cancelled trips they never touched. */

export const CANCELLATION_REASONS = [
  "trekker",
  "guide",
  "nonpayment",
  "hold_expired",
  "force_majeure",
  // A real answer: a trip cancelled by some path that wrote no reason. After
  // 0108 this tab should read zero, and a number in it is the sign of a cancel
  // path that does not go through cancelBooking.
  "",
];

export const CANCELLATION_FILTERS: StatusFilter[] = [
  allOf(),
  { key: "trekker", label: "Trekker cancelled", statuses: ["trekker"] },
  { key: "guide", label: "Guide pulled out", statuses: ["guide"] },
  { key: "nonpayment", label: "Not paid in time", statuses: ["nonpayment", "hold_expired"] },
  { key: "force_majeure", label: "Force majeure", statuses: ["force_majeure"] },
  { key: "unrecorded", label: "No reason recorded", statuses: [""] },
];

/** Every pairing, for the test that keeps filters and vocabularies together. */
export const ALL_FILTER_SETS: Array<{
  name: string;
  statuses: string[];
  filters: StatusFilter[];
}> = [
  { name: "guides", statuses: GUIDE_STATUSES, filters: GUIDE_FILTERS },
  { name: "experiences", statuses: OFFERING_STATUSES, filters: OFFERING_FILTERS },
  { name: "group trips", statuses: EVENT_STATUSES, filters: EVENT_FILTERS },
  { name: "journals", statuses: JOURNAL_STATUSES, filters: JOURNAL_FILTERS },
  { name: "routes", statuses: ROUTE_STATUSES, filters: ROUTE_FILTERS },
  { name: "incidents", statuses: INCIDENT_STATUSES, filters: INCIDENT_FILTERS },
  { name: "permits", statuses: PERMIT_APP_STATUSES, filters: PERMIT_FILTERS },
  { name: "trekker documents", statuses: DOC_REVIEW_STATUSES, filters: DOC_FILTERS },
  { name: "cancellations", statuses: CANCELLATION_REASONS, filters: CANCELLATION_FILTERS },
];
