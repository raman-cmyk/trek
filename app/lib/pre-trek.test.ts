import { describe, expect, it } from "vitest";
import {
  briefHeading,
  cashEstimateNpr,
  preTrekBrief,
  seasonOf,
  tripNoun,
  type TripFacts,
} from "./pre-trek";

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

describe("what we call the thing they booked", () => {
  it("names each kind the way a person would", () => {
    expect(tripNoun("trek")).toBe("trek");
    expect(tripNoun("day_hike")).toBe("hike");
    expect(tripNoun("food_culture")).toBe("food tour");
    expect(tripNoun("city")).toBe("tour");
    expect(tripNoun("adventure")).toBe("day out");
  });

  it("falls back to a word that is true of all of them", () => {
    // A kind added to the database before it is added here must still read
    // as English, not as "the undefined".
    expect(tripNoun("kayaking")).toBe("trip");
    expect(tripNoun("")).toBe("trip");
  });

  it("never calls a food tour a trek in the heading", () => {
    expect(briefHeading("food_culture")).toBe("A few quick things before the food tour");
    expect(briefHeading("trek")).toBe("A few quick things before the trek");
    expect(briefHeading("city")).toBe("A few quick things before the tour");
  });
});

describe("the brief matches the kind of day it is", () => {
  const evening: TripFacts = {
    kind: "food_culture",
    days: 1,
    maxAltitudeM: 1400,
    region: "Kathmandu",
    startDate: "2026-10-12",
    partySize: 2,
  };

  it("tells a food tour about food, not about stone trails", () => {
    const body = JSON.stringify(preTrekBrief(evening));
    expect(body).toContain("Come hungry");
    expect(body).toMatch(/vegetarian/i);
    // The bug this is here to prevent: a walk-in-the-hills brief printed
    // over somebody's dinner in Kathmandu.
    expect(body).not.toMatch(/stone is slick/i);
    expect(body).not.toMatch(/at this altitude/i);
  });

  it("asks about diets before the day rather than at the table", () => {
    expect(JSON.stringify(preTrekBrief(evening))).toMatch(/before the day/i);
  });

  it("tells a city tour about temples and shoes, not about teahouses", () => {
    const body = JSON.stringify(preTrekBrief({ ...evening, kind: "city" }));
    expect(body).toMatch(/shoulders and knees/i);
    expect(body).not.toMatch(/teahouse|tea houses/i);
  });

  it("still gives a day hike the walking advice, because that is right for it", () => {
    const body = JSON.stringify(
      preTrekBrief({ ...evening, kind: "day_hike", maxAltitudeM: 3210 }),
    );
    expect(body).toMatch(/shoes with grip/i);
    expect(body).toMatch(/two litres/i);
  });

  it("does not warn a low day hike about altitude it never reaches", () => {
    const low = preTrekBrief({ ...evening, kind: "day_hike", maxAltitudeM: 1400 });
    expect(JSON.stringify(low)).not.toMatch(/at this altitude/i);
    const high = preTrekBrief({ ...evening, kind: "day_hike", maxAltitudeM: 4130 });
    expect(JSON.stringify(high)).toMatch(/at this altitude/i);
  });

  it("leaves the trek brief alone", () => {
    const body = JSON.stringify(preTrekBrief(trek));
    expect(body).toMatch(/Money on the trail/i);
  });
});
