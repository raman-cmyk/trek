import { describe, it, expect } from "vitest";
import { countWords, guideCount, journalCount, seeAll } from "./counts";

describe("counting out loud", () => {
  it("does not say '1 guides'", () => {
    expect(guideCount(1)).toBe("1 guide");
    expect(guideCount(11)).toBe("11 guides");
  });

  it("gives zero words instead of a silent gap", () => {
    expect(guideCount(0)).toBe("no guides yet");
    expect(guideCount(null)).toBe("no guides yet");
    expect(guideCount(undefined)).toBe("no guides yet");
  });

  it("groups thousands, because 1128 is harder to read than 1,128", () => {
    expect(countWords(1128, "trek")).toBe("1,128 treks");
  });

  it("takes an irregular plural and its own zero", () => {
    expect(journalCount(1)).toBe("1 journal");
    expect(journalCount(0)).toBe("none written up yet");
  });

  it("refuses nonsense rather than printing it", () => {
    expect(guideCount(-5)).toBe("no guides yet");
    expect(guideCount(2.7)).toBe("2 guides");
    expect(guideCount(NaN)).toBe("no guides yet");
  });
});

describe("one see-all pattern", () => {
  it("names the number when there is one", () => {
    expect(seeAll(46)).toBe("See all 46 →");
    expect(seeAll(49, "guides")).toBe("See all 49 guides →");
  });

  it("falls back to the bare label rather than 'See all 0'", () => {
    expect(seeAll(0)).toBe("See all →");
    expect(seeAll(null)).toBe("See all →");
    expect(seeAll(undefined, "guides")).toBe("See all →");
  });
});
