/**
 * The people actually going on the trip, and what each of them still owes us.
 *
 * `party_size` is an integer, and until 0099 that integer was the only record
 * of who was walking. Every document upload asked "whose is it?" as free text,
 * typed fresh each time, so production ended up with one party of 1 carrying
 * three passports and three insurance files under the names "xyz", "XYZ" and
 * "INS" — and with a confirmation rule that could not tell any of that apart.
 *
 * The rule this module replaces was `liveDocs(docs).every(verified)`. Read
 * closely, it never looked at the document TYPE and never looked at how many
 * people were going, so **one verified passport and no insurance whatsoever
 * confirmed a booking for six people** — and confirming fires the permit
 * trigger (0013). Everything here exists to make that sentence false.
 *
 * Pure and tested, house style: validators return the problem or null, and the
 * multi-field one returns EVERY problem rather than the first.
 */

import { liveDocs, type ReviewedDoc } from "~/lib/doc-review";
import { travellerNameProblem, type Problem } from "~/lib/validate";

/** The document types a traveller has to produce before a trek confirms. */
export const REQUIRED_DOC_TYPES = ["passport", "insurance"] as const;
export type RequiredDocType = (typeof REQUIRED_DOC_TYPES)[number];

export const DOC_LABEL: Record<RequiredDocType, string> = {
  passport: "passport",
  insurance: "insurance certificate",
};

export interface Traveller {
  id: string;
  full_name: string;
  is_lead?: boolean | null;
  passport_expiry?: string | null;
}

export interface TravellerDoc extends ReviewedDoc {
  traveller_id?: string | null;
  type?: string | null;
}

/**
 * Everything wrong with the roster, at once.
 *
 * `partySize` is the promise the booking made: four people paid for, four
 * names owed. A roster that is short is not an error the trekker made — it is
 * the work that is left — so the message counts out loud rather than scolding.
 */
export function rosterProblems(
  travellers: Traveller[],
  partySize: number,
): Problem[] {
  const out: Problem[] = [];
  const size = Math.max(1, Math.floor(partySize || 1));

  travellers.forEach((t, i) => {
    const p = travellerNameProblem(t.full_name);
    // Which row, so a roster of four says which of the four is wrong.
    if (p) out.push({ field: `full_name:${t.id || i}`, message: p.message });
  });

  const seen = new Set<string>();
  for (const t of travellers) {
    const key = t.full_name.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      out.push({
        field: `full_name:${t.id}`,
        message: `${t.full_name.trim()} is on the list twice.`,
      });
    }
    seen.add(key);
  }

  if (travellers.length < size) {
    const short = size - travellers.length;
    out.push({
      field: "roster",
      message:
        short === 1
          ? "One more name to go — we need everybody who is walking."
          : `${short} more names to go — we need everybody who is walking.`,
    });
  }
  if (travellers.length > size) {
    out.push({
      field: "roster",
      message: `This trip is booked for ${size}. Remove a name, or tell us the party has grown.`,
    });
  }

  const leads = travellers.filter((t) => t.is_lead).length;
  if (travellers.length > 0 && leads === 0) {
    out.push({ field: "is_lead", message: "Say who we call first if something happens." });
  }
  if (leads > 1) {
    out.push({ field: "is_lead", message: "Only one person can be the lead traveller." });
  }

  return out;
}

/** Is the roster itself finished — right number of people, all named? */
export function rosterComplete(travellers: Traveller[], partySize: number): boolean {
  return rosterProblems(travellers, partySize).length === 0 && travellers.length > 0;
}

export interface Owed {
  traveller: Traveller;
  /** Nothing uploaded at all, or the last one was sent back. */
  missing: RequiredDocType[];
  /** Uploaded, waiting on the office. */
  pending: RequiredDocType[];
}

/**
 * Who still owes what.
 *
 * A rejected document is not a document: re-uploading inserts a new row rather
 * than replacing the old one, so counting rejections would keep a booking
 * unconfirmable no matter what the trekker sent afterwards.
 */
export function missingDocs(travellers: Traveller[], docs: TravellerDoc[]): Owed[] {
  const live = liveDocs(docs);
  return travellers.map((t) => {
    const mine = live.filter((d) => d.traveller_id === t.id);
    const missing: RequiredDocType[] = [];
    const pending: RequiredDocType[] = [];
    for (const type of REQUIRED_DOC_TYPES) {
      const doc = mine.find((d) => d.type === type);
      if (!doc) missing.push(type);
      else if (!doc.verified_at) pending.push(type);
    }
    return { traveller: t, missing, pending };
  });
}

/**
 * The confirmation rule: every named traveller has a verified passport AND a
 * verified insurance certificate, and the roster covers the whole party.
 *
 * This is the function `docsSettled` should always have been. It is not in
 * doc-review.ts because it needs the roster, and doc-review.ts is about the
 * verdict on a single document rather than about who is going.
 */
export function documentsComplete(input: {
  travellers: Traveller[];
  docs: TravellerDoc[];
  partySize: number;
}): boolean {
  if (!rosterComplete(input.travellers, input.partySize)) return false;
  return missingDocs(input.travellers, input.docs).every(
    (o) => o.missing.length === 0 && o.pending.length === 0,
  );
}

/** One line for the trip page: "Waiting on Ang Dorje's insurance certificate." */
export function owedSummary(owed: Owed[]): string | null {
  const bits: string[] = [];
  for (const o of owed) {
    const all = [...o.missing, ...o.pending];
    if (all.length === 0) continue;
    bits.push(`${o.traveller.full_name} (${all.map((t) => DOC_LABEL[t]).join(" and ")})`);
  }
  if (bits.length === 0) return null;
  return `Still to come: ${bits.join(", ")}.`;
}
