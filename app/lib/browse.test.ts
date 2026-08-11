import { describe, expect, it } from "vitest";
import { addDays, daysInRange, escapeLike, guideMatchesText, parseRange } from "./browse";

const TODAY = "2026-08-11";

describe("parseRange", () => {
  it("returns null without a from date", () => {
    expect(parseRange(null, "2026-10-01", TODAY)).toBeNull();
    expect(parseRange("october", null, TODAY)).toBeNull();
  });

  it("clamps a past start to today", () => {
    expect(parseRange("2020-01-01", "2026-10-01", TODAY)?.from).toBe(TODAY);
  });

  it("treats a missing or backwards end as a single day", () => {
    expect(parseRange("2026-10-01", null, TODAY)).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(parseRange("2026-10-05", "2026-10-01", TODAY)?.to).toBe("2026-10-05");
  });

  it("caps the window at a year so a pasted date can't scan the table", () => {
    expect(parseRange("2026-10-01", "2099-01-01", TODAY)?.to).toBe("2027-10-01");
  });
});

describe("date helpers", () => {
  it("crosses month and year boundaries in UTC", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("counts an inclusive range", () => {
    expect(daysInRange({ from: "2026-10-01", to: "2026-10-31" })).toBe(31);
    expect(daysInRange({ from: "2026-10-01", to: "2026-10-01" })).toBe(1);
  });
});

describe("escapeLike", () => {
  it("strips the characters that would break a PostgREST or= filter", () => {
    expect(escapeLike("Annapurna, (north)")).toBe("Annapurna   north");
    expect(escapeLike("50%")).toBe("50");
  });
});

describe("guideMatchesText", () => {
  const g = {
    full_name: "Sunita Gurung",
    home_district: "Kaski",
    hook_line: "A rare woman guide leading Annapurna",
    bio: "Solo women travellers, I have got you.",
  };

  it("matches name, district, hook and bio, case-insensitively", () => {
    expect(guideMatchesText(g, "sunita")).toBe(true);
    expect(guideMatchesText(g, "KASKI")).toBe(true);
    expect(guideMatchesText(g, "Annapurna")).toBe(true);
    expect(guideMatchesText(g, "solo women")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(guideMatchesText(g, "Everest")).toBe(false);
  });

  it("tolerates null district, hook and bio", () => {
    expect(
      guideMatchesText(
        { full_name: "Ang Dorje Sherpa", home_district: null, hook_line: null, bio: null },
        "dorje",
      ),
    ).toBe(true);
  });
});
