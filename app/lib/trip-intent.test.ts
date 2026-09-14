import { describe, expect, it } from "vitest";
import {
  browseHref,
  cleanPartySize,
  intentSummary,
  intentWindow,
  isIntentMode,
  normaliseEmail,
  prettyRange,
  monthsLabel,
  seasonByKey,
  seasonWindow,
  validateIntent,
  SEASONS,
  type TripIntentDraft,
} from "./trip-intent";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const draft = (over: Partial<TripIntentDraft>): TripIntentDraft => ({
  mode: "unsure",
  email: "a@b.com",
  ...over,
});

describe("seasons", () => {
  it("leads with autumn, the season most people mean", () => {
    expect(SEASONS[0].key).toBe("autumn");
  });

  it("covers the whole year exactly once", () => {
    const months = SEASONS.flatMap((s) => s.months).sort((a, b) => a - b);
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("labels its months short enough to fit a chip", () => {
    expect(monthsLabel(SEASONS[0])).toBe("Sep–Nov");
    // Winter wraps the year and still reads forwards.
    expect(monthsLabel(SEASONS.find((s) => s.key === "winter")!)).toBe("Dec–Feb");
  });

  it("is unknown for a made-up key", () => {
    expect(seasonByKey("harvest")).toBeNull();
  });
});

describe("seasonWindow", () => {
  it("means this autumn when there is still autumn left", () => {
    expect(seasonWindow("autumn", at("2026-09-14"))).toEqual({
      start: "2026-09-01",
      end: "2026-11-30",
    });
  });

  it("means next autumn once this one is over", () => {
    expect(seasonWindow("autumn", at("2026-12-05"))).toEqual({
      start: "2027-09-01",
      end: "2027-11-30",
    });
  });

  it("wraps winter across the new year", () => {
    expect(seasonWindow("winter", at("2026-09-14"))).toEqual({
      start: "2026-12-01",
      end: "2027-02-28",
    });
  });

  it("is still this winter when asked in January, not next", () => {
    // Asked on 5 Jan, "winter" is the winter you are standing in.
    expect(seasonWindow("winter", at("2027-01-05"))).toEqual({
      start: "2026-12-01",
      end: "2027-02-28",
    });
  });

  it("handles a leap February", () => {
    expect(seasonWindow("winter", at("2028-01-05"))?.end).toBe("2028-02-29");
  });

  it("is null for a season that does not exist", () => {
    expect(seasonWindow("harvest" as any)).toBeNull();
  });
});

describe("validateIntent", () => {
  it("accepts somebody who knows their dates", () => {
    expect(
      validateIntent(draft({ mode: "dates", start: "2026-10-02", end: "2026-10-16" })),
    ).toEqual([]);
  });

  it("accepts somebody who only knows the season", () => {
    expect(validateIntent(draft({ mode: "season", season: "autumn" }))).toEqual([]);
  });

  it("accepts somebody who knows nothing yet — that is a real answer", () => {
    expect(validateIntent(draft({ mode: "unsure" }))).toEqual([]);
  });

  it("reports every problem at once, not one per round trip", () => {
    const out = validateIntent(draft({ mode: "dates", email: "nope" }));
    expect(out.map((p) => p.field).sort()).toEqual(["dates", "email"]);
  });

  it("catches an end date before the start", () => {
    const out = validateIntent(draft({ mode: "dates", start: "2026-10-16", end: "2026-10-02" }));
    expect(out[0].field).toBe("dates");
  });

  it("rejects a season we do not run", () => {
    expect(validateIntent(draft({ mode: "season", season: "harvest" }))[0].field).toBe("season");
  });

  it("rejects a mode nobody offered", () => {
    expect(validateIntent(draft({ mode: "whenever" as any }))[0].field).toBe("mode");
  });

  it("rejects an email with no domain", () => {
    expect(validateIntent(draft({ email: "raman@localhost" }))[0].field).toBe("email");
  });

  it("does not care about case or stray spaces in an email", () => {
    expect(normaliseEmail("  Raman@Example.COM ")).toBe("raman@example.com");
    expect(validateIntent(draft({ email: "  Raman@Example.COM " }))).toEqual([]);
  });
});

describe("intentWindow", () => {
  it("uses the exact dates when it has them, and says they are exact", () => {
    expect(intentWindow(draft({ mode: "dates", start: "2026-10-02", end: "2026-10-16" }))).toEqual({
      start: "2026-10-02",
      end: "2026-10-16",
      exact: true,
    });
  });

  it("uses the season window, and admits it is a guess", () => {
    expect(intentWindow(draft({ mode: "season", season: "spring" }), at("2026-09-14"))).toEqual({
      start: "2027-03-01",
      end: "2027-05-31",
      exact: false,
    });
  });

  it("gives an unsure visitor the next six months", () => {
    expect(intentWindow(draft({ mode: "unsure" }), at("2026-09-14"))).toEqual({
      start: "2026-09-14",
      end: "2027-03-14",
      exact: false,
    });
  });

  it("falls back to the six-month guess when dates are half-filled", () => {
    expect(intentWindow(draft({ mode: "dates", start: "2026-10-02" }), at("2026-09-14")).exact).toBe(
      false,
    );
  });
});

describe("intentSummary", () => {
  it("reads back exact dates", () => {
    expect(intentSummary(draft({ mode: "dates", start: "2026-10-02", end: "2026-10-16" }))).toBe(
      "Nepal, 2–16 Oct 2026",
    );
  });

  it("reads back a season with the year it lands in", () => {
    expect(intentSummary(draft({ mode: "season", season: "autumn" }), at("2026-09-14"))).toBe(
      "Nepal, autumn 2026",
    );
  });

  it("says dates are open rather than inventing some", () => {
    expect(intentSummary(draft({ mode: "unsure" }))).toBe("Nepal, dates open");
  });
});

describe("prettyRange", () => {
  it("names the month once when the trek stays inside it", () => {
    expect(prettyRange("2026-10-02", "2026-10-16")).toBe("2–16 Oct 2026");
  });

  it("names both months when it straddles one", () => {
    expect(prettyRange("2026-10-28", "2026-11-09")).toBe("28 Oct–9 Nov 2026");
  });

  it("hands back the raw dates rather than an Invalid Date", () => {
    expect(prettyRange("not-a-date", "2026-10-16")).toBe("not-a-date – 2026-10-16");
  });
});

describe("cleanPartySize", () => {
  it("takes a sensible number", () => {
    expect(cleanPartySize("3")).toBe(3);
  });

  it("is null rather than zero when nothing was said", () => {
    expect(cleanPartySize("")).toBeNull();
    expect(cleanPartySize(undefined)).toBeNull();
    expect(cleanPartySize("many")).toBeNull();
  });

  it("caps a party at what a guide can actually take", () => {
    expect(cleanPartySize("400")).toBe(16);
  });
});

describe("browseHref", () => {
  it("hands them a browse page already narrowed to their window", () => {
    expect(browseHref(draft({ mode: "dates", start: "2026-10-02", end: "2026-10-16" }))).toBe(
      "/guides?from=2026-10-02&to=2026-10-16",
    );
  });
});

describe("isIntentMode", () => {
  it("rejects anything not offered", () => {
    expect(isIntentMode("dates")).toBe(true);
    expect(isIntentMode("someday")).toBe(false);
    expect(isIntentMode(null)).toBe(false);
  });
});
