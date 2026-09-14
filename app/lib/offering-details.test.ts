import { describe, it, expect } from "vitest";
import {
  ACCESSIBILITY,
  TRANSPORT,
  accessibilityRows,
  activityLevel,
  parseCodes,
  parseFaqs,
  refCodeWords,
  transportLabels,
  tripLanguages,
} from "./offering-details";

describe("how hard it is", () => {
  it("has words and a reason for every level", () => {
    for (const l of ["easy", "moderate", "challenging", "strenuous"]) {
      const found = activityLevel(l);
      expect(found?.label).toBeTruthy();
      expect(found?.blurb.length).toBeGreaterThan(20);
    }
  });

  it("is null rather than a blank row when nothing was set", () => {
    expect(activityLevel(null)).toBeNull();
    expect(activityLevel("extreme")).toBeNull();
  });
});

describe("how you move", () => {
  it("turns codes into words in the order the guide chose", () => {
    expect(transportLabels(["domestic_flight", "walking"])).toEqual([
      "Domestic flight",
      "On foot",
    ]);
  });

  it("drops a code the app does not know instead of printing an empty row", () => {
    expect(transportLabels(["walking", "helicopter"])).toEqual(["On foot"]);
    expect(transportLabels(null)).toEqual([]);
  });
});

describe("who can come", () => {
  it("puts the cautions last, whatever order they were stored in", () => {
    const rows = accessibilityRows([
      "not_for_limited_mobility",
      "kid_friendly",
      "altitude_health",
      "service_animals",
    ]);
    expect(rows.map((r) => r.warn)).toEqual([false, false, true, true]);
    expect(rows[0].label).toBe("Good with children");
  });

  it("flags a caution as one", () => {
    expect(accessibilityRows(["wheelchair"])[0].warn).toBe(false);
    expect(accessibilityRows(["not_for_limited_mobility"])[0].warn).toBe(true);
  });
});

describe("what you will hear on the day", () => {
  it("falls back to whatever the guide speaks", () => {
    expect(tripLanguages([], ["English", "Nepali", "Sherpa"])).toEqual([
      "English",
      "Nepali",
      "Sherpa",
    ]);
    expect(tripLanguages(null, ["English"])).toEqual(["English"]);
  });

  it("lets one trip narrow it", () => {
    expect(tripLanguages(["English"], ["English", "Nepali"])).toEqual(["English"]);
  });

  it("says nothing rather than guessing when neither is known", () => {
    expect(tripLanguages(null, null)).toEqual([]);
  });
});

describe("questions everybody asks", () => {
  it("takes a filled pair", () => {
    expect(parseFaqs('[{"q":"Is it cold?","a":"At night, yes."}]')).toEqual([
      { q: "Is it cold?", a: "At night, yes." },
    ]);
  });

  it("drops a question with no answer — a page that answers nothing is worse", () => {
    expect(parseFaqs('[{"q":"Is it cold?","a":""},{"q":"","a":"Yes"}]')).toEqual([]);
  });

  it("survives a malformed field instead of failing the save", () => {
    expect(parseFaqs("not json")).toEqual([]);
    expect(parseFaqs(undefined)).toEqual([]);
    expect(parseFaqs('{"q":"x"}')).toEqual([]);
  });

  it("caps the list and the lengths", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ q: `Q${i}?`, a: "Yes indeed" }));
    expect(parseFaqs(many)).toHaveLength(12);
    const long = parseFaqs([{ q: "x".repeat(400), a: "y".repeat(3000) }]);
    expect(long[0].q).toHaveLength(200);
    expect(long[0].a).toHaveLength(1200);
  });
});

describe("codes off a form", () => {
  it("keeps only what the database will accept, without duplicates", () => {
    expect(parseCodes(["walking", "walking", "rocket"], TRANSPORT)).toEqual(["walking"]);
    expect(parseCodes(["wheelchair"], ACCESSIBILITY)).toEqual(["wheelchair"]);
  });
});

describe("the reference a trekker quotes", () => {
  it("recognises one the database made", () => {
    expect(refCodeWords("GN-A1B2C3")).toBe("GN-A1B2C3");
  });

  it("refuses anything else rather than printing it", () => {
    expect(refCodeWords("gn-a1b2c3")).toBeNull();
    expect(refCodeWords("")).toBeNull();
    expect(refCodeWords(null)).toBeNull();
  });
});
