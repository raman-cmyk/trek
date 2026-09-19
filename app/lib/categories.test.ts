import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEMBER_SORT,
  categoryIsReady,
  categoryProblems,
  cleanSort,
  membersOf,
  membershipChanges,
  orderCategories,
  slugifyCategory,
  whyNotLive,
  type Category,
} from "./categories";

const cat = (over: Partial<Category> = {}): Category => ({
  id: "c1",
  slug: "birds",
  label: "Guides who know the birds",
  blurb: "They will stop, and they will know what it was.",
  auto_skill: null,
  live: true,
  sort: 100,
  min_guides: 3,
  ...over,
});

const guides = ["a", "b", "c", "d"].map((user_id) => ({ user_id }));

describe("slugifyCategory", () => {
  it("makes a heading into a web address", () => {
    expect(slugifyCategory("Guides who host you in their village")).toBe(
      "guides-who-host-you-in-their-village",
    );
  });

  it("copes with punctuation, accents and doubled spaces", () => {
    expect(slugifyCategory("Café  guides — Annapurna!")).toBe("cafe-guides-annapurna");
  });

  it("never ends on a hyphen, even when it has to cut", () => {
    const s = slugifyCategory("x".repeat(40) + " " + "y".repeat(40));
    expect(s.endsWith("-")).toBe(false);
    expect(s.length).toBeLessThanOrEqual(60);
  });
});

describe("categoryProblems", () => {
  const ok = { label: "Birds", slug: "birds", min_guides: 3 };

  it("passes something usable", () => {
    expect(categoryProblems(ok)).toEqual([]);
  });

  it("wants a heading a reader would read", () => {
    expect(categoryProblems({ ...ok, label: " " })[0].field).toBe("label");
  });

  it("refuses a web address that is not one", () => {
    expect(categoryProblems({ ...ok, slug: "Birds And Bees" })[0].field).toBe("slug");
    expect(categoryProblems({ ...ok, slug: "-birds" })[0].field).toBe("slug");
  });

  it("keeps the minimum sane", () => {
    expect(categoryProblems({ ...ok, min_guides: 0 })[0].field).toBe("min_guides");
    expect(categoryProblems({ ...ok, min_guides: 99 })[0].field).toBe("min_guides");
  });
});

describe("membersOf", () => {
  it("is the hand-picked, in the order they were picked", () => {
    const out = membersOf(
      cat(),
      guides,
      [
        { guide_id: "c", sort: 1 },
        { guide_id: "a", sort: 5 },
      ],
      {},
    );
    expect(out.map((g) => g.user_id)).toEqual(["c", "a"]);
  });

  it("sweeps in everyone with the skill, behind the picked ones", () => {
    const out = membersOf(
      cat({ auto_skill: "birds" }),
      guides,
      [{ guide_id: "d", sort: 1 }],
      { a: ["birds"], b: ["cooking"], d: ["birds"] },
    );
    // d was picked, so d leads and is not repeated by the sweep.
    expect(out.map((g) => g.user_id)).toEqual(["d", "a"]);
  });

  it("ignores a pick for somebody who is not on the roster any more", () => {
    const out = membersOf(cat(), guides, [{ guide_id: "gone", sort: 1 }], {});
    expect(out).toEqual([]);
  });

  it("is empty for a hand-picked category with nobody in it", () => {
    expect(membersOf(cat(), guides, [], { a: ["birds"] })).toEqual([]);
  });
});

describe("categoryIsReady", () => {
  it("waits for the minimum, and for the switch", () => {
    expect(categoryIsReady(cat(), 2)).toBe(false);
    expect(categoryIsReady(cat(), 3)).toBe(true);
    expect(categoryIsReady(cat({ live: false }), 9)).toBe(false);
    // A deliberately tiny row is sometimes the point.
    expect(categoryIsReady(cat({ min_guides: 1 }), 1)).toBe(true);
  });
});

describe("orderCategories", () => {
  it("sorts by the given order, then by label so it is never random", () => {
    const out = orderCategories([
      cat({ id: "3", label: "Zebra", sort: 10 }),
      cat({ id: "1", label: "Apple", sort: 10 }),
      cat({ id: "2", label: "Middle", sort: 1 }),
    ]);
    expect(out.map((c) => c.label)).toEqual(["Middle", "Apple", "Zebra"]);
  });
});

describe("cleanSort", () => {
  it("keeps a sensible position and defaults the rest", () => {
    expect(cleanSort("3")).toBe(3);
    expect(cleanSort("0")).toBe(0);
    expect(cleanSort(" 12 ")).toBe(12);
    expect(cleanSort("")).toBe(DEFAULT_MEMBER_SORT);
    expect(cleanSort(null)).toBe(DEFAULT_MEMBER_SORT);
    expect(cleanSort("first")).toBe(DEFAULT_MEMBER_SORT);
  });

  it("will not let a typo push somebody off the end of a row", () => {
    expect(cleanSort("-4")).toBe(0);
    expect(cleanSort("99999")).toBe(999);
    expect(cleanSort("2.6")).toBe(3);
  });
});

describe("membershipChanges", () => {
  const m = (id: string, sort = 100) => ({ category_id: id, sort });

  it("works out what to add, move and drop from one save", () => {
    const out = membershipChanges([m("a", 1), m("b", 100), m("c", 5)], [m("a", 1), m("b", 2), m("d", 100)]);
    expect(out.add).toEqual([m("d", 100)]);
    expect(out.update).toEqual([m("b", 2)]);
    expect(out.remove).toEqual(["c"]);
  });

  it("writes nothing when nothing changed", () => {
    // Re-upserting eleven unchanged rows on every save would churn
    // created_at, which is the only record of when somebody was put in a row.
    const same = [m("a", 1), m("b", 100)];
    expect(membershipChanges(same, same)).toEqual({ add: [], update: [], remove: [] });
  });

  it("empties a guide out of every row", () => {
    expect(membershipChanges([m("a"), m("b")], []).remove.sort()).toEqual(["a", "b"]);
  });

  it("fills a guide into several rows at once, which is the point of it", () => {
    const out = membershipChanges([], [m("a", 1), m("b", 1), m("c", 1)]);
    expect(out.add).toHaveLength(3);
    expect(out.remove).toEqual([]);
  });
});

describe("whyNotLive", () => {
  const c = (over: Partial<{ live: boolean; min_guides: number; label: string }>) => ({
    live: true,
    min_guides: 3,
    label: "Photographers",
    ...over,
  });

  it("says nothing about a row that is actually showing", () => {
    expect(whyNotLive(c({}), 4)).toBeNull();
  });

  it("names the one thing left to do on a finished draft", () => {
    // All four categories were drafts with nobody in them, which is why the
    // founder concluded the whole system did not exist.
    expect(whyNotLive(c({ live: false }), 5)).toContain("switch it live");
  });

  it("counts how many guides short a draft is", () => {
    expect(whyNotLive(c({ live: false }), 2)).toContain("one guide");
    expect(whyNotLive(c({ live: false }), 0)).toContain("3 guides");
  });

  it("explains a live row nobody can see", () => {
    expect(whyNotLive(c({}), 1)).toContain("needs 3 guides and has 1");
  });
});
