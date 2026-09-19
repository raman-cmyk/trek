import { needsLicence } from "~/lib/guide-licence";
/**
 * The order a guide is asked things in.
 *
 * The old page was one long form: name, phone, email, password, licence
 * number, licence photo, citizenship photo, emergency contact, then — last,
 * once you had already handed over your ID — the interesting part about your
 * work. Read as a conversation, it opens by asking a stranger for their
 * citizenship card and closes by mentioning what they might earn.
 *
 * A licensed guide in Kathmandu arrives with four fears: is this another
 * agency taking my cut, will my citizenship card be misused, will I actually
 * get bookings, is there a real person behind this. Every one of those has to
 * be answered before the sensitive fields, not after. So the order is:
 * easy and exciting first, official in the middle, private last.
 *
 * The flow is client-side on purpose. Every field lives in one form and only
 * the current step is shown, so there is exactly one submit at the end and
 * `action` stays the single place that validates and creates anything — no
 * half-made guide rows from an abandoned step three, and no round trip on a
 * 3G connection between each screen.
 */

export type StepId = "intro" | "you" | "work" | "licence" | "id" | "review";

export interface Step {
  id: StepId;
  /** 0 for the intro, then 1..5 — what the progress trail counts. */
  index: number;
  /** Mono label on the trail. Absent on the intro, which is not a step. */
  label: string | null;
  /** The form fields this step owns, for per-step validation. */
  fields: string[];
}

export const STEPS: Step[] = [
  { id: "intro", index: 0, label: null, fields: [] },
  { id: "you", index: 1, label: "YOU", fields: ["full_name", "phone", "email", "password"] },
  {
    id: "work",
    index: 2,
    label: "YOUR WORK",
    fields: ["guide_kinds", "years_experience", "day_rate_npr", "languages", "regions", "routes_walked", "hook_line"],
  },
  {
    id: "licence",
    index: 3,
    label: "LICENCE",
    fields: ["licence_no", "licence_expiry", "licence_photo", "home_district"],
  },
  {
    id: "id",
    index: 4,
    label: "ID",
    fields: ["id_photo", "emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone", "emergency_contact_email"],
  },
  { id: "review", index: 5, label: "REVIEW", fields: ["heard_about", "heard_about_detail"] },
];

/** The five that carry a number on the trail. The intro is not one of them. */
export const NUMBERED = STEPS.filter((s) => s.index > 0);

export function stepAt(index: number): Step {
  return STEPS.find((s) => s.index === index) ?? STEPS[0];
}

export function stepById(id: StepId): Step {
  return STEPS.find((s) => s.id === id) ?? STEPS[0];
}

/**
 * Nothing private before step 4.
 *
 * A citizenship card and somebody's next of kin are the two things on this
 * form that a person has to trust us with, and they belong after the page has
 * earned it. Asserted in a test rather than left as a comment, because the
 * easy mistake when adding a field later is to put it on the first screen
 * that has room.
 */
export const SENSITIVE_FIELDS = [
  "id_photo",
  "emergency_contact_name",
  "emergency_contact_relationship",
  "emergency_contact_phone",
  "emergency_contact_email",
];

export const FIRST_SENSITIVE_STEP = 4;

export interface Problem {
  field: string;
  /**
   * A key, so the same problem can be said in Nepali. See apply-copy.
   * Codes rather than strings because this module has no business holding
   * two languages, and a bilingual error that falls back to English is the
   * one a guide most needs to read.
   */
  code: ProblemCode;
  /** Plain English words. Never "invalid input". */
  message: string;
}

export type ProblemCode =
  | "name_missing"
  | "phone_missing"
  | "phone_digits"
  | "phone_short"
  | "phone_long"
  | "email_bad"
  | "password_short"
  | "years_range"
  | "rate_missing"
  | "rate_bad"
  | "licence_no_missing"
  | "licence_expiry_missing"
  | "district_missing"
  | "kinds_missing"
  | "emergency_name_missing"
  | "emergency_phone_missing"
  | "heard_missing";

/** A Nepali mobile number, once the spacing and the country code are gone. */
export function normalisePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, "").replace(/^\+?977/, "");
}

/**
 * What is wrong with this step, in the applicant's own terms.
 *
 * Returns every problem rather than the first, so a guide fixing three fields
 * does not discover them one submit at a time. Nothing here clears a value —
 * a validator that empties the field it rejected is how people give up.
 */
