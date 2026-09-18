import { describe, it, expect } from "vitest";
import { promptLines, tripToReview, withinWindow, type FinishedTrip } from "./review-prompt";

const TODAY = "2026-09-18";

const trip = (over: Partial<FinishedTrip> = {}): FinishedTrip => ({
  bookingId: "b1",
  title: "Langtang Valley Experience",
  guideFirstName: "pratik",
  endDate: "2026-09-10",
  ...over,
});

describe("which trip to ask about", () => {
  it("asks about the one they remember — the most recent", () => {
    const pick = tripToReview(
      [
        trip({ bookingId: "old", endDate: "2026-07-01" }),
        trip({ bookingId: "new", endDate: "2026-09-10" }),
      ],
      [],
      TODAY,
    );
    expect(pick?.bookingId).toBe("new");
  });

  it("stops asking about one they waved away", () => {
    expect(tripToReview([trip()], ["b1"], TODAY)).toBeNull();
  });

  it("moves to the next one when the first was waved away", () => {
    const pick = tripToReview(
      [trip({ bookingId: "b1" }), trip({ bookingId: "b2", endDate: "2026-08-01" })],
      ["b1"],
      TODAY,
    );
    expect(pick?.bookingId).toBe("b2");
  });

  it("lets a trip go after three months", () => {
    // Being asked in March about a walk in October is a filing cabinet
    // falling on somebody, and the review would mostly be a guess.
    expect(tripToReview([trip({ endDate: "2026-06-01" })], [], TODAY)).toBeNull();
  });

  it("asks about nothing when there is nothing", () => {
    expect(tripToReview([], [], TODAY)).toBeNull();
  });
});

describe("the window", () => {
  it("counts to the day", () => {
    expect(withinWindow("2026-06-20", TODAY)).toBe(true); // 90 days
    expect(withinWindow("2026-06-19", TODAY)).toBe(false); // 91
  });

  it("does not lose a review over a missing date", () => {
    // It finished; we just cannot say when.
    expect(withinWindow(null, TODAY)).toBe(true);
    expect(withinWindow("", TODAY)).toBe(true);
  });
});

describe("what it says", () => {
  it("names the trip and the guide, because that is who it is about", () => {
    const { title, body } = promptLines(trip());
    expect(title).toContain("Langtang Valley Experience");
    expect(body).toContain("pratik");
  });

  it("says the review is not published straight away", () => {
    expect(promptLines(trip()).body).toContain("hidden");
  });
});
