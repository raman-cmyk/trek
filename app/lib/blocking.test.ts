import { describe, it, expect } from "vitest";
import {
  banDurationFor,
  blockStage,
  blockedMessage,
  endOfDayIso,
  filterMatches,
  guideStatusWhileBlocked,
  isOpen,
} from "./blocking";

const NOW = new Date("2026-09-14T12:00:00Z");

describe("where a block is in its life", () => {
  it("a ban is a ban until somebody lifts it", () => {
    expect(blockStage({ kind: "banned", ends_at: null, lifted_at: null }, NOW)).toBe("banned");
  });
  it("a suspension with a date still to come is suspended", () => {
    expect(
      blockStage({ kind: "suspended", ends_at: "2026-10-01T00:00:00Z", lifted_at: null }, NOW),
    ).toBe("suspended");
  });
  it("a suspension whose date passed has expired", () => {
    expect(
      blockStage({ kind: "suspended", ends_at: "2026-09-01T00:00:00Z", lifted_at: null }, NOW),
    ).toBe("expired");
  });
  it("an open-ended suspension stays suspended", () => {
    expect(blockStage({ kind: "suspended", ends_at: null, lifted_at: null }, NOW)).toBe("suspended");
  });
  it("lifted wins over everything", () => {
    expect(
      blockStage({ kind: "banned", ends_at: null, lifted_at: "2026-09-10T00:00:00Z" }, NOW),
    ).toBe("lifted");
  });
  it("only suspended and banned keep somebody out", () => {
    expect(isOpen({ kind: "banned", ends_at: null, lifted_at: null }, NOW)).toBe(true);
    expect(
      isOpen({ kind: "suspended", ends_at: "2026-09-01T00:00:00Z", lifted_at: null }, NOW),
    ).toBe(false);
  });
});

describe("the filter chips", () => {
  it("'blocked now' is suspended plus banned", () => {
    expect(filterMatches("active", "suspended")).toBe(true);
    expect(filterMatches("active", "banned")).toBe(true);
    expect(filterMatches("active", "expired")).toBe(false);
    expect(filterMatches("active", "lifted")).toBe(false);
  });
  it("'lifted' includes suspensions that ran out on their own", () => {
    expect(filterMatches("lifted", "expired")).toBe(true);
    expect(filterMatches("lifted", "lifted")).toBe(true);
  });
  it("'everything' is everything", () => {
    expect(filterMatches("all", "banned")).toBe(true);
    expect(filterMatches("all", "expired")).toBe(true);
  });
});

describe("what Supabase Auth is told", () => {
  it("a ban is a century", () => {
    expect(banDurationFor("banned", null, NOW)).toBe("876000h");
  });
  it("an open-ended suspension is a century too", () => {
    expect(banDurationFor("suspended", null, NOW)).toBe("876000h");
  });
  it("a dated suspension rounds up to the hour", () => {
    expect(banDurationFor("suspended", "2026-09-14T13:30:00Z", NOW)).toBe("2h");
  });
  it("is never zero", () => {
    expect(banDurationFor("suspended", "2026-09-14T12:00:00Z", NOW)).toBe("1h");
  });
});

describe("the date the office types", () => {
  it("becomes the end of that day", () => {
    expect(endOfDayIso("2026-10-01")).toBe("2026-10-01T23:59:59.000Z");
  });
  it("rejects junk", () => {
    expect(endOfDayIso("next week")).toBeNull();
    expect(endOfDayIso("2026-13-45")).toBeNull();
  });
});

describe("a blocked guide on the public site", () => {
  it("is hidden as suspended or removed", () => {
    expect(guideStatusWhileBlocked("suspended")).toBe("suspended");
    expect(guideStatusWhileBlocked("banned")).toBe("removed");
  });
});

describe("what the person reads", () => {
  const fmt = (iso: string) => `D(${iso.slice(0, 10)})`;
  it("says when a suspension ends", () => {
    expect(blockedMessage({ kind: "suspended", ends_at: "2026-10-01T23:59:59Z" }, fmt)).toBe(
      "Your account is paused until D(2026-10-01).",
    );
  });
  it("says a ban is closed", () => {
    expect(blockedMessage({ kind: "banned", ends_at: null }, fmt)).toBe(
      "Your account has been closed.",
    );
  });
  it("has something to say with no row at all", () => {
    expect(blockedMessage(null, fmt)).toBe("Your account is paused.");
  });
});
