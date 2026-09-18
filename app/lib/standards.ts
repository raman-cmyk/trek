/**
 * The fear, answered.
 *
 * Pratik read the homepage the way a trekker reads it and found the one thing
 * missing: the page answers "are these people any good" a dozen ways and
 * never once answers the question underneath, which is
 *
 *   "I will be fourteen days from a road with a stranger I met on the
 *    internet. What happens if something goes wrong?"
 *
 * Card hooks gesture at it — a guide who carries real medicine, a guide who
 * knows the slopes — but a hook is one person's promise and this is a
 * question about the platform. It has to be answered head-on, in the first
 * screenful, with standards rather than adjectives.
 *
 * Every line below is a thing this codebase actually does, named where it
 * does it. Nothing here is aspirational, and that is the whole point: on a
 * safety claim, the gap between "we care deeply about safety" and a list of
 * six checkable facts is the difference between marketing and a reason to
 * book.
 */
import { CHECK_LABELS, PENDING_CHECKS } from "~/lib/guide-checks";

export interface Standard {
  key: string;
  /** The standard, stated as a fact. */
  title: string;
  /** What it means in practice, and who does it. */
  detail: string;
  /** Where the full version lives. Every one of them has a page. */
  href: string;
}

/** What every application is checked for before anyone goes live. */
export function verificationChecks(): string[] {
  return PENDING_CHECKS.map((c) => CHECK_LABELS[c]);
}

/**
 * Six standards, in the order the fear unfolds.
 *
 * Before you go, while you are out there, and if it goes wrong — because that
 * is the sequence somebody imagines it in.
 */
export function standards(): Standard[] {
  return [
    {
      key: "met",
      title: "We have met them",
      detail: `Licence, government ID against that licence, phone, payout account and a wilderness first-aid certificate — ${PENDING_CHECKS.length} checks, done by a person in Kathmandu who signs and dates the file.`,
      href: "/trust",
    },
    {
      key: "insurance",
      title: "Evacuation cover is required, not suggested",
      detail:
        "High-altitude and helicopter cover, to your trek's real maximum — most standard policies stop at 3,000m. We check the policy before you leave, and say so if it falls short.",
      href: "/insurance",
    },
    {
      key: "contract",
      title: "A signed contract, and permits in your name",
      detail:
        "Every trek generates a contract we both sign, and your TIMS card and park permits are issued to you — not held by an agency on your behalf.",
      href: "/transparency",
    },
    {
      key: "checkin",
      title: "Your guide checks in every day",
      detail:
        "One short message a day from the trail. A day that does not arrive is visible to the office that evening, against the day it was due — not the day it finally came in.",
      href: "/safety",
    },
    {
      key: "contact",
      title: "Someone at home has the details",
      detail:
        "We take an emergency contact when you book, your guide carries it up with them, and the office holds it for the length of the trek.",
      href: "/safety",
    },
    {
      key: "rescue",
      title: "We earn nothing if you are flown out",
      detail:
        "Nepal has a documented problem with helicopter-evacuation kickbacks. We take no cut of a rescue flight, so nobody on our side has a reason to call one early — or to talk you out of one you need.",
      href: "/safety",
    },
  ];
}

/** The headline that names the fear rather than dancing round it. */
export const FEAR = {
  // The trekker's own words, deliberately. Softening it to "someone you met
  // online" leaves the fear intact and unaddressed; saying it back is what
  // disarms it, and it buys the right to answer in facts.
  question: "Fourteen days from a road, with a stranger you met on the internet.",
  answer: "Here is exactly what stands behind that.",
};