export function validateStep(
  step: StepId,
  values: Record<string, string>,
  opts: { requirePassword?: boolean } = {},
): Problem[] {
  const out: Problem[] = [];
  const v = (k: string) => (values[k] ?? "").trim();

  if (step === "you") {
    if (!v("full_name")) {
      out.push({ field: "full_name", code: "name_missing", message: "We need the name printed on your licence." });
    }
    const phone = normalisePhone(v("phone"));
    if (!phone) {
      out.push({ field: "phone", code: "phone_missing", message: "A phone number we can reach you on." });
    } else if (!/^\d+$/.test(phone)) {
      out.push({ field: "phone", code: "phone_digits", message: "Digits only — no letters." });
    } else if (phone.length < 10) {
      out.push({ field: "phone", code: "phone_short", message: "This number looks short — Nepali mobiles have 10 digits." });
    } else if (phone.length > 10) {
      out.push({ field: "phone", code: "phone_long", message: "This number looks long — Nepali mobiles have 10 digits." });
    }
    if (!/.+@.+\..+/.test(v("email"))) {
      out.push({ field: "email", code: "email_bad", message: "An email address you can open." });
    }
    if (opts.requirePassword !== false && (values.password ?? "").length < 8) {
      out.push({ field: "password", code: "password_short", message: "Eight characters or more, so nobody else can get in." });
    }
  }

  if (step === "work") {
    // What they will actually run, asked before the licence step, because it
    // decides which licence that step asks for — a momo host has no reason
    // to hold a trekking card, and a heritage walk needs a different one.
    if (splitRepeated(v("guide_kinds")).length === 0) {
      out.push({
        field: "guide_kinds",
        code: "kinds_missing",
        message: "Tick what you will take people on. It decides which papers we ask you for.",
      });
    }
    const years = Number(v("years_experience"));
    if (v("years_experience") && (!Number.isFinite(years) || years < 0 || years > 60)) {
      out.push({ field: "years_experience", code: "years_range", message: "Years guiding — a number between 0 and 60." });
    }
    const rate = Number(v("day_rate_npr"));
    if (!v("day_rate_npr")) {
      out.push({ field: "day_rate_npr", code: "rate_missing", message: "What you charge for a day's work, in rupees." });
    } else if (!Number.isFinite(rate) || rate <= 0) {
      out.push({ field: "day_rate_npr", code: "rate_bad", message: "A daily rate in rupees — digits only." });
    }
  }

  if (step === "licence") {
    // Only asked of the guides whose work needs it (app/lib/guide-licence.ts).
    // The district is asked of everybody: it is where they are from, not a
    // licence detail, and it is how the office groups people.
    if (needsLicence(splitRepeated(v("guide_kinds")))) {
      if (!v("licence_no")) {
        out.push({ field: "licence_no", code: "licence_no_missing", message: "Your licence number — it is the first thing we check." });
      }
      if (!v("licence_expiry")) {
        out.push({ field: "licence_expiry", code: "licence_expiry_missing", message: "The date on your licence card." });
      }
    }
    if (!v("home_district")) {
      out.push({ field: "home_district", code: "district_missing", message: "The district you are from." });
    }
  }

  if (step === "id") {
    if (!v("emergency_contact_name")) {
      out.push({ field: "emergency_contact_name", code: "emergency_name_missing", message: "One person we can call if something happens to you." });
    }
    if (!normalisePhone(v("emergency_contact_phone"))) {
      out.push({ field: "emergency_contact_phone", code: "emergency_phone_missing", message: "A number for that person." });
    }
  }

  if (step === "review") {
    if (!v("heard_about")) {
      out.push({ field: "heard_about", code: "heard_missing", message: "Pick how you heard about us." });
    }
  }

  return out;
}

/** Whether this step lets the applicant move on. */
export function canAdvance(step: StepId, values: Record<string, string>, opts = {}): boolean {
  return validateStep(step, values, opts).length === 0;
}

/**
 * Where to resume.
 *
 * A saved step is only honoured if the steps before it still validate — a
 * draft that was saved on step four and then had its name cleared should open
 * where the work actually is, not at the screen after it.
 */
export function resumeAt(saved: number | null | undefined, values: Record<string, string>): number {
  const wanted = Math.max(0, Math.min(NUMBERED.length, Number(saved) || 0));
  for (const s of NUMBERED) {
    if (s.index >= wanted) break;
    // The password is never written to the draft — a half-filled application
    // sitting in localStorage is not the place for it — so a resumed draft
    // can never satisfy the password rule, and requiring it here sent every
    // returning applicant back to step one with their work still on screen.
    // It is checked when they submit, which is the only moment it matters.
    if (!canAdvance(s.id, values, { requirePassword: false })) return s.index;
  }
  return wanted;
}

/* ── Fields that can appear more than once in one form ───────────────────── */

/**
 * Names the browser may send several times over.
 *
 * `FormData.entries()` yields one pair per ticked box, so code that assigns
 * `out[name] = value` in a loop keeps only the last. That is what happened to
 * the application draft: a guide ticked five regions, stepped away, came back
 * to one, and reasonably concluded the field meant "pick your region".
 */
export const REPEATED = new Set(["regions", "guide_kinds"]);

/** The separator. A unit separator cannot occur in a region name. */
const SEP = "\u001f";

/** Join values for storage in the flat draft record. */
export function joinRepeated(existing: string | undefined, value: string): string {
  return existing ? `${existing}${SEP}${value}` : value;
}

/** Read them back out. Tolerates a draft written before this existed. */
export function splitRepeated(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.split(SEP).filter(Boolean);
}

/**
 * The walked-trails rows out of the draft's hidden JSON field.
 *
 * Never throws: a corrupt draft should cost a guide their trail list, not the
 * whole page.
 */
export function parseWalkedDraft(raw: string | undefined | null): Array<{
  routeId: string;
  times: number;
}> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.routeId === "string" && Number.isFinite(Number(r.times)))
      .map((r) => ({ routeId: String(r.routeId), times: Math.max(1, Math.floor(Number(r.times))) }));
  } catch {
    return [];
  }
}
