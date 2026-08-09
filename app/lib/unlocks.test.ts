import { describe, it, expect } from "vitest";
import { briefUnlocked, guidePhoneUnlocked, daysUntilStart } from "./unlocks";

describe("My Trips unlocks (time-travel)", () => {
  const start = "2026-10-20";

  it("counts whole days until start", () => {
    expect(daysUntilStart(start, "2026-10-13")).toBe(7);
    expect(daysUntilStart(start, "2026-10-18")).toBe(2);
  });

  it("brief unlocks at T-7 and stays unlocked after", () => {
    expect(briefUnlocked(start, "2026-10-12")).toBe(false); // 8 days out
    expect(briefUnlocked(start, "2026-10-13")).toBe(true); // 7 days out
    expect(briefUnlocked(start, "2026-10-19")).toBe(true); // 1 day out
  });

  it("guide phone unlocks at T-48h and stays unlocked after", () => {
    expect(guidePhoneUnlocked(start, "2026-10-17")).toBe(false); // 3 days out
    expect(guidePhoneUnlocked(start, "2026-10-18")).toBe(true); // 2 days out
    expect(guidePhoneUnlocked(start, "2026-10-20")).toBe(true); // start day
  });
});
