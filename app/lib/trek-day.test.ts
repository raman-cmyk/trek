import { describe, expect, it } from "vitest";
import {
  estimateHours,
  fastClimbDays,
  hardestDay,
  legsOf,
  restDays,
  totalAscent,
  totalDescent,
  type RouteStop,
} from "./trek-day";

const annapurna: RouteStop[] = [
  { day: 1, place: "Bhulbhule", altitude_m: 840 },
  { day: 2, place: "Jagat", altitude_m: 1300 },
  { day: 3, place: "Dharapani", altitude_m: 1860 },
  { day: 4, place: "Chame", altitude_m: 2710 },
  { day: 5, place: "Upper Pisang", altitude_m: 3300 },
  { day: 6, place: "Manang", altitude_m: 3520 },
  { day: 7, place: "Manang", altitude_m: 3520 },
  { day: 8, place: "Yak Kharka", altitude_m: 4050 },
  { day: 9, place: "Thorong Phedi", altitude_m: 4450 },
  { day: 10, place: "Muktinath", altitude_m: 3800 },
];

describe("legsOf", () => {
  it("works the climb out from the altitudes we already hold", () => {
    const legs = legsOf(annapurna);
    expect(legs[1]).toMatchObject({ place: "Jagat", up: 460, down: 0 });
    expect(legs[3]).toMatchObject({ place: "Chame", up: 850, down: 0 });
  });

  it("counts a drop as a drop, not as a negative climb", () => {
    const muktinath = legsOf(annapurna).at(-1)!;
    expect(muktinath.up).toBe(0);
    expect(muktinath.down).toBe(650);
  });

  it("claims no climb on day one", () => {
    // We know where it ends, not where it began. "840 m of ascent" would be a
    // guess dressed as a fact.
    const first = legsOf(annapurna)[0];
    expect(first.up).toBe(0);
    expect(first.down).toBe(0);
    expect(first.hours).toBeNull();
  });

  it("knows a rest day when it sees one", () => {
    const legs = legsOf(annapurna);
    expect(legs[6].rest).toBe(true);
    expect(legs[6].hours).toBe("2–4 hr");
    expect(legs[5].rest).toBe(false);
  });

  it("does not call a second night in Kathmandu a rest day", () => {
    // An acclimatisation day is a high-altitude thing. Two nights at 1,400 m
    // is a flight home, and labelling it "rest day" makes the page look silly.
    const legs = legsOf([
      { day: 1, place: "Lukla", altitude_m: 2860 },
      { day: 2, place: "Kathmandu", altitude_m: 1400 },
      { day: 3, place: "Kathmandu", altitude_m: 1400 },
    ]);
    expect(legs[2].rest).toBe(false);
  });

  it("guesses no hours for the day you leave, either", () => {
    // The last line of an itinerary is a flight or a jeep, not a six-hour walk.
    const legs = legsOf([
      { day: 1, place: "Lukla", altitude_m: 2860 },
      { day: 2, place: "Namche", altitude_m: 3440 },
      { day: 3, place: "Kathmandu", altitude_m: 1400 },
    ]);
    expect(legs.at(-1)!.hours).toBeNull();
    expect(legs[1].hours).not.toBeNull();
  });

  it("lets a real number beat the estimate, and says which it is", () => {
    const [, jagat] = legsOf([
      { day: 1, place: "Bhulbhule", altitude_m: 840 },
      { day: 2, place: "Jagat", altitude_m: 1300, hours: "6–7 hr" },
    ]);
    expect(jagat.hours).toBe("6–7 hr");
    expect(jagat.hoursEstimated).toBe(false);
  });

  it("marks its own guesses as guesses", () => {
    expect(legsOf(annapurna)[1].hoursEstimated).toBe(true);
  });

  it("carries the day's own facts through when they are set", () => {
    const [, day] = legsOf([
      { day: 1, place: "A", altitude_m: 100 },
      { day: 2, place: "B", altitude_m: 300, km: 14, sleep: "Teahouse" },
    ]);
    expect(day.km).toBe(14);
    expect(day.sleep).toBe("Teahouse");
  });

  it("drops a stop with no altitude rather than counting it as sea level", () => {
    const legs = legsOf([
      { day: 1, place: "A", altitude_m: 1000 },
      { day: 2, place: "Nowhere", altitude_m: null as any },
      { day: 3, place: "C", altitude_m: 1500 },
    ]);
    expect(legs).toHaveLength(2);
    expect(legs[1].up).toBe(500);
  });

  it("survives an empty route", () => {
    expect(legsOf([])).toEqual([]);
    expect(legsOf(null as any)).toEqual([]);
  });
});

