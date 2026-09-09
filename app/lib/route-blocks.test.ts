import { describe, expect, it } from "vitest";
import {
  BLOCKS,
  altitudesFor,
  blockDef,
  blockIsEmpty,
  normaliseBlock,
  orderBlocks,
  pairsToText,
  parsePairs,
  publishedBlocks,
  swapSorts,
  type RouteBlock,
} from "./route-blocks";

const block = (over: Partial<RouteBlock> = {}): RouteBlock => ({
  id: "b1",
  kind: "prose",
  sort: 100,
  live: true,
  data: { heading: "The valley", body: "Words." },
  ...over,
});

describe("the vocabulary", () => {
  it("is sixteen kinds, closed", () => {
    expect(BLOCKS).toHaveLength(16);
    expect(new Set(BLOCKS.map((b) => b.kind)).size).toBe(16);
  });

  it("gives every kind fields, a label and an empty state", () => {
    for (const b of BLOCKS) {
      expect(b.fields.length).toBeGreaterThan(0);
      expect(b.label).toBeTruthy();
      expect(b.blurb).toBeTruthy();
      // Every field has somewhere to land in the empty block, or the editor
      // opens on undefined and React complains about uncontrolled inputs.
      for (const f of b.fields) expect(f.key in b.empty).toBe(true);
    }
  });

  it("does not know kinds it was never given", () => {
    expect(blockDef("carousel")).toBeNull();
  });
});

describe("parsePairs", () => {
  it("splits a line on the first pipe, so an answer may contain one", () => {
    expect(parsePairs("Max altitude | 4,984 m")).toEqual([["Max altitude", "4,984 m"]]);
    expect(parsePairs("Q | a | b")).toEqual([["Q", "a | b"]]);
  });

  it("keeps a line with no pipe as a label on its own", () => {
    expect(parsePairs("Just this")).toEqual([["Just this", ""]]);
  });

  it("drops blank lines rather than rendering empty rows", () => {
    expect(parsePairs("a | 1\n\n  \nb | 2")).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("reads back what it wrote", () => {
    const text = "Days | 7\nAltitude | 3,870 m";
    expect(pairsToText(parsePairs(text))).toBe(text);
  });

  it("survives already-parsed data coming back from the database", () => {
    expect(parsePairs([["a", "1"]])).toEqual([["a", "1"]]);
  });
});

describe("normaliseBlock", () => {
  it("fills in a field added after the block was saved", () => {
    // A block written before `standfirst` existed still renders.
    const out = normaliseBlock("hero", { title: "Langtang Valley" });
    expect(out.title).toBe("Langtang Valley");
    expect(out.standfirst).toBe("");
    expect(out.image).toBe("");
  });

  it("coerces numbers, because a form posts strings", () => {
    const out = normaliseBlock("climb_day", { day: "3", altitude: "3430" });
    expect(out.day).toBe(3);
    expect(out.altitude).toBe(3430);
  });

  it("drops fields that do not belong to the kind", () => {
    const out = normaliseBlock("quote", { text: "…", nonsense: "x" });
    expect(out.nonsense).toBeUndefined();
  });

  it("is empty for a kind that does not exist", () => {
    expect(normaliseBlock("carousel", { a: 1 })).toEqual({});
  });
});

describe("blockIsEmpty", () => {
  it("knows a block nobody has filled in", () => {
    expect(blockIsEmpty("prose", normaliseBlock("prose", {}))).toBe(true);
    expect(blockIsEmpty("prose", normaliseBlock("prose", { body: "A word." }))).toBe(false);
    expect(blockIsEmpty("faq", normaliseBlock("faq", { items: "Q | A" }))).toBe(false);
    expect(blockIsEmpty("climb_day", normaliseBlock("climb_day", { altitude: 3430 }))).toBe(false);
  });
});

describe("the data-backed kinds", () => {
  it("are never empty — their content is the route's own rows", () => {
    for (const kind of ["map", "permits", "season", "elevation", "guides", "cta"]) {
      expect(blockIsEmpty(kind, normaliseBlock(kind, {}))).toBe(false);
    }
  });

  it("a choice field falls back to its default rather than an unknown value", () => {
    expect(normaliseBlock("split", { side: "right" }).side).toBe("right");
    expect(normaliseBlock("split", { side: "sideways" }).side).toBe("left");
  });
});

describe("altitudesFor", () => {
  const page = [
    block({ id: "h", kind: "hero", sort: 10, data: {} }),
    block({ id: "p", kind: "prose", sort: 20 }),
    block({ id: "d1", kind: "climb_day", sort: 30, data: { altitude: 2470 } }),
    block({ id: "q", kind: "quote", sort: 40, data: { text: "…" } }),
    block({ id: "d2", kind: "climb_day", sort: 50, data: { altitude: 3430 } }),
    block({ id: "g", kind: "guides", sort: 60, data: {} }),
  ];

  it("carries each day's altitude into the blocks beneath it", () => {
    // Above the first day the page sits at the lowest day's altitude — the
    // walk's floor — not at some number nobody set.
    expect(altitudesFor(page)).toEqual([2470, 2470, 2470, 2470, 3430, 3430]);
  });

  it("starts a page with no days at the trailhead", () => {
    expect(altitudesFor([page[0], page[1]])).toEqual([1400, 1400]);
  });

  it("uses the lowest day as the floor, not a hard-coded number", () => {
    const high = [block({ id: "d", kind: "climb_day", sort: 1, data: { altitude: 3000 } })];
    expect(altitudesFor([page[0], ...high])).toEqual([3000, 3000]);
  });
});

describe("publishedBlocks", () => {
  it("is the live ones, in order, with something in them", () => {
    const out = publishedBlocks([
      block({ id: "c", sort: 300 }),
      block({ id: "a", sort: 100 }),
      block({ id: "draft", sort: 200, live: false }),
      block({ id: "blank", sort: 250, data: {} }),
      block({ id: "unknown", sort: 260, kind: "carousel" as any }),
    ]);
    expect(out.map((b) => b.id)).toEqual(["a", "c"]);
  });
});

describe("swapSorts", () => {
  const three = [
    block({ id: "a", sort: 100 }),
    block({ id: "b", sort: 200 }),
    block({ id: "c", sort: 300 }),
  ];

  it("swaps a block with the one above it", () => {
    expect(swapSorts(three, "b", "up")).toEqual([
      { id: "b", sort: 100 },
      { id: "a", sort: 200 },
    ]);
  });

  it("swaps a block with the one below it", () => {
    expect(swapSorts(three, "b", "down")).toEqual([
      { id: "b", sort: 300 },
      { id: "c", sort: 200 },
    ]);
  });

  it("does nothing at the ends, rather than something surprising", () => {
    expect(swapSorts(three, "a", "up")).toEqual([]);
    expect(swapSorts(three, "c", "down")).toEqual([]);
    expect(swapSorts(three, "missing", "up")).toEqual([]);
  });

  it("separates two blocks that share a sort, so the button visibly works", () => {
    const tied = [block({ id: "a", sort: 100 }), block({ id: "b", sort: 100 })];
    const moved = swapSorts(tied, "b", "up");
    expect(moved[0].sort).toBeLessThan(moved[1].sort);
  });
});

describe("orderBlocks", () => {
  it("breaks a tie the same way every time", () => {
    const out = orderBlocks([block({ id: "z", sort: 5 }), block({ id: "a", sort: 5 })]);
    expect(out.map((b) => b.id)).toEqual(["a", "z"]);
  });
});
