import { describe, expect, it } from "vitest";
import { featuredReview, MIN_BODY, MIN_STARS, scoreReview } from "./featured-review";

const r = (o: Partial<Parameters<typeof scoreReview>[0]> = {}) => ({
  id: Math.random().toString(36).slice(2),
  overall: 5,
  body: "A genuinely long review that says something specific about the walk and the guide.",
  published_at: "2026-09-01T00:00:00Z",
  kind: "trek" as string | null,
  ...o,
});

describe("featuredReview", () => {
  it("does not pick the newest when the newest argues against us", () => {
    // The real case from production: a 4.0 about a yoga class, newest, beside
    // five-star trek reviews.
    const yoga = r({
      overall: 4,
      kind: "food_culture",
      published_at: "2026-09-14T00:00:00Z",
      body: "Lovely calm sunrise yoga by the lake with Sunita to end the trip.",
    });
    const trek = r({
      overall: 5,
      kind: "trek",
      published_at: "2026-08-01T00:00:00Z",
      body: "Gokyo Ri at sunrise with Lakpa was the highlight of my year. He timed everything perfectly.",
    });
    expect(featuredReview([yoga, trek])?.id).toBe(trek.id);
  });

  it("prefers a trek to a day experience at the same rating", () => {
    const day = r({ kind: "day_hike", id: "day" });
    const trek = r({ kind: "trek", id: "trek" });
    expect(featuredReview([day, trek])?.id).toBe("trek");
  });

  it("refuses anything under the star floor", () => {
    expect(featuredReview([r({ overall: MIN_STARS - 0.1 })])).toBeNull();
  });

  it("refuses a rating dressed as a testimonial", () => {
    expect(featuredReview([r({ body: "Great!" })])).toBeNull();
    expect(featuredReview([r({ body: "x".repeat(MIN_BODY - 1) })])).toBeNull();
  });

  it("returns nothing rather than something weak", () => {
    // An unconvincing quotation is worse than an empty space, so the section
    // is allowed not to render.
    expect(featuredReview([r({ overall: 3 }), r({ body: null })])).toBeNull();
    expect(featuredReview([])).toBeNull();
    expect(featuredReview(null)).toBeNull();
  });

  it("breaks a tie on recency, so the page still changes", () => {
    const older = r({ id: "older", published_at: "2026-01-01T00:00:00Z" });
    const newer = r({ id: "newer", published_at: "2026-06-01T00:00:00Z" });
    expect(featuredReview([older, newer])?.id).toBe("newer");
  });

  it("does not let an essay win on length alone", () => {
    const fiveStar = r({ id: "five", overall: 5, body: "x".repeat(80) });
    const fourFive = r({ id: "fourfive", overall: 4.5, body: "x".repeat(4000) });
    expect(featuredReview([fourFive, fiveStar])?.id).toBe("five");
  });

  it("copes with a review whose kind we could not resolve", () => {
    expect(featuredReview([r({ kind: null })])).not.toBeNull();
  });
});
