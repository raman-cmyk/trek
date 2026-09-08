import { describe, expect, it } from "vitest";
import {
  NEPAL_OFFSET_MINUTES,
  awayNote,
  clockIn,
  humanMins,
  isAsleep,
  nepalClock,
} from "./local-time";

// 2026-09-07T20:25:00Z → 02:10 next day in Nepal (+05:45).
const NIGHT_IN_NEPAL = new Date("2026-09-07T20:25:00Z");
// 2026-09-07T04:00:00Z → 09:45 in Nepal.
const MORNING_IN_NEPAL = new Date("2026-09-07T04:00:00Z");

describe("nepalClock", () => {
  it("uses the real quarter-hour offset, not a rounded one", () => {
    expect(NEPAL_OFFSET_MINUTES).toBe(345);
    expect(nepalClock(MORNING_IN_NEPAL).label).toBe("9:45am");
  });

  it("knows the middle of the night", () => {
    const c = nepalClock(NIGHT_IN_NEPAL);
    expect(c.label).toBe("2:10am");
    expect(c.asleep).toBe(true);
    expect(nepalClock(MORNING_IN_NEPAL).asleep).toBe(false);
  });
});

describe("isAsleep", () => {
  it("covers ten at night to six in the morning", () => {
    expect(isAsleep(23)).toBe(true);
    expect(isAsleep(2)).toBe(true);
    expect(isAsleep(5)).toBe(true);
    expect(isAsleep(6)).toBe(false);
    expect(isAsleep(21)).toBe(false);
  });
});

describe("clockIn", () => {
  it("reads a zone through Intl, daylight saving and all", () => {
    // 20:25 UTC in September is 14:25 in Denver (MDT, UTC-6).
    expect(clockIn("America/Denver", NIGHT_IN_NEPAL)?.label).toBe("2:25pm");
  });

  it("is null rather than wrong when the zone is unknown", () => {
    expect(clockIn(null)).toBeNull();
    expect(clockIn("")).toBeNull();
    expect(clockIn("Middle/Earth")).toBeNull();
  });
});

describe("awayNote", () => {
  it("explains the silence when they are asleep", () => {
    const note = awayNote({
      name: "Pemba",
      clock: nepalClock(NIGHT_IN_NEPAL),
      theyAreTheGuide: true,
    })!;
    expect(note).toContain("2:10am");
    expect(note).toContain("middle of the night");
    expect(note).toContain("Write anyway");
  });

  it("gives their own measured reply time when they are awake", () => {
    const note = awayNote({
      name: "Pemba",
      clock: nepalClock(MORNING_IN_NEPAL),
      medianReplyMins: 180,
      theyAreTheGuide: true,
    })!;
    expect(note).toContain("9:45am");
    expect(note).toContain("about 3 hours");
  });

  it("promises nothing on a guide's behalf when there is no measurement", () => {
    const note = awayNote({
      name: "Pemba",
      clock: nepalClock(MORNING_IN_NEPAL),
      theyAreTheGuide: true,
    })!;
    expect(note).toContain("within a day");
  });

  it("says nothing at all when we do not know their clock", () => {
    expect(awayNote({ name: "Mia", clock: null, theyAreTheGuide: false })).toBeNull();
  });

  it("reads from the guide's side too", () => {
    const note = awayNote({
      name: "Mia",
      clock: clockIn("America/Denver", NIGHT_IN_NEPAL),
      theyAreTheGuide: false,
    })!;
    expect(note).toContain("2:25pm");
  });
});

describe("humanMins", () => {
  it("never says 173 minutes", () => {
    expect(humanMins(40)).toBe("40 minutes");
    expect(humanMins(173)).toBe("about 3 hours");
    expect(humanMins(60 * 30)).toBe("about 1 day");
  });
});
