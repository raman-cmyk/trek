import { describe, expect, it } from "vitest";
import {
  eventDates,
  eventSlug,
  missingForLive,
  opsCanMove,
  organiserCanEdit,
  placesLeft,
  validateProposal,
} from "./events";

describe("validateProposal", () => {
  const ok = {
    title: "Gokyo for photographers",
    pitch: "Eight of us, November, slow days so there is time to shoot the lakes at dawn.",
    max_people: 8,
  };

  it("passes a real proposal", () => {
    expect(validateProposal(ok)).toBeNull();
  });

  it("asks for more than a one-liner", () => {
    expect(validateProposal({ ...ok, pitch: "A trek." })).toContain("few sentences");
  });

  it("checks the name and the party size", () => {
    expect(validateProposal({ ...ok, title: "Go" })).toContain("name");
    expect(validateProposal({ ...ok, max_people: 1 })).toContain("2 and 40");
    expect(validateProposal({ ...ok, max_people: 41 })).toContain("2 and 40");
  });

  it("catches reversed dates", () => {
    expect(
      validateProposal({ ...ok, start_date: "2026-11-10", end_date: "2026-11-02" }),
    ).toContain("before the start");
  });
});

describe("missingForLive", () => {
  const full = {
    start_date: "2026-11-02",
    end_date: "2026-11-12",
    summary: "Ten days, slow, at the lakes for dawn.",
    cover_photo_url: "/img/x.jpg",
    meeting_point: "Kathmandu, Thamel",
    price_usd_cents: 120000,
  };

  it("is empty when the page is complete", () => {
    expect(missingForLive(full)).toEqual([]);
  });

  it("lists everything missing at once, not one at a time", () => {
    const missing = missingForLive({ summary: "x" });
    expect(missing).toContain("the dates");
    expect(missing).toContain("a cover photo");
    expect(missing).toContain("where it starts");
    expect(missing).toContain("a price per person");
    expect(missing.length).toBe(4);
  });

  it("treats a free event as priced, not as missing", () => {
    expect(missingForLive({ ...full, price_usd_cents: 0 })).toEqual([]);
  });
});

describe("the state machine", () => {
  it("only lets the office move an event where it should", () => {
    expect(opsCanMove("submitted", "accepted")).toBe(true);
    expect(opsCanMove("submitted", "declined")).toBe(true);
    expect(opsCanMove("review", "live")).toBe(true);
    // No skipping the accept, and no resurrecting a cancelled event.
    expect(opsCanMove("submitted", "live")).toBe(false);
    expect(opsCanMove("cancelled", "live")).toBe(false);
    expect(opsCanMove("draft", "accepted")).toBe(false);
  });

  it("hands the pen to the office once it is live", () => {
    expect(organiserCanEdit("draft")).toBe(true);
    expect(organiserCanEdit("accepted")).toBe(true);
    expect(organiserCanEdit("live")).toBe(false);
    expect(organiserCanEdit("cancelled")).toBe(false);
  });
});

describe("placesLeft", () => {
  it("counts down and never goes negative", () => {
    expect(placesLeft(8, 3)).toBe(5);
    expect(placesLeft(8, 8)).toBe(0);
    expect(placesLeft(8, 99)).toBe(0);
    expect(placesLeft(8, -2)).toBe(8);
  });
});

describe("eventDates", () => {
  it("collapses a single month", () => {
    expect(eventDates("2026-10-12", "2026-10-19")).toBe("12–19 Oct 2026");
  });
  it("spells out a crossing", () => {
    expect(eventDates("2026-09-28", "2026-10-04")).toBe("28 Sep – 4 Oct 2026");
  });
  it("says so when there are no dates", () => {
    expect(eventDates(null, null)).toBe("Dates to be set");
  });
});

describe("eventSlug", () => {
  it("stays readable and unguessable", () => {
    expect(eventSlug("Gokyo for photographers", "ab12")).toBe("gokyo-for-photographers-ab12");
    expect(eventSlug("!!!", "ab12")).toBe("event-ab12");
  });
});
