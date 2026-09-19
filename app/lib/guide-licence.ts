/**
 * Which licence a guide needs, for the kind of guiding they do.
 *
 * The application asked every applicant for a trekking licence number, an
 * expiry date and a photograph of the card, and refused to go on without
 * them. The founder:
 *
 *   "I think we need to first ask what are they filling form for, because we
 *    need different licence for different things. For example, trek
 *    different; we don't need licence for day hikes and all, but anything
 *    involved with national heritage Pashupati and all should be done by
 *    licensed guides."
 *
 * So a momo-crawl host was being asked to produce a trekking licence they
 * have no reason to hold, and a heritage walk through Pashupatinath — which
 * does need a licensed guide — was being checked against the wrong card.
 *
 * THE RULE BELOW IS THE FOUNDER'S, NOT A READING OF NEPALI LAW. It is a table
 * on purpose: when the rule changes, this is the only thing that changes, and
 * it changes in one place rather than in a form, a validator, a server action
 * and a checklist.
 *
 * The vocabulary is `offerings.kind` (0002_catalog.sql) rather than a new one,
 * so what a guide says they will run and what they can then actually list are
 * the same five words end to end.
 */

import type { OfferingKind } from "~/lib/pipeline";

export type LicenceClass = "trekking" | "tour" | "none";

/** What each kind of guiding needs. */
export const LICENCE_FOR: Record<OfferingKind, LicenceClass> = {
  trek: "trekking",
  // Pashupatinath, Boudhanath, the Durbar Squares. A licensed tour guide.
  city: "tour",
  day_hike: "none",
  food_culture: "none",
  adventure: "none",
};

export const LICENCE_LABEL: Record<Exclude<LicenceClass, "none">, string> = {
  trekking: "Trekking guide licence",
  tour: "Tour guide licence",
};

/** The word for the card itself, for a placeholder or a hint. */
export const LICENCE_HINT: Record<Exclude<LicenceClass, "none">, string> = {
  trekking: "The number on your TAAN or NMA trekking guide card.",
  tour: "The number on your NTB tour guide card — the one heritage sites ask for.",
};

/**
 * The strictest licence this guide needs, given everything they said they
 * would run.
 *
 * Strictest, not "the first one": somebody who leads treks AND runs a momo
 * crawl is a trekking guide, and asking them for the lesser card because a
 * food walk happens to come first in the list would be a hole.
 */
export function licenceNeededFor(kinds: Iterable<string>): LicenceClass {
  let need: LicenceClass = "none";
  for (const k of kinds) {
    const c = LICENCE_FOR[k as OfferingKind];
    if (c === "trekking") return "trekking";
    if (c === "tour") need = "tour";
  }
  return need;
}

/** Does this set of kinds need a licence at all? */
export function needsLicence(kinds: Iterable<string>): boolean {
  return licenceNeededFor(kinds) !== "none";
}

/**
 * What to put at the top of the licence step, so a guide knows why they are
 * being asked — or why they are not.
 */
export function licenceAsk(kinds: Iterable<string>): {
  need: LicenceClass;
  heading: string;
  note: string;
} {
  const need = licenceNeededFor(kinds);
  if (need === "none") {
    return {
      need,
      heading: "No licence needed for what you run",
      note: "Day hikes, food walks and adventure days do not need a guide licence in Nepal. We still need to see who you are, on the next step.",
    };
  }
  return {
    need,
    heading: LICENCE_LABEL[need],
    note:
      need === "trekking"
        ? "Multi-day treks must be led by a licensed trekking guide, so this is the first thing we check."
        : "Heritage sites — Pashupatinath, Boudhanath, the Durbar Squares — must be led by a licensed tour guide, so this is the first thing we check.",
  };
}

/**
 * The verification checks a guide starts with, for what they say they run.
 *
 * `PENDING_CHECKS` was one flat list given to everybody. A guide who needs no
 * licence still gets the `licence` row — as `not_required` rather than
 * omitted, because the checklists tick themselves off these rows by name
 * (`syncGuideChecklist`), and an omitted row would leave "Trekking licence
 * seen" sitting open in the office's list forever with nothing able to close
 * it.
 */
export function startingChecks(kinds: Iterable<string>): Array<{
  check_type: string;
  status: "pending" | "not_required";
  notes: string | null;
}> {
  const need = licenceNeededFor(kinds);
  return [
    need === "none"
      ? {
          check_type: "licence",
          status: "not_required" as const,
          notes: "No licence class required for what this guide runs.",
        }
      : { check_type: "licence", status: "pending" as const, notes: LICENCE_LABEL[need] },
    { check_type: "id_match", status: "pending" as const, notes: null },
    { check_type: "phone", status: "pending" as const, notes: null },
    { check_type: "payout_account", status: "pending" as const, notes: null },
    { check_type: "first_aid", status: "pending" as const, notes: null },
  ];
}

/**
 * Which office checklist this guide should be run against.
 *
 * `guide_trek` and `guide_day` have existed since 0106 and have never been
 * matched automatically, because — in that migration's own words — "nothing
 * in the data says which kind of guide somebody is". Now something does.
 * These strings are the `applies_to` labels those lists already carry.
 */
export function checklistLabelFor(kinds: Iterable<string>): string {
  return licenceNeededFor(kinds) === "trekking" ? "trek guide" : "day guide";
}
