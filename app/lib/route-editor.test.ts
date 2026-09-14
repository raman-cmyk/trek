import { describe, expect, it } from "vitest";
import { changedFields, lines, parseRoute, parseStops } from "./route-editor";

const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });

const base = {
  name: "Everest Base Camp",
  region: "Khumbu",
  difficulty: "hard",
  season_months: "3,4,5,10,11",
};

describe("lines", () => {
  it("takes one per line and drops the blanks", () => {
    expect(lines("a\n\n b \n")).toEqual(["a", "b"]);
  });

  it("forgives the bullet somebody typed out of habit", () => {
    expect(lines("- one\n• two\n* three")).toEqual(["one", "two", "three"]);
  });

  it("is empty for nothing", () => {
    expect(lines("")).toEqual([]);
  });
});

describe("parseStops", () => {
  it("reads the rows the office typed", () => {
    const { stops } = parseStops(
      form({
        "stop.0.place": "Lukla",
        "stop.0.altitude_m": "2860",
        "stop.1.place": "Namche",
        "stop.1.altitude_m": "3440",
        "stop.1.hours": "5–6 hr",
        "stop.1.km": "11",
        "stop.1.sleep": "Teahouse",
        "stop.1.note": "The climb everybody remembers.",
      }),
      2,
    );
    expect(stops).toHaveLength(2);
    expect(stops[1]).toMatchObject({
      day: 2,
      place: "Namche",
      altitude_m: 3440,
      hours: "5–6 hr",
      km: 11,
      sleep: "Teahouse",
    });
  });

  it("drops the spare rows at the bottom of the form", () => {
    const { stops } = parseStops(
      form({ "stop.0.place": "Lukla", "stop.0.altitude_m": "2860" }),
      5,
    );
    expect(stops).toHaveLength(1);
  });

  it("renumbers the days, so inserting one does not mean retyping fourteen", () => {
    const { stops } = parseStops(
      form({
        "stop.0.place": "Lukla", "stop.0.altitude_m": "2860",
        "stop.2.place": "Namche", "stop.2.altitude_m": "3440",
        "stop.3.place": "Namche", "stop.3.altitude_m": "3440",
      }),
      4,
    );
    expect(stops.map((s) => s.day)).toEqual([1, 2, 3]);
  });

  it("will not let half a row through quietly", () => {
    expect(parseStops(form({ "stop.0.altitude_m": "3440" }), 1).error).toContain("no place");
    expect(parseStops(form({ "stop.0.place": "Namche" }), 1).error).toContain("needs an altitude");
  });

  it("refuses a height that is not a height in Nepal", () => {
    const { error } = parseStops(
      form({ "stop.0.place": "Namche", "stop.0.altitude_m": "34400" }),
      1,
    );
    expect(error).toContain("not a height in Nepal");
  });

  it("keeps the coordinates a text edit should not touch", () => {
    const { stops } = parseStops(
      form({
        "stop.0.place": "Lukla", "stop.0.altitude_m": "2860",
        "stop.0.lat": "27.687", "stop.0.lng": "86.731",
      }),
      1,
    );
    expect(stops[0]).toMatchObject({ lat: 27.687, lng: 86.731 });
  });

  it("takes a thousands separator, because people type one", () => {
    const { stops } = parseStops(
      form({ "stop.0.place": "Kala Patthar", "stop.0.altitude_m": "5,644" }),
      1,
    );
    expect(stops[0].altitude_m).toBe(5644);
  });
});

describe("parseRoute", () => {
  it("builds the row", () => {
    const { patch } = parseRoute(
      form({
        ...base,
        summary: "The walk everyone means.",
        highlights: "Namche\nTengboche\nKala Patthar",
        packing_extra: "A down jacket",
        "stop.0.place": "Lukla", "stop.0.altitude_m": "2860",
        "stop.1.place": "Kala Patthar", "stop.1.altitude_m": "5644",
      }),
      2,
    );
    expect(patch!.name).toBe("Everest Base Camp");
    expect(patch!.highlights).toEqual(["Namche", "Tengboche", "Kala Patthar"]);
    expect(patch!.packing_extra).toEqual(["A down jacket"]);
    expect(patch!.season_months).toEqual([3, 4, 5, 10, 11]);
    expect(patch!.day_stops).toHaveLength(2);
  });

  it("takes the route's height from its own itinerary", () => {
    // Two places to store one number is one place to get it wrong.
    const { patch } = parseRoute(
      form({
        ...base,
        max_altitude_m: "4000",
        "stop.0.place": "Kala Patthar", "stop.0.altitude_m": "5644",
      }),
      1,
    );
    expect(patch!.max_altitude_m).toBe(5644);
  });

  it("falls back to the typed height when there is no itinerary yet", () => {
    const { patch } = parseRoute(form({ ...base, max_altitude_m: "5644" }), 0);
    expect(patch!.max_altitude_m).toBe(5644);
  });

  it("counts the days from the itinerary when nobody typed a number", () => {
    const { patch } = parseRoute(
      form({
        ...base,
        "stop.0.place": "A", "stop.0.altitude_m": "100",
        "stop.1.place": "B", "stop.1.altitude_m": "200",
      }),
      2,
    );
    expect(patch!.typical_days).toBe(2);
  });

  it("insists on a name and a region", () => {
    expect(parseRoute(form({ ...base, name: "" }), 0).error).toContain("needs a name");
    expect(parseRoute(form({ ...base, region: "" }), 0).error).toContain("region");
  });

  it("refuses a grade that is not one of the four", () => {
    expect(parseRoute(form({ ...base, difficulty: "brutal" }), 0).error).toContain("four grades");
  });

  it("throws out a month that is not a month", () => {
    const { patch } = parseRoute(form({ ...base, season_months: "3, 14, 0, 11, 11" }), 0);
    expect(patch!.season_months).toEqual([3, 11]);
  });

  it("passes a bad itinerary row up rather than saving half of it", () => {
    const { error } = parseRoute(
      form({ ...base, "stop.0.altitude_m": "3440" }),
      1,
    );
    expect(error).toContain("no place");
  });

  it("turns an emptied field into null, not an empty string", () => {
    const { patch } = parseRoute(form({ ...base, summary: "   ", highlights: "" }), 0);
    expect(patch!.summary).toBeNull();
    expect(patch!.highlights).toBeNull();
  });
});

describe("changedFields", () => {
  it("names only what actually moved", () => {
    expect(changedFields({ name: "A", region: "X" }, { name: "B", region: "X" })).toEqual(["name"]);
  });

  it("sees through a list that was reordered", () => {
    expect(changedFields({ highlights: ["a", "b"] }, { highlights: ["b", "a"] })).toEqual(["highlights"]);
  });

  it("treats missing and null as the same thing", () => {
    expect(changedFields({}, { summary: null })).toEqual([]);
  });
});
