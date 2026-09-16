import { describe, expect, it } from "vitest";
import {
  HIGH_BAND_M,
  chaptersOf,
  dayShape,
  midCtaAfterDay,
  peakIndex,
  type ReadingDay,
} from "./journal-reading";

const day = (day_no: number, altitude_m: number | null, extra: Partial<ReadingDay> = {}): ReadingDay => ({
  day_no,
  title: `Day ${day_no}`,
  body: "A paragraph long enough that it is not a caption, written the way a guide writes it.",
  altitude_m,
  is_hard_day: false,
  photos: [{}],
  ...extra,
});

/** Everest Base Camp as the journal on production actually records it. */
const ebc: ReadingDay[] = [
  day(1, 2610),
  day(2, 3440),
  day(3, 3440),
  day(4, 3860),
  day(5, 4410),
  day(6, 4410, { is_hard_day: true }),
  day(7, 4940),
  day(8, 5164),
  day(9, 5644),
  day(10, 4940),
  day(11, 4410),
  day(12, 3440),
  day(13, 2800),
  day(14, 1400),
];

describe("chaptersOf", () => {
  it("breaks a fourteen-day trek where the walk actually changes", () => {
    const cs = chaptersOf(ebc);
    expect(cs.map((c) => [c.key, c.from, c.to])).toEqual([
      ["in", 1, 4],
      ["up", 5, 8],
      ["high", 9, 9],
      ["down", 10, 14],
    ]);
  });

  it("names a single top day in the singular", () => {
    const cs = chaptersOf(ebc);
    expect(cs.find((c) => c.key === "high")!.title).toBe("The high day");
  });

  it("names two days at the top in the plural", () => {
    // Gorak Shep within the band of Kala Patthar: two high days, not one.
    const two = ebc.map((d) => (d.day_no === 8 ? day(8, 5644 - HIGH_BAND_M + 10) : d));
    expect(chaptersOf(two).find((c) => c.key === "high")!.title).toBe("The high days");
  });

  it("covers every day exactly once, in order", () => {
    const cs = chaptersOf(ebc);
    const covered: number[] = [];
    for (const c of cs) for (let d = c.from; d <= c.to; d++) covered.push(d);
    expect(covered).toEqual(ebc.map((d) => d.day_no));
  });

  it("gives a short walk no chapters at all", () => {
    expect(chaptersOf([day(1, 1400), day(2, 2600), day(3, 3200), day(4, 2000)])).toEqual([]);
  });

  it("gives a flat walk no chapters — there is no shape to break on", () => {
    expect(chaptersOf([1, 2, 3, 4, 5, 6, 7].map((n) => day(n, 1400)))).toEqual([]);
  });

  it("leaves a trek that starts at its top unchaptered rather than inventing a walk in", () => {
    // Flown to the high point on day two and walked down from there.
    const down = [day(1, 3800), day(2, 5400), day(3, 4900), day(4, 4200), day(5, 3400), day(6, 2600)];
    expect(chaptersOf(down)).toEqual([]);
  });

  it("carries a blank altitude forward instead of reading it as sea level", () => {
    const gappy = ebc.map((d) => (d.day_no === 3 || d.day_no === 11 ? { ...d, altitude_m: null } : d));
    expect(chaptersOf(gappy).map((c) => [c.key, c.from, c.to])).toEqual([
      ["in", 1, 4],
      ["up", 5, 8],
      ["high", 9, 9],
      ["down", 10, 14],
    ]);
  });

  it("gives up when no day has an altitude", () => {
    expect(chaptersOf([1, 2, 3, 4, 5, 6, 7].map((n) => day(n, null)))).toEqual([]);
  });

  it("reports indexes that point at the right entries", () => {
    const cs = chaptersOf(ebc);
    for (const c of cs) {
      expect(ebc[c.firstIndex].day_no).toBe(c.from);
      expect(ebc[c.lastIndex].day_no).toBe(c.to);
    }
  });
});

describe("peakIndex", () => {
  it("finds the highest day", () => {
    expect(peakIndex(ebc)).toBe(8);
  });

  it("gives a tie to the first time you stood that high", () => {
    expect(peakIndex([day(1, 4000), day(2, 5000), day(3, 5000)])).toBe(1);
  });

  it("returns -1 when nothing is recorded", () => {
    expect(peakIndex([day(1, null), day(2, null)])).toBe(-1);
  });
});

describe("dayShape", () => {
  const ctx = { isPeak: false, opensChapter: false };

  it("features the highest day", () => {
    expect(dayShape(day(9, 5644), { ...ctx, isPeak: true })).toBe("feature");
  });

  it("features the hard day", () => {
    expect(dayShape(day(6, 4410, { is_hard_day: true }), ctx)).toBe("feature");
  });

  it("features the day that opens a chapter", () => {
    expect(dayShape(day(5, 4410), { ...ctx, opensChapter: true })).toBe("feature");
  });

  it("splits a short note with one photograph", () => {
    expect(dayShape(day(3, 3440, { body: "A rest day. We walked up to Khumjung and came back." }), ctx)).toBe("split");
  });

  it("does not split a long day — the words need the full measure", () => {
    expect(dayShape(day(3, 3440, { body: "x".repeat(400) }), ctx)).toBe("standard");
  });

  it("keeps a day with several photographs standard", () => {
    expect(dayShape(day(3, 3440, { photos: [{}, {}, {}] }), ctx)).toBe("standard");
  });

  it("keeps a day with no photographs standard, whatever else it is", () => {
    expect(dayShape(day(6, 4410, { is_hard_day: true, photos: [] }), { ...ctx, isPeak: true })).toBe("standard");
  });
});

describe("midCtaAfterDay", () => {
  it("puts the offer in a chapter's pause, half way down", () => {
    expect(midCtaAfterDay(ebc, chaptersOf(ebc))).toBe(8);
  });

  it("falls back to the middle day when there are no chapters", () => {
    const flat = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => day(n, 1400));
    expect(midCtaAfterDay(flat, [])).toBe(5);
  });

  it("leaves a short journal with one offer at the foot", () => {
    expect(midCtaAfterDay([day(1, 1400), day(2, 2000), day(3, 2400)], [])).toBeNull();
  });
});
