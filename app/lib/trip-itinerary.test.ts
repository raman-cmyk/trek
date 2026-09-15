import { describe, expect, it } from "vitest";
import { cleanSteps, stepsFromRoute, tripItinerary } from "./trip-itinerary";

const EBC_STOPS = Array.from({ length: 14 }, (_, i) => ({
  day: i + 1,
  place: `Stop ${i + 1}`,
  altitude_m: 2800 + i * 200,
}));

describe("cleanSteps", () => {
  it("drops entries with nothing to read", () => {
    expect(cleanSteps([{ title: "Meet in Thamel" }, { title: "   " }, { body: "orphan" }])).toEqual([
      { day: undefined, time: undefined, title: "Meet in Thamel", body: undefined },
    ]);
  });

  it("keeps a time or a day when there is one, and neither when there is not", () => {
    const [a, b] = cleanSteps([
      { time: "18:00", title: "Thamel" },
      { day: 3, title: "Namche", body: "3,440 m" },
    ]);
    expect(a.time).toBe("18:00");
    expect(a.day).toBeUndefined();
    expect(b.day).toBe(3);
    expect(b.body).toBe("3,440 m");
  });

  it("is not fooled by a day of 0 or a non-number", () => {
    const [a, b] = cleanSteps([
      { day: 0, title: "Zero" },
      { day: "three", title: "Words" },
    ]);
    expect(a.day).toBeUndefined();
    expect(b.day).toBeUndefined();
  });

  it("survives the shapes a jsonb column can actually hold", () => {
    expect(cleanSteps(null)).toEqual([]);
    expect(cleanSteps("[]")).toEqual([]);
    expect(cleanSteps({ day: 1, title: "not an array" })).toEqual([]);
  });
});

describe("stepsFromRoute", () => {
  it("sorts by day and carries the altitude as the body", () => {
    const steps = stepsFromRoute([
      { day: 2, place: "Namche", altitude_m: 3440 },
      { day: 1, place: "Lukla", altitude_m: 2860 },
    ]);
    expect(steps.map((s) => s.title)).toEqual(["Lukla", "Namche"]);
    expect(steps[1].body).toBe("3,440 m");
  });

  it("leaves the body off a stop with no altitude rather than printing a zero", () => {
    expect(stepsFromRoute([{ day: 1, place: "Kathmandu", altitude_m: 0 }])[0].body).toBeUndefined();
    expect(stepsFromRoute([{ day: 1, place: "Kathmandu" }])[0].body).toBeUndefined();
  });

  it("does not mutate the caller's array", () => {
    const stops = [
      { day: 2, place: "B" },
      { day: 1, place: "A" },
    ];
    stepsFromRoute(stops);
    expect(stops[0].place).toBe("B");
  });
});

describe("tripItinerary", () => {
  it("falls back to the route when a fortnight is described in one line", () => {
    // The production case: every live trek had one entry, and the route it
    // walks held all fourteen days.
    const got = tripItinerary([{ title: "Fly to Lukla" }], EBC_STOPS, 14);
    expect(got.source).toBe("route");
    expect(got.steps).toHaveLength(14);
  });

  it("keeps the guide's own words when they cover the trip", () => {
    const own = Array.from({ length: 14 }, (_, i) => ({ day: i + 1, title: `My day ${i + 1}` }));
    const got = tripItinerary(own, EBC_STOPS, 14);
    expect(got.source).toBe("guide");
    expect(got.steps[0].title).toBe("My day 1");
  });

  it("counts a half-length summary as covering the trip", () => {
    // Seven entries for fourteen days is a guide summarising their own trek,
    // not a stub — their words still win.
    const own = Array.from({ length: 7 }, (_, i) => ({ title: `Stage ${i + 1}` }));
    expect(tripItinerary(own, EBC_STOPS, 14).source).toBe("guide");
  });

  it("treats one entry as enough for a one-day trip", () => {
    const got = tripItinerary([{ time: "18:00", title: "Meet in Thamel" }], [], 1);
    expect(got.source).toBe("guide");
    expect(got.steps).toHaveLength(1);
  });

  it("never swaps in a route that says less than the guide did", () => {
    const own = [{ title: "A" }, { title: "B" }, { title: "C" }];
    const got = tripItinerary(own, [{ day: 1, place: "Only stop" }], 14);
    expect(got.source).toBe("guide");
    expect(got.steps).toHaveLength(3);
  });

  it("gives an empty trek with no route an empty list rather than throwing", () => {
    expect(tripItinerary(null, null, 13)).toEqual({ steps: [], source: "guide" });
  });

  it("handles a days of 0 or NaN as a single day", () => {
    const one = [{ title: "The whole thing" }];
    expect(tripItinerary(one, EBC_STOPS, 0).source).toBe("guide");
    expect(tripItinerary(one, EBC_STOPS, NaN).source).toBe("guide");
  });
});
