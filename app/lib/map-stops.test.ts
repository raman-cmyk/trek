import { describe, expect, it } from "vitest";
import {
  daysSentence,
  groupIsActive,
  groupStops,
  highestGroup,
  locatedStops,
  pinLabel,
  routeLine,
  MAX_WALKING_KM,
  kmBetween,
  legCoords,
  legsOfRoute,
  isTravelOnly,
  walkingBounds,
  spreadPins,
  MAX_PIN_NUDGE,
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

describe("walking days versus travelling days", () => {
  // Everest: walk to Gorak Shep and back to Lukla, then FLY to Kathmandu.
  const withFlight: LocatedStop[] = [
    ...EBC,
    { day: 13, place: "Kathmandu", altitude_m: 1400, lat: 27.7172, lng: 85.324 },
  ];

  it("knows a 156km day was not walked", () => {
    const legs = legsOfRoute(withFlight);
    const last = legs[legs.length - 1];
    expect(last.kind).toBe("travel");
    expect(last.to.place).toBe("Kathmandu");
    expect(Math.round(last.km)).toBeGreaterThan(100);
  });

  it("knows a normal trekking day was", () => {
    const legs = legsOfRoute(withFlight);
    expect(legs[0].kind).toBe("walk");
    expect(legs[0].km).toBeLessThan(MAX_WALKING_KM);
  });

  it("frames the trek, not the flight home — this is why the map looked wrong", () => {
    const tight = walkingBounds(withFlight)!;
    const loose = walkingBounds(EBC)!;
    // Kathmandu is 1.6 degrees of longitude away; it must not widen the frame.
    expect(tight.west).toBeCloseTo(loose.west, 3);
    expect(tight.east).toBeCloseTo(loose.east, 3);
    expect(tight.west).toBeGreaterThan(86);
  });

  it("falls back to every stop rather than framing nothing", () => {
    const allTravel: LocatedStop[] = [
      { day: 1, place: "Kathmandu", altitude_m: 1400, lat: 27.7172, lng: 85.324 },
      { day: 2, place: "Pokhara", altitude_m: 820, lat: 28.209, lng: 83.986 },
    ];
    const b = walkingBounds(allTravel)!;
    expect(b.west).toBeCloseTo(83.986, 3);
    expect(b.east).toBeCloseTo(85.324, 3);
  });

  it("is null when there is nothing located at all", () => {
    expect(walkingBounds([])).toBeNull();
  });

  it("marks a place you only ever flew to", () => {
    const legs = legsOfRoute(withFlight);
    const ktm = groupStops(withFlight).find((g) => g.place === "Kathmandu")!;
    const lukla = groupStops(withFlight).find((g) => g.place === "Lukla")!;
    expect(isTravelOnly(ktm, legs)).toBe(true);
    expect(isTravelOnly(lukla, legs)).toBe(false);
  });

  it("splits the two kinds into separate segments to draw", () => {
    const legs = legsOfRoute(withFlight);
    expect(legCoords(legs, "travel")).toHaveLength(1);
    expect(legCoords(legs, "walk").length).toBeGreaterThan(5);
  });
});

describe("kmBetween", () => {
  it("measures a known distance", () => {
    // Kathmandu to Pokhara is about 140km as the crow flies.
    const km = kmBetween({ lat: 27.7172, lng: 85.324 }, { lat: 28.209, lng: 83.986 });
    expect(km).toBeGreaterThan(130);
    expect(km).toBeLessThan(150);
  });

  it("is zero for the same point", () => {
    expect(kmBetween({ lat: 27.8, lng: 86.7 }, { lat: 27.8, lng: 86.7 })).toBe(0);
  });
});

describe("spreadPins", () => {
  const box = (key: string, x: number, y: number, priority: number) => ({
    key, x, y, w: 30, h: 28, priority,
  });

  it("leaves everything alone when nothing overlaps", () => {
    expect(spreadPins([box("a", 0, 0, 1), box("b", 200, 200, 2)]).size).toBe(0);
  });

  it("nudges the lower-priority pin instead of hiding it", () => {
    const out = spreadPins([box("keep", 100, 100, 0), box("move", 104, 102, 5)]);
    expect(out.has("keep")).toBe(false);
    const d = out.get("move")!;
    expect(d.dx !== 0 || d.dy !== 0).toBe(true);
  });

  it("never pushes a pin further than the cap — it must still look like its own place", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => box(`p${i}`, 100, 100, i));
    for (const d of spreadPins(crowd).values()) {
      expect(Math.abs(d.dx)).toBeLessThanOrEqual(MAX_PIN_NUDGE);
      expect(Math.abs(d.dy)).toBeLessThanOrEqual(MAX_PIN_NUDGE);
    }
  });

  it("prefers the smallest nudge that works", () => {
    const out = spreadPins([box("keep", 100, 100, 0), box("move", 104, 100, 1)]);
    const d = out.get("move")!;
    // Far enough to clear a 30px pin, and no further than it has to go.
    expect(Math.hypot(d.dx, d.dy)).toBeLessThanOrEqual(MAX_PIN_NUDGE);
    expect(Math.hypot(d.dx, d.dy)).toBeGreaterThan(0);
  });

  it("moves the unimportant pin, whatever order they arrive in", () => {
    const out = spreadPins([box("summit", 100, 100, 1), box("ordinary", 102, 100, 9)]);
    expect(out.has("summit")).toBe(false);
    expect(out.has("ordinary")).toBe(true);
  });

  it("keeps a hopelessly crowded pin on its own village rather than flinging it away", () => {
    // Twenty pins on one pixel: some cannot be placed, and those stay put.
    const pile = Array.from({ length: 20 }, (_, i) => box(`q${i}`, 50, 50, i));
    const out = spreadPins(pile);
    expect(out.size).toBeLessThan(20);
    for (const d of out.values()) expect(Math.hypot(d.dx, d.dy)).toBeLessThanOrEqual(MAX_PIN_NUDGE * 1.5);
  });

  it("is empty for an empty map", () => {
    expect(spreadPins([]).size).toBe(0);
  });
});
