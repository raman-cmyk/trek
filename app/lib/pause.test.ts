import { describe, expect, it } from "vitest";
import {
  PAUSE_REASON_MAX,
  cleanReason,
  isStalePause,
  pauseProblem,
  pauseSms,
  pausedFor,
} from "./pause";

describe("pauseProblem", () => {
  it("refuses an empty reason — the whole point is that there is one", () => {
    expect(pauseProblem("")).toMatch(/Say why/);
    expect(pauseProblem("   ")).toMatch(/Say why/);
  });

  it("refuses a reason too short to act on", () => {
    expect(pauseProblem("wrong")).toMatch(/few more words/);
  });

  it("accepts a real reason", () => {
    expect(pauseProblem("The summit photo is not his — it is off a stock site.")).toBeNull();
  });

  it("refuses an essay", () => {
    expect(pauseProblem("a".repeat(PAUSE_REASON_MAX + 1))).toMatch(/under 500/);
  });
});

describe("cleanReason", () => {
  it("trims and collapses blank lines", () => {
    expect(cleanReason("  price is wrong\n\n\n  fix the single supplement  ")).toBe(
      "price is wrong\nfix the single supplement",
    );
  });

  it("never stores more than the cap", () => {
    expect(cleanReason("b".repeat(900))).toHaveLength(PAUSE_REASON_MAX);
  });
});

describe("pausedFor", () => {
  const now = "2026-09-14T10:00:00Z";
  it("says today, not '0 days ago'", () => {
    expect(pausedFor("2026-09-14T02:00:00Z", now)).toBe("today");
  });
  it("says yesterday", () => {
    expect(pausedFor("2026-09-13T02:00:00Z", now)).toBe("yesterday");
  });
  it("counts days inside a month", () => {
    expect(pausedFor("2026-09-01T10:00:00Z", now)).toBe("13 days ago");
  });
  it("switches to months once it is embarrassing", () => {
    expect(pausedFor("2026-06-14T10:00:00Z", now)).toBe("3 months ago");
  });
  it("is null when we never recorded one", () => {
    expect(pausedFor(null, now)).toBeNull();
  });
  it("does not invent a duration from a clock skewed into the future", () => {
    expect(pausedFor("2026-09-20T10:00:00Z", now)).toBeNull();
  });
});

describe("isStalePause", () => {
  const now = "2026-09-14T10:00:00Z";
  it("a pause from last week is not stale", () => {
    expect(isStalePause("2026-09-07T10:00:00Z", now)).toBe(false);
  });
  it("a pause from two months ago is somebody forgetting", () => {
    expect(isStalePause("2026-07-14T10:00:00Z", now)).toBe(true);
  });
  it("no date is not stale", () => {
    expect(isStalePause(null, now)).toBe(false);
  });
});

describe("pauseSms", () => {
  it("fits one segment and carries the link, which is the part they tap", () => {
    const sms = pauseSms(
      "Annapurna Base Camp — 12 days with Pemba",
      "The summit photograph is not yours; please use your own.",
      "https://guidesofnepal.com/g/experiences/abc",
    );
    expect(sms.length).toBeLessThanOrEqual(200);
    expect(sms).toContain("https://guidesofnepal.com/g/experiences/abc");
  });
});
