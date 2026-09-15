import { describe, it, expect } from "vitest";
import { FALLBACK_MOMENT, MOMENTS, groupBriefing, momentOf } from "./route-briefing";

const s = (id: string) => ({ id, title: id, body: ["x"] });

describe("when each answer matters", () => {
  it("settles paperwork and kit before you leave", () => {
    for (const id of ["insurance", "permits", "layers", "feet", "carry"]) {
      expect(momentOf(id)).toBe("before");
    }
  });

  it("puts the daily realities on the trail", () => {
    for (const id of ["altitude", "sleeping", "food", "money", "power"]) {
      expect(momentOf(id)).toBe("trail");
    }
  });

  it("puts what you owe people with the people", () => {
    for (const id of ["porters", "tipping", "culture", "responsible"]) {
      expect(momentOf(id)).toBe("people");
    }
  });

  it("keeps rescue on its own, because it is the one read twice", () => {
    expect(momentOf("rescue")).toBe("wrong");
  });

  it("files an unknown answer rather than losing it", () => {
    expect(momentOf("something_new")).toBe(FALLBACK_MOMENT);
  });
});

describe("grouping", () => {
  it("returns the moments in trip order", () => {
    const groups = groupBriefing([s("tipping"), s("rescue"), s("altitude"), s("permits")]);
    expect(groups.map((g) => g.moment.key)).toEqual(["before", "trail", "people", "wrong"]);
  });

  it("drops a moment with nothing to say instead of an empty heading", () => {
    const groups = groupBriefing([s("altitude"), s("food")]);
    expect(groups.map((g) => g.moment.key)).toEqual(["trail"]);
  });

  it("keeps every section, and only once", () => {
    const ids = ["insurance", "altitude", "porters", "rescue", "food", "tipping"];
    const groups = groupBriefing(ids.map(s));
    const out = groups.flatMap((g) => g.sections.map((x) => x.id));
    expect(out.sort()).toEqual([...ids].sort());
  });

  it("keeps the order it was given within a group", () => {
    const groups = groupBriefing([s("money"), s("altitude"), s("food")]);
    expect(groups[0].sections.map((x) => x.id)).toEqual(["money", "altitude", "food"]);
  });

  it("has a blurb for every moment", () => {
    for (const m of MOMENTS) expect(m.blurb.length).toBeGreaterThan(20);
  });

  it("copes with nothing at all", () => {
    expect(groupBriefing([])).toEqual([]);
  });
});
