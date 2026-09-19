import { describe, expect, it } from "vitest";
import { homeRows, mustListATrip, type HomeCounts } from "./guide-home";

const quiet: HomeCounts = {
  offerings: 2,
  upcoming: 0,
  questions: 0,
  unrepliedReviews: 0,
};

describe("homeRows", () => {
  it("is one list, not six tiles and three cards", () => {
    // The screen this replaces had the same two destinations on it three
    // times over. Every row here goes somewhere different.
    const rows = homeRows(quiet);
    expect(new Set(rows.map((r) => r.to)).size).toBe(rows.length);
  });

  it("never says 'experiences' or 'journeys' to a guide", () => {
    // Two of the six old labels were platform words. A guide reading English
    // as a third language cannot tell "Your experiences" (trips you sell)
    // from "Booked trips" (trips you lead).
    const words = homeRows(quiet)
      .flatMap((r) => [r.label, r.note])
      .join(" ")
      .toLowerCase();
    expect(words).not.toContain("experience");
    expect(words).not.toContain("journey");
  });

  it("says which trips are which", () => {
    const rows = homeRows(quiet);
    expect(rows.find((r) => r.to === "/g/experiences")!.label).toBe("Trips you offer");
    expect(rows.find((r) => r.to === "/g/bookings")!.label).toBe("Trips you're leading");
  });

  it("puts writing up a trek last and loudest", () => {
    const rows = homeRows(quiet);
    expect(rows[rows.length - 1].to).toBe("/g/journals");
    expect(rows.filter((r) => r.loud)).toHaveLength(1);
  });

  it("carries no badges when nobody is waiting", () => {
    expect(homeRows(quiet).every((r) => r.badge === null)).toBe(true);
  });

  it("badges only the rows somebody is waiting behind", () => {
    const rows = homeRows({
      offerings: 2,
      upcoming: 3,
      questions: 1,
      unrepliedReviews: 4,
    });
    const badge = (to: string) => rows.find((r) => r.to === to)!.badge;
    expect(badge("/g/bookings")).toBe(3);
    expect(badge("/g/questions")).toBe(1);
    expect(badge("/g/reviews")).toBe(4);
    expect(badge("/g/calendar")).toBeNull();
  });

  it("fits a phone: seven rows is the whole screen", () => {
    // 360px, one column. Any more and it is a menu again.
    expect(homeRows(quiet)).toHaveLength(7);
  });
});

describe("mustListATrip", () => {
  it("is true for a guide with nothing listed, because they are not on the site", () => {
    // Migration 0110: public_guides requires a live offering.
    expect(mustListATrip({ ...quiet, offerings: 0 })).toBe(true);
  });

  it("is false the moment one trip is live", () => {
    expect(mustListATrip({ ...quiet, offerings: 1 })).toBe(false);
  });
});
