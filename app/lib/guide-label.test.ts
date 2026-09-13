import { describe, expect, it } from "vitest";
import { labelGuides, labelledInOrder, type LabelledGuide } from "./guide-label";

const money = (c: number) => `$${Math.round(c / 100)}`;

const g = (over: Partial<LabelledGuide> & { id: string }): LabelledGuide => ({
  name: "Pemba Sherpa",
  district: "Solukhumbu",
  dayRateUsdCents: 4500,
  yearsExperience: 0,
  slug: null,
  ...over,
});

describe("labelGuides", () => {
  it("shows the name it is given, with what a stranger may know", () => {
    // Public pages get a first name by design — public_guides keeps the
    // family name on the private row — so the rest has to do the work.
    const labels = labelGuides([g({ id: "a" })], money);
    expect(labels.get("a")).toBe("Pemba Sherpa · Solukhumbu · $45/day");
  });

  it("separates two guides who share a first name, which is the public case", () => {
    const labels = labelGuides(
      [
        { id: "a", name: "Pemba", district: "Solukhumbu", dayRateUsdCents: 4500, yearsExperience: 12, slug: "pemba-sherpa" },
        { id: "b", name: "Pemba", district: "Solukhumbu", dayRateUsdCents: 4500, yearsExperience: 4, slug: "pemba-tamang" },
      ],
      money,
    );
    expect(labels.get("a")).toBe("Pemba · Solukhumbu · $45/day · 12 years guiding");
    expect(labels.get("b")).toBe("Pemba · Solukhumbu · $45/day · 4 years guiding");
  });

  it("leaves distinct guides alone", () => {
    const labels = labelGuides(
      [g({ id: "a" }), g({ id: "b", name: "Mingma Sherpa" })],
      money,
    );
    expect(labels.get("a")).toBe("Pemba Sherpa · Solukhumbu · $45/day");
    expect(labels.get("b")).toBe("Mingma Sherpa · Solukhumbu · $45/day");
  });

  it("separates two people who share a name by where they are from", () => {
    const labels = labelGuides(
      [g({ id: "a" }), g({ id: "b", district: "Taplejung" })],
      money,
    );
    expect(labels.get("a")).toContain("Solukhumbu");
    expect(labels.get("b")).toContain("Taplejung");
    expect(labels.get("a")).not.toBe(labels.get("b"));
  });

  it("separates two who share name, district and rate by years guiding", () => {
    const labels = labelGuides(
      [
        g({ id: "a", yearsExperience: 12 }),
        g({ id: "b", yearsExperience: 4 }),
      ],
      money,
    );
    expect(labels.get("a")).toBe("Pemba Sherpa · Solukhumbu · $45/day · 12 years guiding");
    expect(labels.get("b")).toBe("Pemba Sherpa · Solukhumbu · $45/day · 4 years guiding");
  });

  it("gives the extra fact to everyone in the clash, not just the second", () => {
    // "Pemba Sherpa" beside "Pemba Sherpa · 12 years guiding" reads as though
    // the first one has no experience at all.
    const labels = labelGuides(
      [g({ id: "a", yearsExperience: 12 }), g({ id: "b", yearsExperience: 4 })],
      money,
    );
    expect(labels.get("a")).toContain("years guiding");
    expect(labels.get("b")).toContain("years guiding");
  });

  it("says year, not years, for one", () => {
    const labels = labelGuides(
      [g({ id: "a", yearsExperience: 1 }), g({ id: "b", yearsExperience: 9 })],
      money,
    );
    expect(labels.get("a")).toContain("· 1 year guiding");
  });

  it("falls back to the profile address when nothing human separates them", () => {
    const labels = labelGuides(
      [
        g({ id: "a", yearsExperience: 5, slug: "pemba-sherpa" }),
        g({ id: "b", yearsExperience: 5, slug: "pemba-sherpa-2" }),
      ],
      money,
    );
    expect(labels.get("a")).toBe(
      "Pemba Sherpa · Solukhumbu · $45/day · 5 years guiding · /pemba-sherpa",
    );
    expect(labels.get("b")).toContain("/pemba-sherpa-2");
    expect(labels.get("a")).not.toBe(labels.get("b"));
  });

  it("does not invent detail that is not there", () => {
    const labels = labelGuides(
      [g({ id: "a", district: null, dayRateUsdCents: null, name: "Dawa" })],
      money,
    );
    expect(labels.get("a")).toBe("Dawa");
  });

  it("never labels somebody nothing", () => {
    const labels = labelGuides([g({ id: "a", name: null, district: null, dayRateUsdCents: null })], money);
    expect(labels.get("a")).toBe("A guide");
  });

  it("copes with three of the same name", () => {
    const labels = labelGuides(
      [
        g({ id: "a", yearsExperience: 12 }),
        g({ id: "b", yearsExperience: 4 }),
        g({ id: "c", yearsExperience: 4, slug: "pemba-sherpa-3" }),
      ],
      money,
    );
    const all = [labels.get("a"), labels.get("b"), labels.get("c")];
    expect(new Set(all).size).toBe(3);
  });

  it("is empty for an empty list", () => {
    expect(labelGuides([], money).size).toBe(0);
  });
});

describe("labelledInOrder", () => {
  it("keeps the order it was given", () => {
    const rows = labelledInOrder(
      [g({ id: "b", name: "Zeta" }), g({ id: "a", name: "Alpha" })],
      money,
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(rows[0].label).toContain("Zeta");
  });
});
