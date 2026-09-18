import { describe, it, expect } from "vitest";
import {
  INSURANCE_FILTERS,
  bySoonestStart,
  coverIsEnough,
  insuranceState,
  missingCover,
  needsAttention,
} from "./insurance-queue";

const full = { altitude: true, helicopter: true, medical: true, repatriation: true };
const thin = { altitude: true, helicopter: false, medical: true };

describe("is the cover enough", () => {
  it("wants altitude and a helicopter, and nothing else decides it", () => {
    expect(coverIsEnough(full)).toBe(true);
    expect(coverIsEnough({ altitude: true, helicopter: true })).toBe(true);
    expect(coverIsEnough(thin)).toBe(false);
    expect(coverIsEnough({ medical: true, repatriation: true })).toBe(false);
  });

  it("treats a missing policy as not enough rather than throwing", () => {
    expect(coverIsEnough(null)).toBe(false);
    expect(coverIsEnough(undefined)).toBe(false);
  });

  it("names what is missing, so the office can say what to buy", () => {
    expect(missingCover(thin)).toEqual(["helicopter"]);
    expect(missingCover(null)).toEqual(["altitude", "helicopter"]);
    expect(missingCover(full)).toEqual([]);
  });
});

describe("where one booking's insurance stands", () => {
  it("is waiting on us once it is declared and the cover is right", () => {
    expect(
      insuranceState({ insurance_attested_at: "2026-09-01", insurance_meta: full }),
    ).toBe("waiting");
  });

  it("is its own state when the cover is too thin — a different job", () => {
    expect(
      insuranceState({ insurance_attested_at: "2026-09-01", insurance_meta: thin }),
    ).toBe("cover_short");
  });

  it("is nothing declared when the trekker has not run the checker", () => {
    expect(insuranceState({})).toBe("not_declared");
  });

  it("is sent back once the office has refused it", () => {
    expect(
      insuranceState({
        insurance_attested_at: "2026-09-01",
        insurance_rejected_at: "2026-09-02",
        insurance_meta: thin,
      }),
    ).toBe("sent_back");
  });

  it("stays verified even where a box is unticked — a person decided that", () => {
    expect(
      insuranceState({
        insurance_attested_at: "2026-09-01",
        insurance_verified_at: "2026-09-03",
        insurance_meta: thin,
      }),
    ).toBe("verified");
  });
});

describe("the queue", () => {
  const today = "2026-09-18";
  const trip = (over: any) => ({
    status: "confirmed",
    start_date: "2026-12-01",
    insurance_attested_at: "2026-09-01",
    insurance_meta: full,
    ...over,
  });

  it("drops anything already verified", () => {
    expect(needsAttention([trip({ insurance_verified_at: "2026-09-05" })], today)).toHaveLength(0);
  });

  it("drops cancelled and completed trips — neither is work", () => {
    const rows = [trip({ status: "cancelled_trekker" }), trip({ status: "completed" })];
    expect(needsAttention(rows, today)).toHaveLength(0);
  });

  it("drops a trek that has already been walked", () => {
    expect(needsAttention([trip({ start_date: "2026-08-01" })], today)).toHaveLength(0);
  });

  it("puts thin cover above the ordinary queue", () => {
    const rows = [
      trip({ id: "waiting" }),
      trip({ id: "short", insurance_meta: thin }),
      trip({ id: "none", insurance_attested_at: null }),
    ];
    expect(needsAttention(rows, today).map((r: any) => r.id)).toEqual([
      "short",
      "waiting",
      "none",
    ]);
  });

  it("within a state, the trek that leaves first comes first", () => {
    const rows = [
      trip({ id: "later", start_date: "2027-03-01" }),
      trip({ id: "sooner", start_date: "2026-10-01" }),
    ];
    expect(needsAttention(rows, today).map((r: any) => r.id)).toEqual(["sooner", "later"]);
  });
});

describe("sorting by start date", () => {
  it("puts a trip with no date last, not first", () => {
    const sorted = bySoonestStart([
      { id: "none", start_date: null },
      { id: "dated", start_date: "2026-12-01" },
    ]);
    expect(sorted.map((r: any) => r.id)).toEqual(["dated", "none"]);
  });
});

describe("they asked us to sort it", () => {
  it("is its own state, because it is a promise we made", () => {
    expect(
      insuranceState({ insurance_help_asked_at: "2026-09-18" }),
    ).toBe("help_wanted");
  });

  it("outranks a policy they also happen to have declared", () => {
    expect(
      insuranceState({
        insurance_help_asked_at: "2026-09-18",
        insurance_attested_at: "2026-09-01",
        insurance_meta: thin,
      }),
    ).toBe("help_wanted");
  });

  it("is over once the office has closed it", () => {
    expect(
      insuranceState({
        insurance_help_asked_at: "2026-09-18",
        insurance_help_closed_at: "2026-09-19",
      }),
    ).toBe("not_declared");
  });

  it("is over once their policy is verified", () => {
    expect(
      insuranceState({
        insurance_help_asked_at: "2026-09-18",
        insurance_verified_at: "2026-09-20",
      }),
    ).toBe("verified");
  });

  it("sits at the top of the queue — ahead of thin cover", () => {
    const today = "2026-09-18";
    const rows = [
      { id: "short", status: "confirmed", start_date: "2026-12-01", insurance_attested_at: "2026-09-01", insurance_meta: thin },
      { id: "asked", status: "confirmed", start_date: "2026-12-01", insurance_help_asked_at: "2026-09-18" },
    ];
    expect(needsAttention(rows as any, today).map((r: any) => r.id)).toEqual(["asked", "short"]);
  });
});

describe("the tabs", () => {
  it("leads with our own promise, then the one that cannot go as insured", () => {
    expect(INSURANCE_FILTERS[1].key).toBe("help_wanted");
    expect(INSURANCE_FILTERS[2].key).toBe("cover_short");
  });

  it("covers every state the derivation can produce", () => {
    const covered = new Set(INSURANCE_FILTERS.flatMap((f) => f.statuses ?? []));
    for (const s of [
      "verified",
      "help_wanted",
      "cover_short",
      "waiting",
      "sent_back",
      "not_declared",
    ]) {
      expect(covered.has(s)).toBe(true);
    }
  });
});
