import { describe, expect, it } from "vitest";
import { cashEstimateNpr, preTrekBrief, seasonOf, type TripFacts } from "./pre-trek";

const trek: TripFacts = {
  kind: "trek",
  days: 14,
  maxAltitudeM: 5364,
  region: "Khumbu",
  startDate: "2026-10-12",
  partySize: 2,
};

const keys = (t: TripFacts) => preTrekBrief(t).map((s) => s.key);
const itemKeys = (t: TripFacts, section: string) =>
  preTrekBrief(t).find((s) => s.key === section)?.items.map((i) => i.key) ?? [];

describe("seasonOf", () => {
  it("uses Nepali seasons, not European ones", () => {
    expect(seasonOf("2026-04-02")).toBe("spring");
    expect(seasonOf("2026-07-20")).toBe("monsoon");
    expect(seasonOf("2026-10-12")).toBe("autumn");
    expect(seasonOf("2027-01-05")).toBe("winter");
  });
});

describe("cashEstimateNpr", () => {
  it("grows with the trek and stays in round numbers", () => {
    const short = cashEstimateNpr(3);
    const long = cashEstimateNpr(18);
    expect(long.low).toBeGreaterThan(short.low);
    expect(short.low % 1000).toBe(0);
    expect(long.high % 1000).toBe(0);
    expect(long.high).toBeGreaterThan(long.low);
  });
});

describe("preTrekBrief", () => {
  it("gives a trek the full set", () => {
    expect(keys(trek)).toEqual(["money", "bag", "altitude", "phone", "water", "before"]);
  });

  it("leaves altitude out of a low trek", () => {
    expect(keys({ ...trek, maxAltitudeM: 2100 })).not.toContain("altitude");
  });

  it("only mentions Diamox where it is a real question", () => {
    expect(itemKeys(trek, "altitude")).toContain("diamox");
    expect(itemKeys({ ...trek, maxAltitudeM: 3200 }, "altitude")).not.toContain("diamox");
  });

  it("warns about the Lukla flight in Khumbu and nowhere else", () => {
    expect(itemKeys(trek, "before")).toContain("lukla");
    expect(itemKeys({ ...trek, region: "Annapurna" }, "before")).not.toContain("lukla");
  });

  it("explains a restricted-area permit where one is needed", () => {
    expect(itemKeys({ ...trek, region: "Manaslu" }, "before")).toContain("restricted");
  });

  it("packs for the season it actually is", () => {
    expect(itemKeys({ ...trek, startDate: "2026-07-08" }, "bag")).toContain("rain");
    expect(itemKeys({ ...trek, startDate: "2027-01-08" }, "bag")).toContain("cold");
    expect(itemKeys(trek, "bag")).not.toContain("rain");
  });

  it("gives a day hike four things, not forty", () => {
    const hike = { ...trek, kind: "day_hike", days: 1, maxAltitudeM: 2200 };
    expect(keys(hike)).toEqual(["bring", "money"]);
    expect(preTrekBrief(hike).flatMap((s) => s.items).length).toBeLessThan(8);
  });

  it("has a hint on every section — folded shut, that is all you see", () => {
    for (const s of preTrekBrief(trek)) {
      expect(s.hint.length).toBeGreaterThan(0);
      expect(s.items.length).toBeGreaterThan(0);
    }
  });
});
