import { describe, it, expect } from "vitest";
import { describeDeletionBlock, parseDeleteResult, whyNotDeletable } from "./people";

describe("reading what ops_delete_person returned", () => {
  it("recognises a deletion", () => {
    expect(parseDeleteResult({ ok: true, name: "Joh Doe", role: "trekker" })).toEqual({
      ok: true,
      name: "Joh Doe",
      role: "trekker",
    });
  });

  it("carries the counts of a refusal", () => {
    const r = parseDeleteResult({
      ok: false,
      reason: "has_history",
      name: "Pasang",
      role: "guide",
      bookings: 3,
      payouts: 1,
      contracts: 0,
    });
    expect(r).toMatchObject({ ok: false, reason: "has_history", bookings: 3, payouts: 1 });
  });

  it("treats anything else as not found", () => {
    expect(parseDeleteResult(null)).toEqual({ ok: false, reason: "not_found" });
    expect(parseDeleteResult({ ok: false, reason: "not_found" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("the sentence the office reads when deletion is refused", () => {
  it("lists what is on the books and tells them what to do with a guide", () => {
    const s = describeDeletionBlock({
      ok: false,
      reason: "has_history",
      name: "Pasang Lhamu Sherpa",
      role: "guide",
      bookings: 2,
      payouts: 1,
      contracts: 0,
    });
    expect(s).toBe(
      "Pasang Lhamu Sherpa can't be deleted — they have 2 trips, 1 payout on the books. Set their status to removed or suspended instead.",
    );
  });

  it("explains why a trekker with a trip stays", () => {
    const s = describeDeletionBlock({
      ok: false,
      reason: "has_history",
      name: "Liam Walsh",
      role: "trekker",
      bookings: 1,
      payouts: 0,
      contracts: 0,
    });
    expect(s).toContain("1 trip on the books");
    expect(s).toContain("money that moved");
  });
});

describe("which rows may offer a delete button", () => {
  it("never the person signed in", () => {
    expect(whyNotDeletable({ isSelf: true, trips: 0 })).toBe("That's you");
  });
  it("nobody with trips", () => {
    expect(whyNotDeletable({ isSelf: false, trips: 2 })).toBe("Has trips");
  });
  it("anyone else", () => {
    expect(whyNotDeletable({ isSelf: false, trips: 0 })).toBeNull();
  });
});
