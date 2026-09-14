import { describe, expect, it } from "vitest";
import {
  daysSentence,
  groupIsActive,
  groupStops,
  highestGroup,
  locatedStops,
  pinLabel,
  routeLine,
  type LocatedStop,
} from "./map-stops";

/** An Everest-shaped itinerary: up through Namche, and back down through it. */
const EBC: LocatedStop[] = [
  { day: 1, place: "Lukla", altitude_m: 2860, lat: 27.6869, lng: 86.7314 },
  { day: 2, place: "Namche Bazaar", altitude_m: 3440, lat: 27.8056, lng: 86.7136 },
  { day: 3, place: "Namche Bazaar", altitude_m: 3440, lat: 27.8056, lng: 86.7136 },
  { day: 4, place: "Tengboche", altitude_m: 3867, lat: 27.8361, lng: 86.7642 },
  { day: 5, place: "Gorak Shep", altitude_m: 5164, lat: 27.9811, lng: 86.8283 },
  { day: 11, place: "Namche Bazaar", altitude_m: 3440, lat: 27.8056, lng: 86.7136 },
  { day: 12, place: "Lukla", altitude_m: 2860, lat: 27.6869, lng: 86.7314 },
];

describe("groupStops", () => {
  it("is one pin per place, not one per day — the overlap bug", () => {
    const groups = groupStops(EBC);
    // Seven day-stops, four places: Lukla and Namche are each visited twice.
    expect(groups).toHaveLength(4);
    const namche = groups.find((g) => g.place === "Namche Bazaar")!;
    expect(namche.days).toEqual([2, 3, 11]);
  });

  it("keeps a place you return to in one pin, not two stacked on a pixel", () => {
    const lukla = groupStops(EBC).find((g) => g.place === "Lukla")!;
    expect(lukla.days).toEqual([1, 12]);
  });

  it("orders pins by when you first arrive", () => {
    expect(groupStops(EBC).map((g) => g.place)).toEqual([
      "Lukla",
      "Namche Bazaar",
      "Tengboche",
      "Gorak Shep",
    ]);
  });

  it("drops stops with no coordinates rather than pinning them at Null Island", () => {
    const groups = groupStops([
      ...EBC,
      { day: 13, place: "Kathmandu", altitude_m: 1400, lat: null, lng: null },
    ]);
    expect(groups.some((g) => g.place === "Kathmandu")).toBe(false);
  });

  it("copes with an empty itinerary", () => {
    expect(groupStops([])).toEqual([]);
  });

  it("treats coordinates a few metres apart as the same village", () => {
    const groups = groupStops([
      { day: 1, place: "Namche", altitude_m: 3440, lat: 27.80561, lng: 86.71362 },
      { day: 5, place: "Namche", altitude_m: 3440, lat: 27.80559, lng: 86.71359 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toEqual([1, 5]);
  });
});

describe("pinLabel", () => {
  it("is the day, when there is one", () => {
    expect(pinLabel([4])).toBe("4");
  });

  it("joins two visits with a dot", () => {
    expect(pinLabel([2, 11])).toBe("2 · 11");
  });

  it("collapses a run rather than writing three numbers on a circle", () => {
    expect(pinLabel([2, 3, 4])).toBe("2–4");
  });

  it("handles a run and a return together", () => {
    expect(pinLabel([2, 3, 4, 11])).toBe("2–4 · 11");
  });

  it("does not collapse two consecutive days — 2 · 3 is clearer than 2–3", () => {
    expect(pinLabel([2, 3])).toBe("2 · 3");
  });

  it("is empty for nothing", () => {
    expect(pinLabel([])).toBe("");
  });
});

describe("groupIsActive", () => {
  const namche = groupStops(EBC).find((g) => g.place === "Namche Bazaar")!;

  it("lights up for every day spent there — this is the bug, fixed", () => {
    expect(groupIsActive(namche, 2)).toBe(true);
    expect(groupIsActive(namche, 11)).toBe(true);
  });

  it("stays dark for a day somewhere else", () => {
    expect(groupIsActive(namche, 5)).toBe(false);
  });

  it("is not active when nothing is being scrubbed", () => {
    expect(groupIsActive(namche, null)).toBe(false);
    expect(groupIsActive(namche, undefined)).toBe(false);
  });
});

describe("routeLine", () => {
  it("follows the days, so an out-and-back goes back the way it came", () => {
    const line = routeLine(EBC);
    expect(line).toHaveLength(7);
    // Last two points walk back down through Namche to Lukla.
    expect(line[5]).toEqual([86.7136, 27.8056]);
    expect(line[6]).toEqual([86.7314, 27.6869]);
  });

  it("would cut the corner if it used the grouped places instead", () => {
    // Guard against somebody 'simplifying' the line to the grouped pins.
    expect(routeLine(EBC).length).toBeGreaterThan(groupStops(EBC).length);
  });
});

describe("highestGroup", () => {
  it("finds the top of the walk, which is why people came", () => {
    expect(highestGroup(groupStops(EBC))!.place).toBe("Gorak Shep");
  });

  it("is null when there is nothing to draw", () => {
    expect(highestGroup([])).toBeNull();
  });
});

describe("daysSentence", () => {
  it("reads as a person would say it", () => {
    expect(daysSentence([4])).toBe("Day 4");
    expect(daysSentence([2, 11])).toBe("Days 2 and 11");
    expect(daysSentence([2, 3, 4])).toBe("Days 2, 3 and 4");
  });
});

describe("locatedStops", () => {
  it("puts them in day order whatever order they arrived in", () => {
    const out = locatedStops([EBC[5], EBC[0], EBC[2]]);
    expect(out.map((s) => s.day)).toEqual([1, 3, 11]);
  });
});
