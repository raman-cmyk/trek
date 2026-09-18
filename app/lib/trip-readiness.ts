/**
 * Is this trip ready to walk?
 *
 * The booking page could tell you a dozen separate facts — a status, two
 * documents, a permit list, a TIMS row, a contract, a payment total — and
 * never the one thing the office actually wants at eight in the morning:
 * what is still in the way, and who has to move.
 *
 * So: one list of the steps that have to be true before anybody sets off,
 * each owned by exactly one of the three people who can act on it. "Blocked"
 * is not a mood — it means this step cannot be started until an earlier one
 * is done, and saying so stops the office chasing a trekker for a passport
 * on a trip that has not been paid for.
 *
 * Pure, so the bar, the badges and the chase list cannot disagree with each
 * other, and so every rule here is testable without a database.
 */

import { permitProgress, trackFor } from "~/lib/pipeline";

/** Who has to do something about this step. */
export type StepOwner = "client" | "guide" | "office";

export type StepState = "done" | "open" | "blocked" | "overdue";

export interface ReadinessStep {
  key: string;
  label: string;
  owner: StepOwner;
  state: StepState;
  /** What is actually missing, in the words the office would use. */
  detail: string;
  /** The day this has to be true by, when there is one. */
  dueOn?: string | null;
}

export interface Readiness {
  steps: ReadinessStep[];
  /** Done ÷ steps that count, 0–100. Blocked steps count as not done. */
  percent: number;
  doneCount: number;
  total: number;
  /** The steps somebody has to act on, worst first. */
  outstanding: ReadinessStep[];
  /** Anything whose date has already gone. */
  overdue: ReadinessStep[];
}

export interface ReadinessInput {
  status?: string | null;
  kind?: string | null;
  startDate?: string | null;
  partySize?: number | null;
  /** Nothing left for the trekker to pay. */
  paidUp: boolean;
  /** Whatever the client still owes, and by when. */
  outstandingUsdCents: number;
  paymentDueOn?: string | null;
  documents: Array<{
    type: string;
    traveller_id?: string | null;
    verified_at?: string | null;
    rejected_at?: string | null;
    superseded_at?: string | null;
  }>;
  /** The named party (0099). Papers are counted per person, not per booking. */
  travellers?: Array<{ id: string; full_name: string }>;
  insuranceVerifiedAt?: string | null;
  insuranceAttestedAt?: string | null;
  permits: Array<{ status?: string | null }>;
  timsStatus?: string | null;
  contractStatus?: string | null;
  meetingPoint?: string | null;
  /** Gear, hotels, transport — anything the office still has to book or pay. */
  arrangements: Array<{ status?: string | null; due_on?: string | null; title?: string | null }>;
  /** Has the guide been given anything up front? */
  guideAdvancePaid: boolean;
  todayIso: string;
}

const DAY = 86_400_000;
const midnight = (iso: string) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);

function isPast(dueOn: string | null | undefined, todayIso: string): boolean {
  if (!dueOn) return false;
  return midnight(dueOn) < midnight(todayIso);
}

/**
 * How many of the party still owe this document, and how many we are holding
 * but have not checked.
 *
 * Counted per person. It used to be `some(type && verified)`, which said
 * "Passport checked" on a party of four the moment one of them uploaded one —
 * the same reading of the same data that let `docsSettled` confirm a booking
 * on one passport (0099).
 */
function paperCount(
  input: ReadinessInput,
  type: string,
): { need: number; missing: number; waiting: number } {
  const live = input.documents.filter((d) => !d.rejected_at && !d.superseded_at);
  const travellers = input.travellers ?? [];

  // No roster yet: fall back to the head count, and treat every live document
  // of this type as one person's. A booking with nobody named is not ready,
  // and the roster step below is what says so.
  if (travellers.length === 0) {
    const need = Math.max(1, Number(input.partySize ?? 1));
    const mine = live.filter((d) => d.type === type);
    const verified = mine.filter((d) => d.verified_at).length;
    return {
      need,
      missing: Math.max(0, need - mine.length),
      waiting: mine.length - verified,
    };
  }

  let missing = 0;
  let waiting = 0;
  for (const t of travellers) {
    const doc = live.find((d) => d.traveller_id === t.id && d.type === type);
    if (!doc) missing++;
    else if (!doc.verified_at) waiting++;
  }
  return { need: travellers.length, missing, waiting };
}

