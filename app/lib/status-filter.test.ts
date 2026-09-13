import { describe, expect, it } from "vitest";
import {
  allOf,
  applyFilter,
  countsFor,
  isKey,
  matchesStatus,
  resolveKey,
  statusesFor,
  uncovered,
  type StatusFilter,
} from "./status-filter";

const GUIDE_STATUSES = ["applied", "in_review", "verified", "suspended", "removed"];
const FILTERS: StatusFilter[] = [
  allOf(),
  { key: "applied", label: "Applied", statuses: ["applied"] },
  { key: "in_review", label: "In review", statuses: ["in_review"] },
  { key: "verified", label: "Verified", statuses: ["verified"] },
  { key: "off", label: "Suspended or removed", statuses: ["suspended", "removed"] },
];

const rows = [
  { guide: { status: "applied" } },
  { guide: { status: "in_review" } },
  { guide: { status: "verified" } },
  { guide: { status: "verified" } },
  { guide: { status: "suspended" } },
  { guide: null },
];
const statusOf = (r: (typeof rows)[number]) => r.guide?.status;

describe("resolveKey", () => {
  it("takes the key from the URL when it is one of ours", () => {
    expect(resolveKey(FILTERS, "verified")).toBe("verified");
  });
  it("falls back to all for anything else, rather than showing nothing", () => {
    expect(resolveKey(FILTERS, "nonsense")).toBe("all");
    expect(resolveKey(FILTERS, null)).toBe("all");
    expect(resolveKey(FILTERS, "")).toBe("all");
  });
  it("knows its own keys", () => {
    expect(isKey(FILTERS, "off")).toBe(true);
    expect(isKey(FILTERS, "banned")).toBe(false);
  });
});

describe("matchesStatus", () => {
  it("matches a single status and a grouped one", () => {
    expect(matchesStatus(FILTERS, "verified", "verified")).toBe(true);
    expect(matchesStatus(FILTERS, "verified", "applied")).toBe(false);
    expect(matchesStatus(FILTERS, "off", "suspended")).toBe(true);
    expect(matchesStatus(FILTERS, "off", "removed")).toBe(true);
  });

  it("lets everything through on all", () => {
    for (const s of GUIDE_STATUSES) expect(matchesStatus(FILTERS, "all", s)).toBe(true);
  });

  it("keeps a row with no status out of the named groups but inside All", () => {
    expect(matchesStatus(FILTERS, "verified", null)).toBe(false);
    expect(matchesStatus(FILTERS, "verified", undefined)).toBe(false);
    expect(matchesStatus(FILTERS, "all", null)).toBe(true);
  });

  it("shows everything for a group that covers nothing", () => {
    // A list whose statuses we do not know yet still shows its rows.
    const open: StatusFilter[] = [{ key: "all", label: "All", statuses: [] }];
    expect(matchesStatus(open, "all", "whatever")).toBe(true);
  });
});

describe("countsFor and applyFilter", () => {
  it("counts what each tab would show", () => {
    expect(countsFor(rows, FILTERS, statusOf)).toEqual({
      // Including the row with no guide record: All means all, or rows
      // vanish from the only view meant to hold everything.
      all: 6,
      applied: 1,
      in_review: 1,
      verified: 2,
      off: 1,
    });
  });

  it("filters to the group asked for", () => {
    expect(applyFilter(rows, FILTERS, "verified", statusOf)).toHaveLength(2);
    expect(applyFilter(rows, FILTERS, "off", statusOf)).toHaveLength(1);
    expect(applyFilter(rows, FILTERS, "all", statusOf)).toHaveLength(6);
  });

  it("counts nothing for an empty list without throwing", () => {
    expect(countsFor([], FILTERS, statusOf)).toEqual({
      all: 0, applied: 0, in_review: 0, verified: 0, off: 0,
    });
  });
});

describe("uncovered", () => {
  it("is empty when every status has a home", () => {
    expect(uncovered(FILTERS, GUIDE_STATUSES)).toEqual([]);
  });

  it("names a status that would only ever appear under All", () => {
    // The failure this exists to catch: a status added to the database and
    // not to the filters disappears from every tab but one, quietly.
    expect(uncovered(FILTERS, [...GUIDE_STATUSES, "banned"])).toEqual(["banned"]);
  });

  it("does not count All as covering anything", () => {
    const onlyAll: StatusFilter[] = [allOf()];
    expect(uncovered(onlyAll, ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("statusesFor", () => {
  it("gives a group its own statuses", () => {
    expect(statusesFor(FILTERS, "off")).toEqual(["suspended", "removed"]);
  });

  it("falls back to every status for a key it does not know", () => {
    const every = statusesFor(FILTERS, "nonsense");
    for (const s of GUIDE_STATUSES) expect(every).toContain(s);
  });
});
