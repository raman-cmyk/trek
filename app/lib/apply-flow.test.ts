import { describe, expect, it } from "vitest";
import {
  canAdvance,
  FIRST_SENSITIVE_STEP,
  NUMBERED,
  normalisePhone,
  resumeAt,
  SENSITIVE_FIELDS,
  STEPS,
  stepAt,
  validateStep,
} from "./apply-flow";

describe("the order things are asked in", () => {
  it("has an intro that asks for nothing", () => {
    expect(STEPS[0].id).toBe("intro");
    expect(STEPS[0].fields).toEqual([]);
  });

  it("counts five steps after the intro", () => {
    expect(NUMBERED.map((s) => s.id)).toEqual(["you", "work", "licence", "id", "review"]);
    expect(NUMBERED.every((s) => s.label)).toBe(true);
  });

  it("asks about the work before the licence, and the licence before the ID", () => {
    const at = (id: string) => STEPS.find((s) => s.id === id)!.index;
    expect(at("work")).toBeLessThan(at("licence"));
    expect(at("licence")).toBeLessThan(at("id"));
  });

  it("never asks for anything private before step four", () => {
    // The whole point of the reorder. A field added later to the first screen
    // with room is the easy way to undo it, so this is a test and not a note.
    for (const f of SENSITIVE_FIELDS) {
      const step = STEPS.find((s) => s.fields.includes(f));
      expect(step, `${f} belongs to a step`).toBeTruthy();
      expect(step!.index, `${f} is not asked before step ${FIRST_SENSITIVE_STEP}`)
        .toBeGreaterThanOrEqual(FIRST_SENSITIVE_STEP);
    }
  });

  it("puts every field on exactly one step", () => {
    const all = STEPS.flatMap((s) => s.fields);
    expect(new Set(all).size).toBe(all.length);
  });

  it("falls back to the intro for an index nobody has", () => {
    expect(stepAt(99).id).toBe("intro");
    expect(stepAt(-1).id).toBe("intro");
  });
});

describe("validateStep", () => {
  const you = {
    full_name: "Pemba Sherpa",
    phone: "9812345678",
    email: "pemba@example.com",
    password: "longenough",
  };

  it("passes a filled first step", () => {
    expect(validateStep("you", you)).toEqual([]);
  });

  it("says what is short about a short phone number, in words", () => {
    const p = validateStep("you", { ...you, phone: "98123" });
    expect(p).toHaveLength(1);
    expect(p[0].message).toContain("10 digits");
  });

  it("accepts a number written with +977 and spaces", () => {
    expect(normalisePhone("+977 98-1234 5678")).toBe("9812345678");
    expect(validateStep("you", { ...you, phone: "+977 98-1234 5678" })).toEqual([]);
  });

  it("reports every problem at once, not one per submit", () => {
    const p = validateStep("you", { full_name: "", phone: "", email: "x", password: "" });
    expect(p.map((x) => x.field).sort()).toEqual(["email", "full_name", "password", "phone"]);
  });

  it("can skip the password, for a phone-first sign-in", () => {
    expect(validateStep("you", { ...you, password: "" }, { requirePassword: false })).toEqual([]);
  });

  it("wants a day rate, and only a sane one", () => {
    expect(validateStep("work", {}).map((p) => p.field)).toContain("day_rate_npr");
    expect(validateStep("work", { day_rate_npr: "nope" }).map((p) => p.field)).toContain("day_rate_npr");
    expect(validateStep("work", { day_rate_npr: "5000" })).toEqual([]);
  });

  it("does not object to years left blank, but does to sixty-one of them", () => {
    expect(validateStep("work", { day_rate_npr: "5000", years_experience: "" })).toEqual([]);
    expect(
      validateStep("work", { day_rate_npr: "5000", years_experience: "61" }).map((p) => p.field),
    ).toContain("years_experience");
  });

  it("asks for the three things printed on a licence", () => {
    expect(validateStep("licence", {}).map((p) => p.field).sort()).toEqual([
      "home_district",
      "licence_expiry",
      "licence_no",
    ]);
  });

  it("asks for one person to call", () => {
    expect(validateStep("id", {}).map((p) => p.field).sort()).toEqual([
      "emergency_name",
      "emergency_phone",
    ]);
  });

  it("never hands back a message that reads like a machine wrote it", () => {
    const messages = [
      ...validateStep("you", {}),
      ...validateStep("work", {}),
      ...validateStep("licence", {}),
      ...validateStep("id", {}),
      ...validateStep("review", {}),
    ].map((p) => p.message.toLowerCase());
    expect(messages.length).toBeGreaterThan(5);
    for (const m of messages) {
      for (const jargon of ["invalid", "required field", "must match", "regex", "null", "error:"]) {
        expect(m, m).not.toContain(jargon);
      }
      // A sentence, not a label.
      expect(m.length).toBeGreaterThan(12);
    }
  });
});

describe("canAdvance", () => {
  it("blocks on a problem and clears when it is fixed", () => {
    expect(canAdvance("licence", {})).toBe(false);
    expect(
      canAdvance("licence", {
        licence_no: "TG-1234",
        licence_expiry: "2029-05-01",
        home_district: "Solukhumbu",
      }),
    ).toBe(true);
  });
});

describe("resumeAt", () => {
  const complete = {
    full_name: "Pemba Sherpa",
    phone: "9812345678",
    email: "p@example.com",
    password: "longenough",
    day_rate_npr: "5000",
  };

  it("returns to the step the draft was left on", () => {
    expect(resumeAt(3, complete)).toBe(3);
  });

  it("walks back to the first step that no longer holds up", () => {
    // Saved on four, but the name has since been cleared.
    expect(resumeAt(4, { ...complete, full_name: "" })).toBe(1);
  });

  it("starts at the intro with no draft", () => {
    expect(resumeAt(null, {})).toBe(0);
    expect(resumeAt(undefined, {})).toBe(0);
  });

  it("does not trust a saved step past the end", () => {
    expect(resumeAt(99, complete)).toBeLessThanOrEqual(NUMBERED.length);
  });
});