/** Passports we do not yet hold, checked, for everybody going. */
function passportsOutstanding(input: ReadinessInput): number {
  const c = paperCount(input, "passport");
  return c.missing + c.waiting;
}

export function tripReadiness(input: ReadinessInput): Readiness {
  const {
    status,
    kind,
    paidUp,
    outstandingUsdCents,
    paymentDueOn,
    documents,
    permits,
    timsStatus,
    contractStatus,
    meetingPoint,
    arrangements,
    todayIso,
  } = input;

  const cancelled = String(status ?? "").startsWith("cancelled");
  // Which steps this kind of trip even has. A momo crawl has no permits and
  // collects no passport, and a track with steps it will never reach is a
  // track that tells you nothing (pipeline.ts makes the same distinction).
  const track = trackFor(kind).map((s) => s.key);
  const needsPapers = track.includes("papers");
  const needsPermits = track.includes("permits");

  const steps: ReadinessStep[] = [];

  // ── The client ────────────────────────────────────────────────────────
  const paymentOverdue = !paidUp && isPast(paymentDueOn, todayIso);
  steps.push({
    key: "paid",
    label: "Paid in full",
    owner: "client",
    state: paidUp ? "done" : paymentOverdue ? "overdue" : "open",
    detail: paidUp
      ? "Nothing owed."
      : `${(outstandingUsdCents / 100).toFixed(2)} USD still to come.`,
    dueOn: paidUp ? null : (paymentDueOn ?? null),
  });

  if (needsPapers) {
    // Papers are asked for once money has moved. Chasing a passport for a
    // trip nobody has paid a deposit on is how the office wastes its morning.
    const moneyStarted = paidUp || outstandingUsdCents === 0 || status !== "pending_deposit";
    // Who is walking, by name. Permits are filed against these names, so an
    // unnamed party is not a party we can take anywhere.
    const named = (input.travellers ?? []).length;
    const partySize = Math.max(1, Number(input.partySize ?? 1));
    steps.push({
      key: "roster",
      label: "Everyone named",
      owner: "client",
      state: named >= partySize ? "done" : moneyStarted ? "open" : "blocked",
      detail:
        named >= partySize
          ? partySize === 1
            ? "One trekker, named."
            : `All ${partySize} named.`
          : `${named} of ${partySize} named — the permit counter reads these names.`,
    });

    const passports = paperCount(input, "passport");
    const passportIn = passports.missing === 0 && passports.waiting === 0 && named >= partySize;
    steps.push({
      key: "passport",
      label: partySize === 1 ? "Passport checked" : `Passports checked (${passports.need - passports.missing - passports.waiting}/${passports.need})`,
      owner: "client",
      state: passportIn ? "done" : moneyStarted ? "open" : "blocked",
      detail: passportIn
        ? "Verified."
        : !moneyStarted
          ? "Waiting on the deposit first."
          : passports.missing > 0
            ? `${passports.missing} still to upload.`
            : passports.waiting > 0
              ? `${passports.waiting} uploaded, waiting for the office to check.`
              : "Nothing uploaded.",
    });

    const certs = paperCount(input, "insurance");
    // The booking-level attestation is the policy check, not the certificate;
    // both have to be in before this is done.
    const certsIn = certs.missing === 0 && certs.waiting === 0 && named >= partySize;
    const insuranceIn = certsIn && !!input.insuranceVerifiedAt;
    steps.push({
      key: "insurance",
      label: "Insurance verified",
      owner: "client",
      state: insuranceIn ? "done" : moneyStarted ? "open" : "blocked",
      detail: insuranceIn
        ? "Cover checked."
        : !moneyStarted
          ? "Waiting on the deposit first."
          : certs.missing > 0
            ? `${certs.missing} certificate${certs.missing === 1 ? "" : "s"} still to upload.`
            : certs.waiting > 0
              ? `${certs.waiting} waiting for the office to check.`
              : input.insuranceAttestedAt
                ? "Declared, not yet checked by the office."
                : "Not run through the checker.",
    });
  }

  // ── The guide ─────────────────────────────────────────────────────────
  steps.push({
    key: "contract",
    label: "Guide contract signed",
    owner: "guide",
    state: contractStatus === "signed" ? "done" : contractStatus ? "open" : "open",
    detail:
      contractStatus === "signed"
        ? "Signed by both."
        : contractStatus
          ? `Generated, ${contractStatus}.`
          : "Not generated yet.",
  });

  // ── The office ────────────────────────────────────────────────────────
  if (needsPermits) {
    const progress = permitProgress(permits);
    steps.push({
      key: "permits",
      label: "Permits issued",
      owner: "office",
      // A rejected permit is not merely "open": it is the most urgent thing
      // on the page and reads as overdue whatever the calendar says.
      state:
        progress === "issued"
          ? "done"
          : progress === "problem"
            ? "overdue"
            : passportsOutstanding(input) > 0
              ? "blocked"
              : "open",
      detail:
        progress === "issued"
          ? "In the office."
          : progress === "problem"
            ? "One was rejected — deal with this first."
            : progress === "filed"
              ? "Filed, waiting on the counter."
              : permits.length === 0
                ? "No application started."
                : "Waiting on the trekker's papers.",
    });

    steps.push({
      key: "tims",
      label: "TIMS card issued",
      owner: "office",
      state:
        timsStatus === "issued"
          ? "done"
          : input.insuranceVerifiedAt
            ? "open"
            : "blocked",
      detail:
        timsStatus === "issued"
          ? "Issued."
          : input.insuranceVerifiedAt
            ? "Ready to issue."
            : "Insurance has to be verified first (2026 rule).",
    });
  }

  // Everything the office books that is not the guide. One step, because the
  // office does not want eight rows telling it the same thing.
  const live = arrangements.filter((a) => a.status !== "cancelled");
  const unbooked = live.filter((a) => a.status === "to_book");
  const unpaid = live.filter((a) => a.status === "booked");
  const overdueVendor = live.find((a) => a.status !== "paid" && isPast(a.due_on, todayIso));
  if (live.length > 0) {
    steps.push({
      key: "arrangements",
      label: "Gear, hotels and transport",
      owner: "office",
      state: overdueVendor
        ? "overdue"
        : unbooked.length === 0 && unpaid.length === 0
          ? "done"
          : "open",
      detail: overdueVendor
        ? `${overdueVendor.title ?? "A vendor"} was due to be paid.`
        : unbooked.length > 0
          ? `${unbooked.length} still to book${unpaid.length ? `, ${unpaid.length} to pay` : ""}.`
          : unpaid.length > 0
            ? `${unpaid.length} booked, not yet paid.`
            : "All booked and paid.",
      dueOn: overdueVendor?.due_on ?? null,
    });
  }

  // Where to meet matters most where there is no itinerary to fall back on.
  if (!needsPapers) {
    steps.push({
      key: "meeting",
      label: "Meeting point sent",
      owner: "office",
      state: meetingPoint ? "done" : "open",
      detail: meetingPoint ? meetingPoint : "The trekker has not been told where to be.",
    });
  }

  const doneCount = steps.filter((s) => s.state === "done").length;
  const total = steps.length;
  return {
    steps,
    doneCount,
    total,
    percent: total === 0 ? 100 : Math.round((doneCount / total) * 100),
    // Overdue first, then what can actually be moved, then what is waiting on
    // something else — which is the order somebody would work the list in.
    outstanding: cancelled
      ? []
      : steps
          .filter((s) => s.state !== "done")
          .sort((a, b) => rank(a.state) - rank(b.state)),
    overdue: cancelled ? [] : steps.filter((s) => s.state === "overdue"),
  };
}

function rank(state: StepState): number {
  return state === "overdue" ? 0 : state === "open" ? 1 : 2;
}

/** How the three parties' outstanding steps split up, for a per-owner badge. */
export function byOwner(r: Readiness): Record<StepOwner, ReadinessStep[]> {
  const out: Record<StepOwner, ReadinessStep[]> = { client: [], guide: [], office: [] };
  for (const s of r.outstanding) out[s.owner].push(s);
  return out;
}

export const OWNER_LABEL: Record<StepOwner, string> = {
  client: "Trekker",
  guide: "Guide",
  office: "Office",
};

/** Days until a step is due; negative once it has gone by. */
export function daysUntil(dueOn: string | null | undefined, todayIso: string): number | null {
  if (!dueOn) return null;
  return Math.round((midnight(dueOn) - midnight(todayIso)) / DAY);
}
