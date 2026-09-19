import { describe, expect, it } from "vitest";
import { OFFERING_KINDS, OFFERING_KIND_LABEL, OFFERING_KIND_PLURAL, kindsLine } from "./offering-kinds";

describe("kindsLine", () => {
  it("says what a guide runs, in a fixed order", () => {
    // Whatever order the query returned, two guides offering the same things
    // must read the same way down a grid.
    expect(kindsLine(["food_culture", "trek", "day_hike"])).toBe(
      "Treks · Day hikes · Food & culture",
    );
    expect(kindsLine(["day_hike", "trek"])).toBe("Treks · Day hikes");
  });

  it("drops duplicates — a guide with six treks runs treks, once", () => {
    expect(kindsLine(["trek", "trek", "trek"])).toBe("Treks");
  });

  it("is empty for a guide with nothing listed", () => {
    expect(kindsLine([])).toBe("");
  });

  it("does not turn a card into a paragraph", () => {
    // All five would wrap to a second line on a 360px card.
    expect(kindsLine(OFFERING_KINDS)).toBe("Treks · Day hikes · Food & culture +2");
  });

  it("ignores a kind we do not know", () => {
    expect(kindsLine(["trek", "hovercraft"])).toBe("Treks");
  });
});

describe("the labels", () => {
  it("names every kind, singular and plural", () => {
    for (const k of OFFERING_KINDS) {
      expect(OFFERING_KIND_LABEL[k]).toBeTruthy();
      expect(OFFERING_KIND_PLURAL[k]).toBeTruthy();
    }
  });
});
