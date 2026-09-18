import { describe, it, expect } from "vitest";
import {
  checklistProblems,
  itemProblems,
  pickChecklist,
  reorder,
  resolveDue,
  slugKey,
  stagesOf,
  type Checklist,
  type ChecklistItem,
} from "./checklists";

const list = (over: Partial<Checklist> = {}): Checklist => ({
  id: "c1",
  scope: "booking",
  key: "booking_trek",
  name: "Running a trek",
  applies_to: ["trek"],
  is_default: false,
  active: true,
  ...over,
});

describe("which list applies", () => {
  const lists = [
    list(),
    list({ id: "c2", key: "booking_day", applies_to: ["day_hike", "food_culture"] }),
    list({ id: "c3", key: "booking_any", applies_to: [], is_default: true }),
  ];

  it("takes the one that names this kind", () => {
    expect(pickChecklist(lists, "booking", "trek")?.id).toBe("c1");
    expect(pickChecklist(lists, "booking", "food_culture")?.id).toBe("c2");
  });

  it("falls back to the default, not to whichever came first", () => {
    expect(pickChecklist(lists, "booking", "city")?.id).toBe("c3");
    expect(pickChecklist(lists, "booking", null)?.id).toBe("c3");
  });

  it("returns nothing rather than the wrong list when there is no default", () => {
    // An empty checklist is better than somebody else's.
    const noDefault = lists.filter((l) => !l.is_default);
    expect(pickChecklist(noDefault, "booking", "city")).toBeNull();
  });

  it("never crosses scopes", () => {
    expect(pickChecklist(lists, "guide", "trek")).toBeNull();
  });

  it("ignores a list somebody switched off", () => {
    expect(pickChecklist([list({ active: false })], "booking", "trek")).toBeNull();
  });
});

describe("when an item is due", () => {
  const dates = { startDate: "2027-03-01", createdAt: "2026-10-01T09:00:00Z" };

  it("counts back from the start date", () => {
    expect(resolveDue({ anchor: "start", offset_days: -120 }, dates)).toBe("2026-11-01");
    expect(resolveDue({ anchor: "start", offset_days: 0 }, dates)).toBe("2027-03-01");
    expect(resolveDue({ anchor: "start", offset_days: 14 }, dates)).toBe("2027-03-15");
  });

  it("counts forward from the day the list was started", () => {
    expect(resolveDue({ anchor: "created", offset_days: 7 }, dates)).toBe("2026-10-08");
  });

  it("gives no date to an item that has none", () => {
    // "Daily", "As needed". A made-up date here is a red overdue badge on
    // something that is not late.
    expect(resolveDue({ anchor: "none", offset_days: null }, dates)).toBeNull();
    expect(resolveDue({ anchor: "start", offset_days: null }, dates)).toBeNull();
  });

  it("gives no date when the subject has no dates", () => {
    expect(resolveDue({ anchor: "start", offset_days: -7 }, {})).toBeNull();
    expect(resolveDue({ anchor: "start", offset_days: -7 }, { startDate: "soon" })).toBeNull();
  });
});

describe("saving a list", () => {
  it("is happy with a name and a scope", () => {
    expect(checklistProblems({ name: "Guide papers", scope: "guide" })).toEqual([]);
  });

  it("reports every problem, not the first", () => {
    // An empty name is also an empty key, and saying so is the point: three
    // problems in one pass rather than three submits.
    const p = checklistProblems({ name: "", scope: "nonsense" });
    expect(p.map((x) => x.field).sort()).toEqual(["key", "name", "scope"]);
  });

  it("refuses a name with nothing in it that could be a key", () => {
    expect(checklistProblems({ name: "!!!", scope: "guide" }).map((p) => p.field)).toContain("key");
  });
});

describe("saving one row", () => {
  it("is happy with a label and no date", () => {
    expect(itemProblems({ label: "Police clearance", anchor: "none" })).toEqual([]);
  });

  it("wants the number of days when there is an anchor", () => {
    expect(itemProblems({ label: "Permits", anchor: "start" })[0].field).toBe("offset_days");
  });

  it("refuses a number when there is nothing to count from", () => {
    const p = itemProblems({ label: "Evening check-in", anchor: "none", offsetDays: -3 });
    expect(p[0].message).toContain("nothing to count from");
  });

  it("will not count backwards from the day the list started", () => {
    // A list cannot ask for something four days before it existed.
    const p = itemProblems({ label: "Licence", anchor: "created", offsetDays: -4 });
    expect(p.some((x) => x.message.includes("cannot be negative"))).toBe(true);
  });

  it("takes a negative offset from the start date, because that is T-minus", () => {
    expect(itemProblems({ label: "Permits", anchor: "start", offsetDays: -30 })).toEqual([]);
  });

  it("refuses half a day and a decade", () => {
    expect(itemProblems({ label: "x y", anchor: "start", offsetDays: 1.5 })[0].field).toBe("offset_days");
    expect(itemProblems({ label: "x y", anchor: "start", offsetDays: 4000 })[0].field).toBe("offset_days");
  });
});

describe("keys and order", () => {
  it("makes a key out of what somebody typed", () => {
    expect(slugKey("Police clearance (under 1 year)")).toBe("police_clearance_under_1_year");
    expect(slugKey("  ")).toBe("");
  });

  it("keeps the stages in the order the rows sit in", () => {
    const items = [
      { id: "1", stage: "Papers", position: 1 },
      { id: "2", stage: "Safety", position: 2 },
      { id: "3", stage: "Papers", position: 0 },
    ] as ChecklistItem[];
    expect(stagesOf(items)).toEqual(["Papers", "Safety"]);
  });

  it("moves a row up and down, and does nothing at the ends", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(reorder(rows, "b", -1).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(reorder(rows, "b", 1).map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(reorder(rows, "a", -1).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(reorder(rows, "c", 1).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
