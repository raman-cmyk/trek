import { describe, expect, it } from "vitest";
import {
  activeCount,
  activeFilters,
  clearedParams,
  filterButtonLabel,
  groupEmpty,
  isOn,
  optionsFromValues,
  resultsLabel,
  withoutFilter,
  type FilterGroup,
} from "./filters";

const KIND: FilterGroup = {
  param: "kind",
  title: "Kind of trip",
  type: "one",
  anyLabel: "Any",
  options: [
    { value: "trek", label: "Treks" },
    { value: "day_hike", label: "Day hikes" },
  ],
};

const LANG: FilterGroup = {
  param: "lang",
  title: "Languages",
  type: "many",
  options: [
    { value: "English", label: "English" },
    { value: "French", label: "French" },
    { value: "Nepali", label: "Nepali" },
  ],
};

const GROUPS = [KIND, LANG];

describe("isOn / groupEmpty", () => {
  it("reads a single-value group", () => {
    const p = new URLSearchParams("kind=trek");
    expect(isOn(p, KIND, "trek")).toBe(true);
    expect(isOn(p, KIND, "day_hike")).toBe(false);
    expect(groupEmpty(p, KIND)).toBe(false);
  });

  it("reads a repeated param as a list", () => {
    const p = new URLSearchParams("lang=English&lang=Nepali");
    expect(isOn(p, LANG, "English")).toBe(true);
    expect(isOn(p, LANG, "Nepali")).toBe(true);
    expect(isOn(p, LANG, "French")).toBe(false);
    expect(groupEmpty(p, LANG)).toBe(false);
  });

  it("an empty group is empty", () => {
    const p = new URLSearchParams("q=everest");
    expect(groupEmpty(p, KIND)).toBe(true);
    expect(groupEmpty(p, LANG)).toBe(true);
  });
});

describe("activeFilters", () => {
  it("lists every chosen value with its label", () => {
    const p = new URLSearchParams("kind=trek&lang=English&lang=Nepali");
    expect(activeFilters(p, GROUPS)).toEqual([
      { param: "kind", value: "trek", label: "Treks" },
      { param: "lang", value: "English", label: "English" },
      { param: "lang", value: "Nepali", label: "Nepali" },
    ]);
    expect(activeCount(p, GROUPS)).toBe(3);
  });

  it("ignores a value nobody offers, rather than showing an unexplainable chip", () => {
    const p = new URLSearchParams("kind=spacewalk&lang=Klingon");
    expect(activeFilters(p, GROUPS)).toEqual([]);
    expect(activeCount(p, GROUPS)).toBe(0);
  });

  it("does not count the search box or the dates as filters", () => {
    const p = new URLSearchParams("q=everest&from=2026-10-01&sort=price");
    expect(activeCount(p, GROUPS)).toBe(0);
  });
});

describe("clearedParams", () => {
  it("drops the filters and keeps the search, the dates and the sort", () => {
    const p = new URLSearchParams("q=everest&from=2026-10-01&sort=price&kind=trek&lang=English");
    const next = clearedParams(p, GROUPS);
    expect(next.get("q")).toBe("everest");
    expect(next.get("from")).toBe("2026-10-01");
    expect(next.get("sort")).toBe("price");
    expect(next.get("kind")).toBeNull();
    expect(next.getAll("lang")).toEqual([]);
  });
});

describe("withoutFilter", () => {
  it("removes one value of a repeated param and leaves its siblings", () => {
    const p = new URLSearchParams("lang=English&lang=Nepali&kind=trek");
    const next = withoutFilter(p, "lang", "English");
    expect(next.getAll("lang")).toEqual(["Nepali"]);
    expect(next.get("kind")).toBe("trek");
  });

  it("removes a single-value filter", () => {
    const next = withoutFilter(new URLSearchParams("kind=trek&q=x"), "kind", "trek");
    expect(next.get("kind")).toBeNull();
    expect(next.get("q")).toBe("x");
  });
});

describe("labels", () => {
  it("counts results the way the button reads", () => {
    expect(resultsLabel(429)).toBe("See 429 results");
    expect(resultsLabel(1)).toBe("See 1 result");
    expect(resultsLabel(0)).toBe("No matches");
    expect(resultsLabel(1200)).toBe("See 1,200 results");
  });

  it("puts the count on the button only when there is one", () => {
    expect(filterButtonLabel(0)).toBe("Filters");
    expect(filterButtonLabel(3)).toBe("Filters (3)");
  });
});

describe("optionsFromValues", () => {
  it("is built from what is actually there, commonest first", () => {
    const opts = optionsFromValues(["Solukhumbu", "Kaski", "Solukhumbu", "Kaski", "Solukhumbu"]);
    expect(opts).toEqual([
      { value: "Solukhumbu", label: "Solukhumbu", count: 3 },
      { value: "Kaski", label: "Kaski", count: 2 },
    ]);
  });

  it("never offers a dead end — blanks and nulls are not options", () => {
    expect(optionsFromValues([null, "", "   ", undefined])).toEqual([]);
  });

  it("breaks ties alphabetically so the list does not reshuffle on every load", () => {
    const opts = optionsFromValues(["b", "a"]);
    expect(opts.map((o) => o.value)).toEqual(["a", "b"]);
  });

  it("takes a label function for values that are not their own label", () => {
    const opts = optionsFromValues(["trek"], (v) => (v === "trek" ? "Treks" : v));
    expect(opts[0].label).toBe("Treks");
  });
});
