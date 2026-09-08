import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_LABELS,
  EXPERIENCE_ORDER,
  TREKKER_SUB_RATINGS,
  profileIsEmpty,
  rateTrekker,
  trekkerSummary,
  type CompletedTrek,
  type TrekkerReview,
} from "./trekker-profile";

const review = (over: Partial<TrekkerReview> = {}): TrekkerReview => ({
  id: Math.random().toString(36).slice(2),
  overall: 5,
  body: null,
  sub_ratings: { fitness_honesty: 5, punctuality: 5, respect: 5 },
  published_at: "2026-09-01T00:00:00Z",
  author_name: "Pemba Sherpa",
  author_slug: "pemba-sherpa",
  trip_title: "Everest Base Camp",
  trip_date: "2026-04-02",
  ...over,
});

const trek = (over: Partial<CompletedTrek> = {}): CompletedTrek => ({
  bookingId: Math.random().toString(36).slice(2),
  title: "Everest Base Camp",
  routeName: "EBC",
  region: "Khumbu",
  days: 14,
  startDate: "2026-04-02",
  guideName: "Pemba Sherpa",
  guideSlug: "pemba-sherpa",
  partySize: 1,
  ...over,
});

describe("rateTrekker", () => {
  it("averages what the guides said", () => {
    const r = rateTrekker([review({ overall: 5 }), review({ overall: 4 })]);
    expect(r.average).toBe(4.5);
    expect(r.count).toBe(2);
  });

  it("counts nothing that is still sealed", () => {
    // Double-blind: a review is written the day the trek ends and stays
    // hidden until both sides have spoken or two weeks pass. Counting an
    // unpublished one would leak it back through the average.
    const r = rateTrekker([review({ overall: 5 }), review({ overall: 1, published_at: null })]);
    expect(r.average).toBe(5);
    expect(r.count).toBe(1);
  });

  it("is honest about having nothing", () => {
    expect(rateTrekker([]).average).toBeNull();
    expect(rateTrekker([review({ published_at: null })]).count).toBe(0);
  });

  it("averages each thing the guide was asked, separately", () => {
    const r = rateTrekker([
      review({ sub_ratings: { fitness_honesty: 3, punctuality: 5, respect: 5 } }),
      review({ sub_ratings: { fitness_honesty: 5, punctuality: 5, respect: 5 } }),
    ]);
    expect(r.subAverages.fitness_honesty).toBe(4);
    expect(r.subAverages.punctuality).toBe(5);
  });

  it("skips a sub-rating nobody scored rather than calling it zero", () => {
    const r = rateTrekker([review({ sub_ratings: { punctuality: 4 } })]);
    expect(r.subAverages.fitness_honesty).toBeUndefined();
    expect(r.subAverages.punctuality).toBe(4);
  });
});

describe("trekkerSummary", () => {
  it("counts days on the trail, not just treks", () => {
    const s = trekkerSummary([trek({ days: 14 }), trek({ days: 3, region: "Annapurna" })]);
    expect(s.treks).toBe(2);
    expect(s.days).toBe(17);
    expect(s.regions).toEqual(["Annapurna", "Khumbu"]);
  });

  it("says nothing rather than zero for somebody new", () => {
    const s = trekkerSummary([]);
    expect(s.treks).toBe(0);
    expect(s.days).toBe(0);
    expect(s.regions).toEqual([]);
  });
});

describe("profileIsEmpty", () => {
  it("is true only when a guide would read a blank page", () => {
    const none = rateTrekker([]);
    expect(profileIsEmpty([], none, null)).toBe(true);
    expect(profileIsEmpty([], none, { about_me: "I walk slowly." })).toBe(false);
    expect(profileIsEmpty([], none, { trek_experience: "first" })).toBe(false);
    expect(profileIsEmpty([trek()], none, null)).toBe(false);
    expect(profileIsEmpty([], rateTrekker([review()]), null)).toBe(false);
  });
});

describe("the vocabulary", () => {
  it("labels every key /g/bookings actually writes", () => {
    expect(TREKKER_SUB_RATINGS.map((s) => s.key)).toEqual([
      "fitness_honesty",
      "punctuality",
      "respect",
    ]);
  });

  it("has a label for every experience level, in order", () => {
    for (const k of EXPERIENCE_ORDER) expect(EXPERIENCE_LABELS[k]).toBeTruthy();
    expect(EXPERIENCE_ORDER[0]).toBe("first");
  });
});
