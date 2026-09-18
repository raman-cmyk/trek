import { describe, expect, it } from "vitest";
import { ALL_FILTER_SETS } from "./ops-filters";
import { statusesFor, uncovered } from "./status-filter";

/**
 * The filters and the database have to agree.
 *
 * Adding a status to a check constraint and forgetting the filter list is a
 * silent failure: the rows appear under All and under nothing else, so anyone
 * working through a tab never sees them and nothing anywhere says so. These
 * run over every console list at once, so a new one is covered the moment it
 * is added to ALL_FILTER_SETS.
 */
describe.each(ALL_FILTER_SETS)("$name filters", ({ statuses, filters }) => {
  it("gives every status a tab of its own besides All", () => {
    expect(uncovered(filters, statuses)).toEqual([]);
  });

  it("does not filter on a status the table cannot hold", () => {
    const known = new Set(statuses);
    const invented = filters
      .filter((f) => f.key !== "all")
      .flatMap((f) => f.statuses)
      .filter((s) => !known.has(s));
    expect(invented).toEqual([]);
  });

  it("puts each status in exactly one tab, so the counts add up", () => {
    for (const s of statuses) {
      const homes = filters.filter((f) => f.key !== "all" && f.statuses.includes(s));
      expect(homes.map((h) => h.key)).toHaveLength(1);
    }
  });

  it("starts with an All that holds everything", () => {
    expect(filters[0].key).toBe("all");
    // Empty means "every row" — including one whose status is null, which a
    // spelled-out list would drop from the only view meant to hold it all.
    expect(statusesFor(filters, "all")).toEqual([]);
  });

  it("has a unique, url-safe key and a label for every tab", () => {
    const keys = filters.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of filters) {
      expect(f.key).toMatch(/^[a-z_]+$/);
      expect(f.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("the console's filter sets", () => {
  it("covers every list that has one", () => {
    expect(ALL_FILTER_SETS.map((s) => s.name)).toEqual([
      "guides",
      "experiences",
      "group trips",
      "journals",
      "routes",
      "incidents",
      "permits",
      "trekker documents",
      "cancellations",
    ]);
  });
});
