import { describe, it, expect } from "vitest";
import { byOwner, byStage, dueLabel, isOverdue, taskSummary, type TaskRow } from "./tasks";

const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: "1",
  key: "permits",
  stage: "Logistics",
  label: "Permits bought for the route",
  owner: "office",
  due_on: "2026-10-10",
  state: "open",
  ...over,
});

const TODAY = "2026-10-15";

describe("overdue", () => {
  it("is a date behind us on something still open", () => {
    expect(isOverdue(task(), TODAY)).toBe(true);
    expect(isOverdue(task({ due_on: "2026-10-20" }), TODAY)).toBe(false);
  });

  it("is never true of a task that is finished with", () => {
    expect(isOverdue(task({ state: "done" }), TODAY)).toBe(false);
    expect(isOverdue(task({ state: "waived" }), TODAY)).toBe(false);
  });

  it("is never true of an undated task", () => {
    // "Daily" and "As needed" have no date, and a task with no date cannot be
    // late — that badge would be on the guide's evening check-in for ever.
    expect(isOverdue(task({ due_on: null }), TODAY)).toBe(false);
  });
});

describe("the state of the list", () => {
  it("counts a waived task as settled, not as outstanding", () => {
    // Nothing left to do on a porter waived because the trekker carries
    // their own pack. The written reason (0103) is what stops this being a
    // way to make the bar lie.
    const s = taskSummary([task({ state: "waived", waived_reason: "Carries their own pack." })], TODAY);
    expect(s.percent).toBe(100);
    expect(s.open).toEqual([]);
  });

  it("puts the soonest date next", () => {
    const s = taskSummary(
      [
        task({ id: "a", due_on: "2026-11-01" }),
        task({ id: "b", due_on: "2026-10-10" }),
        task({ id: "c", state: "done", due_on: "2026-10-01" }),
      ],
      TODAY,
    );
    expect(s.next?.id).toBe("b");
    expect(s.overdue.map((t) => t.id)).toEqual(["b"]);
  });

  it("still finds something to do when nothing carries a date", () => {
    const s = taskSummary([task({ id: "z", due_on: null })], TODAY);
    expect(s.next?.id).toBe("z");
  });

  it("is honest about an empty list rather than claiming 100", () => {
    expect(taskSummary([], TODAY).percent).toBe(0);
  });
});

describe("how it groups", () => {
  it("keeps the stages in the order they arrive", () => {
    const groups = byStage([
      task({ id: "1", stage: "Documents" }),
      task({ id: "2", stage: "Logistics" }),
      task({ id: "3", stage: "Documents" }),
    ]);
    expect(groups.map((g) => g.stage)).toEqual(["Documents", "Logistics"]);
    expect(groups[0].tasks).toHaveLength(2);
  });

  it("splits by whose move it is", () => {
    const split = byOwner([task({ owner: "client" }), task({ owner: "office" })]);
    expect(split.client).toHaveLength(1);
    expect(split.guide).toHaveLength(0);
  });
});

describe("how a date reads out loud", () => {
  it("says it the way a person would", () => {
    expect(dueLabel(task({ due_on: "2026-10-15" }), TODAY)).toBe("today");
    expect(dueLabel(task({ due_on: "2026-10-16" }), TODAY)).toBe("tomorrow");
    expect(dueLabel(task({ due_on: "2026-10-14" }), TODAY)).toBe("1 day late");
    expect(dueLabel(task({ due_on: "2026-10-10" }), TODAY)).toBe("5 days late");
    expect(dueLabel(task({ due_on: "2026-10-22" }), TODAY)).toBe("in 7 days");
    expect(dueLabel(task({ due_on: null }), TODAY)).toBe("");
  });
});
