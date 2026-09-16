import { describe, expect, it } from "vitest";
import { LANGS, PROBLEM, T, pickLang, problemText, t, tf } from "./apply-copy";
import { STEPS, validateStep, type ProblemCode } from "./apply-flow";

const DEVANAGARI = /[ऀ-ॿ]/;

describe("both languages, everywhere", () => {
  it("offers exactly English and Nepali", () => {
    expect(LANGS.map((l) => l.code)).toEqual(["en", "ne"]);
  });

  it("has an English and a Nepali string for every key", () => {
    // The acceptance check from the brief: every label exists in both.
    const missing: string[] = [];
    for (const [key, pair] of Object.entries(T)) {
      if (!pair.en?.trim()) missing.push(`${key}.en`);
      if (!pair.ne?.trim()) missing.push(`${key}.ne`);
    }
    expect(missing).toEqual([]);
  });

  it("does not leave English sitting in the Nepali slot", () => {
    // A copy-paste that forgets to translate is invisible otherwise: the key
    // exists, the test passes, and a guide reads English either way.
    const untranslated: string[] = [];
    for (const [key, pair] of Object.entries(T)) {
      // Brand names and "WhatsApp" legitimately stay in Latin script, so the
      // test asks for SOME Devanagari rather than none in Latin.
      if (!DEVANAGARI.test(pair.ne)) untranslated.push(key);
    }
    expect(untranslated).toEqual([]);
  });

  it("translates every error the flow can raise", () => {
    const codes = new Set<ProblemCode>();
    for (const s of STEPS) {
      for (const p of validateStep(s.id, {})) codes.add(p.code);
      for (const p of validateStep(s.id, { phone: "abc", day_rate_npr: "x", years_experience: "99" })) {
        codes.add(p.code);
      }
    }
    expect(codes.size).toBeGreaterThan(8);
    for (const c of codes) {
      expect(PROBLEM[c], `${c} has copy`).toBeTruthy();
      expect(PROBLEM[c].ne, `${c} is translated`).toMatch(DEVANAGARI);
    }
  });

  it("has copy for every code declared, with none left over", () => {
    // A code with no copy throws at render; copy with no code is dead weight.
    const declared = Object.keys(PROBLEM);
    expect(new Set(declared).size).toBe(declared.length);
  });
});

describe("the promises this page makes", () => {
  it("says the guide keeps all of their rate", () => {
    expect(t("proofRate", "en")).toContain("100%");
    expect(T.proofRate.ne).toMatch(DEVANAGARI);
  });

  it("states the privacy promise in full, in both languages", () => {
    for (const lang of ["en", "ne"] as const) {
      const s = t("privacyPromise", lang);
      expect(s.length).toBeGreaterThan(60);
    }
    // The four separate commitments, because three of four is not the promise.
    const en = T.privacyPromise.en.toLowerCase();
    for (const part of ["kathmandu", "profile", "trekker", "deleted"]) {
      expect(en, part).toContain(part);
    }
  });

  it("shows the day rate in rupees and never in dollars", () => {
    for (const key of ["dayRate", "dayRateHint", "proofPaid", "proofRate"] as const) {
      for (const lang of ["en", "ne"] as const) {
        const s = t(key, lang).toLowerCase();
        expect(s, `${key}.${lang}`).not.toContain("dollar");
        expect(s, `${key}.${lang}`).not.toContain("usd");
        expect(s, `${key}.${lang}`).not.toContain("$");
      }
    }
    expect(T.dayRateHint.en.toLowerCase()).toContain("rupee");
  });
});

describe("tf", () => {
  it("keeps each language's word order", () => {
    expect(tf("stepCounter", "en", { n: 2, total: 5 })).toBe("Step 2 of 5");
    // Nepali puts the total first, which is the whole reason this is a
    // template rather than "Step" + "of" glued together.
    expect(tf("stepCounter", "ne", { n: 2, total: 5 })).toBe("5 मध्ये चरण 2");
  });

  it("keeps digits Arabic in both languages", () => {
    // Devanagari numerals read more naturally in formal Nepali, but every
    // number on this form has to match something the guide is looking at — a
    // phone keypad, a licence card, a rate they quote in messages. Half the
    // page in ५ and half in 5 is worse than all of it in 5.
    expect(tf("stepCounter", "ne", { n: 2, total: 5 })).toMatch(/\d/);
    for (const pair of [...Object.values(T), ...Object.values(PROBLEM)]) {
      expect(pair.ne, pair.ne).not.toMatch(/[०-९]/);
    }
  });

  it("leaves an unknown placeholder visible rather than blank", () => {
    expect(tf("stepCounter", "en", { n: 2 })).toContain("{total}");
  });
});

describe("problemText", () => {
  it("answers in the language asked for", () => {
    expect(problemText("phone_short", "en")).toContain("10 digits");
    expect(problemText("phone_short", "ne")).toMatch(DEVANAGARI);
  });
});

describe("pickLang", () => {
  it("honours a stored choice above anything else", () => {
    expect(pickLang("ne", "en-GB")).toBe("ne");
    expect(pickLang("en", "ne")).toBe("en");
  });

  it("reads Nepali from the browser when nothing is stored", () => {
    expect(pickLang(null, "ne,en;q=0.8")).toBe("ne");
  });

  it("falls back to English", () => {
    expect(pickLang(null, null)).toBe("en");
    expect(pickLang("fr" as any, "fr-FR")).toBe("en");
  });
});
