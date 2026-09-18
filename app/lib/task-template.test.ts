import { describe, it, expect } from "vitest";
import {
  EXPERIENCE_TASKS,
  TREK_TASKS,
  shiftDate,
  stagesFor,
  tasksFor,
} from "./task-template";

const DATES = { startDate: "2027-03-01", bookedOn: "2026-10-01" };

describe("the spec's own table", () => {
  it("has the 30 trek tasks", () => {
    expect(TREK_TASKS).toHaveLength(30);
  });

  it("has the experience tasks that belong to a booking", () => {
    // The spec's rows 1 and 2 — creating the product, generating the month's
    // slots — belong to the product, not to whoever books first.
    expect(EXPERIENCE_TASKS).toHaveLength(13);
  });

  it("gives every task a key nothing else uses", () => {
    for (const list of [TREK_TASKS, EXPERIENCE_TASKS]) {
      expect(new Set(list.map((t) => t.key)).size).toBe(list.length);
    }
  });

  it("puts every task on exactly one of the four owners", () => {
    for (const t of [...TREK_TASKS, ...EXPERIENCE_TASKS]) {
      expect(["client", "guide", "office", "system"]).toContain(t.owner);
    }
  });

  it("says how each one is done, in the spec's own words", () => {
    for (const t of [...TREK_TASKS, ...EXPERIENCE_TASKS]) {
      expect(t.doneWhen.length).toBeGreaterThan(2);
    }
  });
});

describe("the T-offsets land on real dates", () => {
  const trek = tasksFor("trek", DATES);
  const find = (key: string) => trek.find((t) => t.key === key)!;

  it("counts back from departure", () => {
    expect(find("passport").dueOn).toBe("2026-11-01"); // T-120
    expect(find("permits").dueOn).toBe("2027-01-30"); // T-30
    expect(find("balance").dueOn).toBe("2027-02-15"); // T-14
    expect(find("advance").dueOn).toBe("2027-02-28"); // T-1
    expect(find("arrival").dueOn).toBe("2027-03-01"); // Day 0
  });

  it("counts forward for the settling up", () => {
    expect(find("receipts").dueOn).toBe("2027-03-04"); // T+3
    expect(find("payout").dueOn).toBe("2027-03-08"); // T+7
    expect(find("journal").dueOn).toBe("2027-03-15"); // T+14
  });

  it("counts the booking-anchored ones from the booking, not the trek", () => {
    // "Within 24h" and "within 7 days" are promises made when the deposit
    // lands, and a trek booked nine months out would otherwise ask the guide
    // to accept it in February.
    expect(find("guide_accept").dueOn).toBe("2026-10-02");
    expect(find("contract").dueOn).toBe("2026-10-08");
  });

  it("gives no date to the ones the spec gives no date", () => {
    // "Daily", "As needed", "Any" — a made-up date here is a red overdue
    // badge on a task that is not late.
    expect(find("checkin").dueOn).toBeNull();
    expect(find("deviation").dueOn).toBeNull();
    expect(find("quote").dueOn).toBeNull();
  });

  it("gives no dates at all when the trip has no dates", () => {
    for (const t of tasksFor("trek", {})) expect(t.dueOn).toBeNull();
  });
});

describe("which list a booking gets", () => {
  it("gives a momo crawl the experience list, so it never grows a permits task", () => {
    const keys = tasksFor("food_culture", DATES).map((t) => t.key);
    expect(keys).not.toContain("permits");
    expect(keys).toContain("pickups");
  });

  it("gives a trek the trek list", () => {
    expect(tasksFor("trek", DATES).map((t) => t.key)).toContain("permits");
  });

  it("names the stages in the order the spec lists them", () => {
    expect(stagesFor("trek")[0]).toBe("Inquiry");
    expect(stagesFor("trek")).toContain("Final prep");
    expect(stagesFor("day_hike")[0]).toBe("Booking");
  });
});

describe("shiftDate", () => {
  it("crosses a month and a year without drifting", () => {
    expect(shiftDate("2027-03-01", -1)).toBe("2027-02-28");
    expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29"); // leap year
  });
});
