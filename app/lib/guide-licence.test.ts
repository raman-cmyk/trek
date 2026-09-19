import { describe, expect, it } from "vitest";
import {
  LICENCE_FOR,
  checklistLabelFor,
  licenceAsk,
  licenceNeededFor,
  needsLicence,
  startingChecks,
} from "./guide-licence";
import { OFFERING_KINDS } from "./offering-kinds";

describe("which licence a kind of guiding needs", () => {
  it("has a rule for every kind of thing a guide can list", () => {
    // If a new offering kind appears, this fails until somebody decides
    // whether it needs a licence — which is the point.
    for (const k of OFFERING_KINDS) expect(LICENCE_FOR[k]).toBeTruthy();
  });

  it("asks a trekking guide for a trekking licence", () => {
    expect(licenceNeededFor(["trek"])).toBe("trekking");
  });

  it("asks a heritage walk for a tour guide licence", () => {
    // "Anything involved with national heritage Pashupati and all we should
    // be done by licenced guides."
    expect(licenceNeededFor(["city"])).toBe("tour");
  });

  it("asks a momo host for nothing", () => {
    expect(licenceNeededFor(["food_culture"])).toBe("none");
    expect(licenceNeededFor(["day_hike"])).toBe("none");
    expect(licenceNeededFor(["adventure"])).toBe("none");
    expect(needsLicence(["day_hike", "food_culture"])).toBe(false);
  });

  it("takes the strictest, not the first", () => {
    // Somebody who leads Everest and also runs a food walk is a trekking
    // guide. Asking for the lesser card because the food walk came first in
    // the list would be a hole you could drive a jeep through.
    expect(licenceNeededFor(["food_culture", "trek"])).toBe("trekking");
    expect(licenceNeededFor(["day_hike", "city"])).toBe("tour");
    expect(licenceNeededFor(["city", "trek"])).toBe("trekking");
  });

  it("asks for nothing when they have said nothing yet", () => {
    expect(licenceNeededFor([])).toBe("none");
  });
});

describe("licenceAsk", () => {
  it("names the card a trekking guide is being asked for", () => {
    expect(licenceAsk(["trek"]).heading).toBe("Trekking guide licence");
    expect(licenceAsk(["city"]).heading).toBe("Tour guide licence");
  });

  it("tells a guide who needs none that they need none", () => {
    const ask = licenceAsk(["food_culture"]);
    expect(ask.need).toBe("none");
    expect(ask.note).toContain("do not need a guide licence");
  });
});

describe("startingChecks", () => {
  it("still opens a licence check for a trekking guide", () => {
    const checks = startingChecks(["trek"]);
    const licence = checks.find((c) => c.check_type === "licence")!;
    expect(licence.status).toBe("pending");
    expect(licence.notes).toBe("Trekking guide licence");
  });

  it("marks the licence not-required rather than leaving it out", () => {
    // Omitting it would leave "Trekking licence seen" open forever in the
    // office checklist, because the checklist ticks itself off these rows by
    // name and there would be no row to close it.
    const checks = startingChecks(["food_culture"]);
    const licence = checks.find((c) => c.check_type === "licence")!;
    expect(licence.status).toBe("not_required");
  });

  it("never drops a check that has nothing to do with licensing", () => {
    for (const kinds of [["trek"], ["city"], ["food_culture"]]) {
      const types = startingChecks(kinds).map((c) => c.check_type);
      expect(types).toEqual(["licence", "id_match", "phone", "payout_account", "first_aid"]);
    }
  });
});

describe("checklistLabelFor", () => {
  it("matches the applies_to labels the office lists already carry (0106)", () => {
    expect(checklistLabelFor(["trek"])).toBe("trek guide");
    expect(checklistLabelFor(["day_hike"])).toBe("day guide");
    expect(checklistLabelFor(["city"])).toBe("day guide");
  });
});
