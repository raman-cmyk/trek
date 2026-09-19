import { describe, expect, it } from "vitest";
import {
  durationLabel,
  lovedFor,
  meetTimeLabel,
  partyLabel,
  sentenceList,
  tripFacts,
} from "./trip-facts";

describe("meetTimeLabel", () => {
  it("reads like a time a person would say", () => {
    expect(meetTimeLabel("08:30:00")).toBe("8:30 am");
    expect(meetTimeLabel("04:30:00")).toBe("4:30 am");
    expect(meetTimeLabel("13:05")).toBe("1:05 pm");
  });

  it("gets the two hours everybody gets wrong right", () => {
    expect(meetTimeLabel("00:15:00")).toBe("12:15 am");
    expect(meetTimeLabel("12:00:00")).toBe("12:00 pm");
  });

  it("is nothing at all when there is no time recorded", () => {
    // Forty-five of the fifty-seven trips have no meet time. A blank is not a
    // midnight start.
    expect(meetTimeLabel(null)).toBeNull();
    expect(meetTimeLabel("")).toBeNull();
    expect(meetTimeLabel("soon")).toBeNull();
    expect(meetTimeLabel("29:00")).toBeNull();
  });
});

describe("durationLabel", () => {
  it("counts days, and says one day in words", () => {
    expect(durationLabel(1)).toBe("One day");
    expect(durationLabel(14)).toBe("14 days");
  });

  it("says nothing about a trip with no length", () => {
    expect(durationLabel(null)).toBeNull();
    expect(durationLabel(0)).toBeNull();
  });
});

describe("partyLabel", () => {
  it("says the ceiling as a fact rather than a column", () => {
    expect(partyLabel(1, 8)).toEqual({ label: "Up to 8 people" });
  });

  it("warns about a minimum, because that is what stops a trip running", () => {
    // Otherwise somebody finds out when the request is declined.
    expect(partyLabel(2, 6)).toEqual({
      label: "Up to 6 people",
      hint: "Needs at least 2 to run",
    });
  });

  it("calls a one-at-a-time trip what it is", () => {
    expect(partyLabel(1, 1)?.label).toBe("Just you");
  });

  it("is nothing when neither end is recorded", () => {
    expect(partyLabel(null, null)).toBeNull();
  });
});

describe("sentenceList", () => {
  it("reads as a person would say it", () => {
    expect(sentenceList(["Domestic flight", "Shared jeep", "On foot"])).toBe(
      "Domestic flight, Shared jeep and On foot",
    );
    expect(sentenceList(["On foot"])).toBe("On foot");
    expect(sentenceList([])).toBe("");
  });
});

describe("tripFacts", () => {
  const EBC = {
    kind: "trek",
    days: 14,
    meet_time: null,
    meeting_point: "Kathmandu, Thamel",
    transport: ["domestic_flight", "walking"],
    activity_level: "strenuous",
    min_party: 1,
    max_party: 8,
  };

  it("builds the row from what the trip holds", () => {
    const keys = tripFacts(EBC, {
      languages: ["English", "Nepali"],
      groupPriceDrops: true,
      freeCancellationDays: 30,
    }).map((f) => f.key);
    expect(keys).toEqual([
      "duration",
      "meeting_point",
      "transport",
      "party",
      "group_price",
      "languages",
      "activity",
      "cancellation",
    ]);
  });

  it("joins the transport into a sentence rather than a row of pills", () => {
    // The labels are capitalised to stand alone; strung together they read
    // "Domestic flight and On foot".
    expect(tripFacts(EBC, {}).find((f) => f.key === "transport")?.label).toBe(
      "Travel by domestic flight and on foot",
    );
  });

  it("never invents a mobile ticket", () => {
    // Viator's row has one. We do not issue tickets, and a tick beside a
    // thing that does not exist is exactly what standards.ts is for.
    const labels = tripFacts(EBC, { languages: ["English"] })
      .map((f) => `${f.label} ${f.hint ?? ""}`)
      .join(" ")
      .toLowerCase();
    expect(labels).not.toContain("ticket");
  });

  it("drops every fact the trip has not filled in", () => {
    // A blank column renders as nothing, not as a hopeful default.
    const facts = tripFacts({ days: 1 }, {});
    expect(facts.map((f) => f.key)).toEqual(["duration"]);
    expect(tripFacts({}, {})).toEqual([]);
  });

  it("puts the start time under the length, where a day trip needs it", () => {
    const sunrise = tripFacts({ days: 1, meet_time: "04:30:00" }, {});
    expect(sunrise[0]).toEqual({ key: "duration", label: "One day", hint: "Starts 4:30 am" });
  });

  it("claims a group discount only when the price actually falls", () => {
    expect(tripFacts(EBC, {}).some((f) => f.key === "group_price")).toBe(false);
    expect(tripFacts(EBC, { groupPriceDrops: true }).some((f) => f.key === "group_price")).toBe(
      true,
    );
  });

  it("says the languages it was handed, resolved, not the raw column", () => {
    // All fifty-seven trips store an empty list, meaning "whatever this guide
    // speaks" — a decision tripLanguages() owns, not this module.
    expect(tripFacts(EBC, { languages: [] }).some((f) => f.key === "languages")).toBe(false);
    expect(tripFacts(EBC, { languages: ["English"] }).find((f) => f.key === "languages")?.label).toBe(
      "Guided in English",
    );
  });
});

describe("lovedFor", () => {
  const r = (over: Partial<{ body: string; overall: number; published_at: string }>) => ({
    body: "A long enough review to be worth putting beside a rating, honestly.",
    overall: 5,
    published_at: "2026-01-01T00:00:00Z",
    ...over,
  });

  it("puts the fullest five-star reviews first", () => {
    const picks = lovedFor([
      r({ overall: 4, body: "x".repeat(300) }),
      r({ overall: 5, body: "x".repeat(80) }),
      r({ overall: 5, body: "x".repeat(200) }),
    ]);
    expect(picks.map((p) => p.body!.length)).toEqual([200, 80]);
  });

  it("leaves out a rating dressed as a quotation", () => {
    // "Great!" under a 4.9 argues against the 4.9.
    expect(lovedFor([r({ body: "Great!" }), r({ body: null as any })])).toEqual([]);
  });

  it("returns fewer rather than padding, and copes with nothing", () => {
    expect(lovedFor([r({})])).toHaveLength(1);
    expect(lovedFor(null)).toEqual([]);
  });

  it("does not disturb the list it was given", () => {
    const list = [r({ overall: 4 }), r({ overall: 5 })];
    const before = list.map((x) => x.overall);
    lovedFor(list);
    expect(list.map((x) => x.overall)).toEqual(before);
  });
});
