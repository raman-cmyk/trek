import { describe, it, expect } from "vitest";
import { SOON_SECONDS, clockFor, holdAdvice, holdStatus, holdWindowWords } from "./hold";

const at = (iso: string) => new Date(iso);

describe("the clock", () => {
  it("shows hours while there are hours", () => {
    expect(clockFor(3 * 3600 - 19)).toBe("2:59:41");
    expect(clockFor(3600)).toBe("1:00:00");
  });

  it("drops the hour inside the last one, so it reads at a glance", () => {
    expect(clockFor(581)).toBe("9:41");
    expect(clockFor(59)).toBe("0:59");
    expect(clockFor(9)).toBe("0:09");
  });

  it("never shows a negative", () => {
    expect(clockFor(-500)).toBe("0:00");
  });
});

describe("the hold on a booking", () => {
  const now = at("2026-09-14T12:00:00Z");

  it("counts down from the deadline the database holds", () => {
    const h = holdStatus("2026-09-14T14:59:41Z", now);
    expect(h.state).toBe("running");
    expect(h.clock).toBe("2:59:41");
    expect(h.words).toBe("Holding your dates");
  });

  it("turns urgent in the last half hour", () => {
    expect(holdStatus("2026-09-14T12:29:00Z", now).state).toBe("soon");
    expect(holdStatus("2026-09-14T12:31:00Z", now).state).toBe("running");
    expect(SOON_SECONDS).toBe(1800);
  });

  it("is expired, not merely finished, once the deadline passes", () => {
    const h = holdStatus("2026-09-14T11:59:59Z", now);
    expect(h.state).toBe("expired");
    expect(h.secondsLeft).toBe(0);
    expect(h.words).toContain("open to other trekkers");
  });

  it("distinguishes no hold from a finished one", () => {
    expect(holdStatus(null, now).state).toBe("none");
    expect(holdStatus(undefined, now).state).toBe("none");
    expect(holdStatus(null, now).clock).toBe("");
  });

  it("reads the stamp Postgres returns", () => {
    expect(holdStatus("2026-09-14 13:00:00+00", now).clock).toBe("1:00:00");
  });

  it("shows no clock at all rather than a broken one", () => {
    expect(holdStatus("not a date", now).state).toBe("none");
  });
});

describe("what to do about it", () => {
  it("offers a way back in when the hold has gone", () => {
    expect(holdAdvice("expired", "Pemba")).toBe(
      "Message Pemba — if the days are still free they can hold them again.",
    );
  });

  it("says what the clock is protecting while it runs", () => {
    expect(holdAdvice("running", "Pemba")).toContain("Nobody else can book these days");
    expect(holdAdvice("soon", "Pemba")).toContain("Pay now");
  });

  it("says nothing when there is no hold", () => {
    expect(holdAdvice("none", "Pemba")).toBeNull();
  });
});

describe("the window, in words", () => {
  it("says hours for a short hold and days for a long one", () => {
    expect(holdWindowWords(3)).toBe("3 hours");
    expect(holdWindowWords(1)).toBe("one hour");
    expect(holdWindowWords(24)).toBe("24 hours");
    expect(holdWindowWords(48)).toBe("2 days");
  });
});
