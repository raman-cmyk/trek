import { describe, expect, it } from "vitest";
import {
  categoryIsReady,
  categoryProblems,
  membersOf,
  orderCategories,
  slugifyCategory,
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
