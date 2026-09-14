import { describe, expect, it } from "vitest";
import {
  HEARD_OPTIONS,
  REFERRAL_VALUES,
  cleanDetail,
  detailPromptFor,
  heardBreakdown,
  heardLabel,
  heardLine,
  heardProblem,
  isHeardValue,
} from "./heard-about";

describe("the options", () => {
  it("has no duplicate values, which would silently drop answers", () => {
    const values = HEARD_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("asks who, for every answer where a person is the channel", () => {
    expect(REFERRAL_VALUES).toContain("guide");
    expect(REFERRAL_VALUES).toContain("trekker");
    expect(REFERRAL_VALUES).not.toContain("search");
  });
});

describe("heardProblem", () => {
  it("requires an answer — one question half of them skip is not data", () => {
    expect(heardProblem("")).toMatch(/how you heard/);
    expect(heardProblem(null)).toMatch(/how you heard/);
    expect(heardProblem("   ")).toMatch(/how you heard/);
  });

  it("refuses something that is not on the list", () => {
    expect(heardProblem("carrier pigeon")).toBe("Pick one of the options.");
  });

  it("accepts a real answer", () => {
    expect(heardProblem("guide")).toBeNull();
  });
});

describe("isHeardValue", () => {
  it("is exact", () => {
    expect(isHeardValue("guide")).toBe(true);
    expect(isHeardValue("Guide")).toBe(false);
    expect(isHeardValue(3)).toBe(false);
  });
});

describe("detailPromptFor", () => {
  it("asks which guide", () => {
    expect(detailPromptFor("guide")).toMatch(/Which guide/);
  });
  it("asks nothing of a search", () => {
    expect(detailPromptFor("search")).toBeNull();
  });
  it("asks nothing of an answer that was never given", () => {
    expect(detailPromptFor(null)).toBeNull();
  });
});

describe("cleanDetail", () => {
  it("tidies a name", () => {
    expect(cleanDetail("  Pemba   Sherpa ")).toBe("Pemba Sherpa");
  });
  it("is null rather than empty", () => {
    expect(cleanDetail("   ")).toBeNull();
    expect(cleanDetail(undefined)).toBeNull();
  });
  it("is a name, not a story", () => {
    expect(cleanDetail("x".repeat(400))).toHaveLength(120);
  });
});

describe("heardLine", () => {
  it("joins the two halves for the office", () => {
    expect(heardLine("guide", "Pemba Sherpa")).toBe("Another guide told me — Pemba Sherpa");
  });
  it("is just the label when nobody was named", () => {
    expect(heardLine("search", null)).toBe("I searched for it");
  });
  it("says plainly when the question was never asked", () => {
    expect(heardLabel(null)).toBe("Not asked");
    expect(heardLine(null, null)).toBe("Not asked");
  });
});

describe("heardBreakdown", () => {
  it("counts commonest first", () => {
    const rows = [
      { heard_about: "guide" },
      { heard_about: "search" },
      { heard_about: "guide" },
      { heard_about: "guide" },
      { heard_about: "search" },
    ];
    expect(heardBreakdown(rows)).toEqual([
      { value: "guide", label: "Another guide told me", count: 3 },
      { value: "search", label: "I searched for it", count: 2 },
    ]);
  });

  it("does not turn applicants from before the question into a category", () => {
    const rows = [{ heard_about: null }, { heard_about: "" }, { heard_about: "guide" }];
    expect(heardBreakdown(rows as any)).toEqual([
      { value: "guide", label: "Another guide told me", count: 1 },
    ]);
  });

  it("is empty when nobody has answered", () => {
    expect(heardBreakdown([])).toEqual([]);
  });
});