describe("estimateHours", () => {
  it("gives a band, because nobody walks a day in 5.4 hours", () => {
    expect(estimateHours({ up: 700, down: 0, altitude_m: 3000 })).toMatch(/^\d+(\.\d)?–\d+(\.\d)? hr$/);
  });

  it("makes a bigger climb a longer day", () => {
    const small = estimateHours({ up: 200, down: 0, altitude_m: 2000 })!;
    const big = estimateHours({ up: 900, down: 0, altitude_m: 2000 })!;
    expect(parseFloat(big)).toBeGreaterThan(parseFloat(small));
  });

  it("charges for the descent too — Nepali downhills are stone staircases", () => {
    const flat = estimateHours({ up: 0, down: 0, altitude_m: 2000 })!;
    const down = estimateHours({ up: 0, down: 1400, altitude_m: 2000 })!;
    expect(parseFloat(down)).toBeGreaterThan(parseFloat(flat));
  });

  it("slows everything down high up", () => {
    const low = estimateHours({ up: 500, down: 0, altitude_m: 2500 })!;
    const high = estimateHours({ up: 500, down: 0, altitude_m: 5200 })!;
    expect(parseFloat(high)).toBeGreaterThan(parseFloat(low));
  });

  it("says nothing about day one", () => {
    expect(estimateHours({ up: 0, down: 0, altitude_m: 2800, first: true })).toBeNull();
  });

  it("says nothing about the day you come out of the mountains", () => {
    // 1,460 m down, ending at 1,400 m, is the Lukla flight — not a six-hour walk.
    expect(estimateHours({ up: 0, down: 1460, altitude_m: 1400 })).toBeNull();
    // The same drop that ends high up is a real, long descent.
    expect(estimateHours({ up: 0, down: 1460, altitude_m: 4270 })).not.toBeNull();
  });

  it("never claims a fourteen-hour day", () => {
    const absurd = estimateHours({ up: 4000, down: 0, altitude_m: 5500 })!;
    expect(parseFloat(absurd)).toBeLessThanOrEqual(12);
  });
});

describe("the whole walk", () => {
  it("adds up every metre climbed and dropped", () => {
    expect(totalAscent(annapurna)).toBe(460 + 560 + 850 + 590 + 220 + 0 + 530 + 400);
    expect(totalDescent(annapurna)).toBe(650);
  });

  it("finds the day that decides how hard this is", () => {
    expect(hardestDay(annapurna)?.place).toBe("Chame");
    expect(hardestDay([])).toBeNull();
  });

  it("counts the rest days", () => {
    expect(restDays(annapurna)).toBe(1);
  });

  it("flags a day that climbs faster than the mountains allow", () => {
    // 300–500 m of sleeping altitude a day above 3,000 m is the rule every
    // guidebook gives. Breaking it is worth saying on the page.
    const fast = fastClimbDays([
      { day: 1, place: "Namche", altitude_m: 3440 },
      { day: 2, place: "Dingboche", altitude_m: 4410 },
    ]);
    expect(fast).toHaveLength(1);
    expect(fast[0].place).toBe("Dingboche");
  });

  it("does not flag a big climb low down, where it is only hard work", () => {
    expect(fastClimbDays([
      { day: 1, place: "Lukla", altitude_m: 2860 },
      { day: 2, place: "Higher", altitude_m: 2990 },
    ])).toHaveLength(0);
  });
});
