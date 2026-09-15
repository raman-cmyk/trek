import { describe, expect, it } from "vitest";
import { ratingLine, reviewsLabel, starText } from "./card-rating";

describe("ratingLine", () => {
  it("shows the rating when there is one", () => {
    expect(ratingLine({ value: 4.9, count: 12 })).toEqual({
      stars: 4.9,
      count: 12,
      text: null,
    });
  });

  it("does not treat zero reviews as a rating of zero", () => {
    // Some callers build the map by guide id and hand back a default rather
    // than omitting the key. A 0.0 on a card reads as a bad guide, not a new
    // one, and that is a lie about a real person.
    expect(ratingLine({ value: 0, count: 0 }).stars).toBeNull();
  });

  it("falls back to experience, which is true and useful", () => {
    expect(ratingLine(null, 14).text).toBe("New here · 14 years guiding");
    expect(ratingLine(undefined, 1).text).toBe("New here · 1 year guiding");
  });

  it("says so plainly when there is nothing at all", () => {
    expect(ratingLine(null, 0).text).toBe("No reviews yet");
    expect(ratingLine(null, null).text).toBe("No reviews yet");
    expect(ratingLine(null).text).toBe("No reviews yet");
  });

  it("never invents a number", () => {
    for (const r of [ratingLine(null, 14), ratingLine(null), ratingLine({ value: 0, count: 0 })]) {
      expect(r.stars).toBeNull();
      expect(r.count).toBe(0);
    }
  });

  it("ignores a rating that is not a number", () => {
    expect(ratingLine({ value: NaN, count: 3 }).stars).toBeNull();
  });
});

describe("starText", () => {
  it("is one decimal so a column lines up", () => {
    expect(starText(5)).toBe("5.0");
    expect(starText(4.9)).toBe("4.9");
    expect(starText(4.25)).toBe("4.3");
  });

  it("is fed a value that is already rounded, which is why it can be exact", () => {
    // guideRatings() does Math.round(avg * 10) / 10 before this ever sees a
    // number. That matters: toFixed does NOT round half away from zero on a
    // binary float — (4.85).toFixed(1) is "4.8", because 4.85 is stored as
    // slightly less than 4.85. Rounding upstream keeps the two agreeing.
    const avg = Math.round((4.85 as number) * 10) / 10;
    expect(starText(avg)).toBe("4.9");
  });
});

describe("reviewsLabel", () => {
  it("gets the noun right for a screen reader", () => {
    expect(reviewsLabel(1)).toBe("1 review");
    expect(reviewsLabel(12)).toBe("12 reviews");
  });
});
