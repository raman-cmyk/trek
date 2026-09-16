import { describe, expect, it } from "vitest";
import {
  DEPARTURE_WINDOW_DAYS,
  addDays,
  daysInRange,
  escapeLike,
  guideMatchesText,
  parseRange,
  isRealDate,
} from "./browse";

const TODAY = "2026-08-11";

describe("parseRange", () => {
  it("returns null without a from date", () => {
    expect(parseRange(null, "2026-10-01", TODAY)).toBeNull();
    expect(parseRange("october", null, TODAY)).toBeNull();
  });

  it("clamps a past start to today", () => {
    expect(parseRange("2020-01-01", "2026-10-01", TODAY)?.from).toBe(TODAY);
  });

  it("reads a lone departure date as a window, not as a one-day trek", () => {
    // The hero asks only when you set off. A one-day window would have asked
    // the calendar who is free for exactly one day.
    expect(parseRange("2026-10-01", null, TODAY)).toEqual({
      from: "2026-10-01",
      to: addDays("2026-10-01", DEPARTURE_WINDOW_DAYS),
    });
  });

  it("treats a backwards end date as a typo, not a request", () => {
    expect(parseRange("2026-10-05", "2026-10-01", TODAY)?.to).toBe(
      addDays("2026-10-05", DEPARTURE_WINDOW_DAYS),
    );
  });

  it("still honours a real range when both dates are given", () => {
    expect(parseRange("2026-10-01", "2026-10-15", TODAY)).toEqual({
      from: "2026-10-01",
      to: "2026-10-15",
    });
  });

  it("a lone departure date leaves room for the longest route", () => {
    const r = parseRange("2026-10-01", null, TODAY)!;
    expect(daysInRange(r)).toBeGreaterThanOrEqual(21);
  });

  it("caps the window at a year so a pasted date can't scan the table", () => {
    expect(parseRange("2026-10-01", "2099-01-01", TODAY)?.to).toBe("2027-10-01");
  });
});

describe("date helpers", () => {
  it("crosses month and year boundaries in UTC", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("counts an inclusive range", () => {
    expect(daysInRange({ from: "2026-10-01", to: "2026-10-31" })).toBe(31);
    expect(daysInRange({ from: "2026-10-01", to: "2026-10-01" })).toBe(1);
  });
});

describe("escapeLike", () => {
  it("strips the characters that would break a PostgREST or= filter", () => {
    expect(escapeLike("Annapurna, (north)")).toBe("Annapurna   north");
    expect(escapeLike("50%")).toBe("50");
  });
});

describe("guideMatchesText", () => {
  const g = {
    full_name: "Sunita Gurung",
    home_district: "Kaski",
    hook_line: "A rare woman guide leading Annapurna",
    bio: "Solo women travellers, I have got you.",
  };

  it("matches name, district, hook and bio, case-insensitively", () => {
    expect(guideMatchesText(g, "sunita")).toBe(true);
    expect(guideMatchesText(g, "KASKI")).toBe(true);
    expect(guideMatchesText(g, "Annapurna")).toBe(true);
    expect(guideMatchesText(g, "solo women")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(guideMatchesText(g, "Everest")).toBe(false);
  });

  it("tolerates null district, hook and bio", () => {
    expect(
      guideMatchesText(
        { full_name: "Ang Dorje Sherpa", home_district: null, hook_line: null, bio: null },
        "dorje",
      ),
    ).toBe(true);
  });
});

/**
 * The 500 on a mangled date in a URL.
 *
 * `/experiences?from=9999-99-99` and `/guides?from=2026-13-40` both returned
 * a 500 in production. The shape regex passed them — four digits, two, two —
 * and `new Date("9999-99-99T00:00:00Z")` is an Invalid Date whose
 * `toISOString()` throws RangeError rather than returning anything, so the
 * whole browse page died on a link somebody could paste or a crawler could
 * invent.
 */
describe("a date that is the right shape but is not a date", () => {
  const TODAY = "2026-09-16";

  it.each(["9999-99-99", "2026-13-40", "2026-00-10", "2026-01-32"])(
    "parseRange refuses %s instead of throwing",
    (bad) => {
      expect(() => parseRange(bad, null, TODAY)).not.toThrow();
      expect(parseRange(bad, null, TODAY)).toBeNull();
    },
  );

  it("refuses an impossible day rather than rolling it into the next month", () => {
    // new Date("2026-02-30") does not complain — it quietly becomes 2 March,
    // which would show somebody results for a date they never asked for.
    expect(parseRange("2026-02-30", null, TODAY)).toBeNull();
  });

  it("still takes a real date, and a real end date", () => {
    expect(parseRange("2026-10-01", "2026-10-14", TODAY)).toEqual({
      from: "2026-10-01",
      to: "2026-10-14",
    });
  });

  it("ignores a mangled end date rather than dying on it", () => {
    const r = parseRange("2026-10-01", "9999-99-99", TODAY);
    expect(r?.from).toBe("2026-10-01");
    expect(r?.to).toBeTruthy();
  });

  it("addDays hands back what it was given rather than throwing", () => {
    expect(() => addDays("9999-99-99", 7)).not.toThrow();
    expect(addDays("9999-99-99", 7)).toBe("9999-99-99");
    expect(addDays("2026-10-01", 7)).toBe("2026-10-08");
  });
});

describe("isRealDate", () => {
  it("accepts dates that exist", () => {
    expect(isRealDate("2026-02-28")).toBe(true);
    expect(isRealDate("2024-02-29")).toBe(true); // a real leap day
  });
  it("rejects dates that do not", () => {
    expect(isRealDate("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isRealDate("2026-13-01")).toBe(false);
    expect(isRealDate("not-a-date")).toBe(false);
    expect(isRealDate("2026-1-1")).toBe(false);
  });
});
