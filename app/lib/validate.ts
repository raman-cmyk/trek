/**
 * The checks that stop junk reaching the record.
 *
 * Insurance provider and policy number were `.trim() || null` and nothing
 * else, which is how production came to hold four "insurers" for eleven
 * bookings: "world nomads" (4), "wolrd nomads" (4), "xyz" (2), "abcd" (1).
 * Seven of those eleven are the same company, split down the middle by a
 * single transposed letter — which is exactly the case a junk-rejecting rule
 * would have waved through, because "wolrd nomads" is not junk. It is a typo,
 * and the only cure for a typo is not typing.
 *
 * House style, deliberately: no schema library (the repo has none and does not
 * want one), pure functions, plain English, and every validator returns the
 * problem or null — the idiom `manualEntryProblem` in permits.ts already uses.
 * The multi-field one returns EVERY problem rather than the first, following
 * apply-flow.ts, so somebody fixing three fields does not discover them one
 * submit at a time.
 */

import { normalisePhone } from "~/lib/apply-flow";

/**
 * The insurers that actually cover trekking above 4,000 m in Nepal with
 * helicopter evacuation.
 *
 * Not a complete list of travel insurers — a complete list would be useless.
 * These are the ones a trekker heading to Everest or Annapurna plausibly
 * holds, and the ones the office can recognise at a glance. `other` is the
 * escape hatch, because a good policy from an insurer nobody here has heard
 * of is still a good policy, and a picker that blocks it sends the trekker
 * away rather than getting us the truth.
 */
export const INSURERS: Array<{ key: string; label: string }> = [
  { key: "world_nomads", label: "World Nomads" },
  { key: "global_rescue", label: "Global Rescue" },
  { key: "ripcord", label: "Redpoint / Ripcord" },
  { key: "true_traveller", label: "True Traveller" },
  { key: "austrian_alpine", label: "Austrian Alpine Club (ÖAV)" },
  { key: "alpenverein", label: "Alpenverein / DAV" },
  { key: "safetywing", label: "SafetyWing" },
  { key: "img", label: "IMG (Global Traveler)" },
  { key: "allianz", label: "Allianz" },
  { key: "battleface", label: "battleface" },
  { key: "dan", label: "DAN (Divers Alert Network)" },
  { key: "other", label: "Other — tell us which" },
];

export const insurerLabel = (key: string): string =>
  INSURERS.find((i) => i.key === key)?.label ?? key;

export interface Problem {
  field: string;
  message: string;
}

const problem = (field: string, message: string): Problem => ({ field, message });

/**
 * Which insurer, resolved to the name we store.
 *
 * Returns the label to store, or a problem. "Other" must carry a name — an
 * "Other" with nothing beside it is the same empty field we started with.
 */
export function resolveInsurer(
  key: string | null | undefined,
  otherName: string | null | undefined,
): { ok: true; name: string } | { ok: false; problem: Problem } {
  const k = String(key ?? "").trim();
  if (!k) return { ok: false, problem: problem("provider", "Choose who your policy is with.") };
  if (!INSURERS.some((i) => i.key === k)) {
    return { ok: false, problem: problem("provider", "Choose one from the list, or Other.") };
  }
  if (k !== "other") return { ok: true, name: insurerLabel(k) };

  const name = String(otherName ?? "").trim();
  if (name.length < 2) {
    return { ok: false, problem: problem("provider_other", "Type the insurer's name.") };
  }
  if (name.length > 60) {
    return { ok: false, problem: problem("provider_other", "That is too long for an insurer's name.") };
  }
  // A name of one repeated character is somebody getting past the form.
  if (/^(.)\1*$/.test(name.replace(/\s/g, ""))) {
    return { ok: false, problem: problem("provider_other", "That does not look like an insurer.") };
  }
  return { ok: true, name };
}

/**
 * A policy number.
 *
 * Deliberately loose on shape — insurers use every convention there is — and
 * strict only about the two things that are never a real policy number: too
 * short to be one, and one character typed repeatedly.
 */
export function policyNoProblem(raw: string | null | undefined): Problem | null {
  const v = String(raw ?? "").trim();
  if (!v) return problem("policy_no", "Add the policy number.");
  if (v.length < 4) return problem("policy_no", "That is too short to be a policy number.");
  if (v.length > 40) return problem("policy_no", "That is too long to be a policy number.");
  if (!/^[A-Za-z0-9][A-Za-z0-9 \-/._]*$/.test(v)) {
    return problem("policy_no", "Use only letters, numbers and - / . _");
  }
  if (/^(.)\1*$/.test(v.replace(/[\s\-/._]/g, ""))) {
    return problem("policy_no", "That does not look like a policy number.");
  }
  return null;
}

/** Months between two dates, by calendar rather than by 30-day arithmetic. */
function monthsBetween(fromIso: string, toIso: string): number {
  const f = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const t = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  let months =
    (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth());
  if (t.getUTCDate() < f.getUTCDate()) months -= 1;
  return months;
}

/** Nepal wants six months on the passport beyond the trip. */
export const PASSPORT_MONTHS_AFTER_TRIP = 6;

export function passportExpiryProblem(
  expiryIso: string | null | undefined,
  tripEndIso: string | null | undefined,
): Problem | null {
  const e = String(expiryIso ?? "").slice(0, 10);
  if (!e) return null; // optional on the roster; only checked once given
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return problem("passport_expiry", "Give the expiry as a date.");
  }
  const end = String(tripEndIso ?? "").slice(0, 10);
  if (!end) return null;
  const months = monthsBetween(end, e);
  if (months < PASSPORT_MONTHS_AFTER_TRIP) {
    return problem(
      "passport_expiry",
      `This passport expires too soon — Nepal wants ${PASSPORT_MONTHS_AFTER_TRIP} months beyond the last day of the trek.`,
    );
  }
  return null;
}

/**
 * A phone number somebody could actually ring.
 *
 * Reuses `normalisePhone` from apply-flow rather than writing the third copy
 * of "strip the spaces and the +977" in this codebase.
 */
export function phoneProblem(raw: string | null | undefined): Problem | null {
  const v = String(raw ?? "").trim();
  if (!v) return problem("phone", "Add a phone number.");
  const digits = normalisePhone(v).replace(/\D/g, "");
  if (digits.length < 7) return problem("phone", "That is too short to be a phone number.");
  if (digits.length > 15) return problem("phone", "That is too long to be a phone number.");
  return null;
}

/** A traveller's name as it is printed on their passport. */
export function travellerNameProblem(raw: string | null | undefined): Problem | null {
  const v = String(raw ?? "").trim();
  if (v.length < 2) return problem("full_name", "Give the name as it is printed on the passport.");
  if (v.length > 80) return problem("full_name", "That is longer than a passport name.");
  if (!/[A-Za-zÀ-ɏ]/.test(v)) {
    return problem("full_name", "A name needs letters in it.");
  }
  return null;
}

/**
 * Everything wrong with an insurance submission, at once.
 *
 * All of them, not the first, so the trekker fixes the form in one pass.
 */
export function insuranceProblems(input: {
  provider?: string | null;
  providerOther?: string | null;
  policyNo?: string | null;
}): Problem[] {
  const out: Problem[] = [];
  const insurer = resolveInsurer(input.provider, input.providerOther);
  if (!insurer.ok) out.push(insurer.problem);
  const p = policyNoProblem(input.policyNo);
  if (p) out.push(p);
  return out;
}
