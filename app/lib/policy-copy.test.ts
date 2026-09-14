import { describe, expect, it } from "vitest";
import {
  alwaysRefundedRows,
  depositFacts,
  depositLine,
  freeCancellationDays,
  freeCancellationLine,
  refundRows,
} from "./policy-copy";
import { computeCancellation } from "./policy";

describe("refundRows", () => {
  const rows = refundRows();

  it("covers every band a trekker can cancel in", () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.when)).toEqual([
      "30 days or more before you leave",
      "15 to 29 days before",
      "7 to 14 days before",
      "Less than 7 days before",
    ]);
  });

  it("says what the engine actually does, band by band", () => {
    expect(rows[0].youGet).toMatch(/less the card processing fee/);
    expect(rows[1].youGet).toBe("50% back");
    expect(rows[2].youGet).toBe("25% back");
    expect(rows[3].youGet).toBe("Nothing back");
  });

  it("does not claim the guide is paid when they are not", () => {
    expect(rows[0].guideGets).toBeNull();
    expect(rows[1].guideGets).toMatch(/25%/);
    expect(rows[3].guideGets).toMatch(/50%/);
  });

  /**
   * The point of generating the page: if somebody edits the matrix, the words
   * move with it. This asserts the link rather than the numbers.
   */
  it("is derived from the engine, not typed beside it", () => {
    const o = computeCancellation({
      totalPaidUsdCents: 100_000,
      guideFeeUsdCents: 60_000,
      daysUntilStart: 20,
      reason: "trekker",
    });
    const pct = Math.round((o.refundToTrekkerUsdCents / 100_000) * 100);
    expect(rows[1].youGet).toBe(`${pct}% back`);
  });
});

describe("alwaysRefundedRows", () => {
  it("promises everything back when it is not the trekker's doing", () => {
    const rows = alwaysRefundedRows();
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.youGet).toMatch(/Everything back/);
  });

  it("says who carries the card fee, because somebody does", () => {
    for (const r of alwaysRefundedRows()) expect(r.youGet).toMatch(/card fee/);
  });
});

describe("the deposit", () => {
  it("states the real rate and the real dates", () => {
    const f = depositFacts();
    expect(f.depositPct).toBe(20);
    expect(f.balanceDaysBefore).toBe(14);
    expect(f.autoCancelDaysBefore).toBe(10);
  });

  it("fits under a booking box and contains both halves", () => {
    const line = depositLine();
    expect(line).toContain("20%");
    expect(line).toContain("14 days");
    expect(line.length).toBeLessThan(120);
  });

  it("moves if the rate moves", () => {
    expect(depositLine({ depositPct: 35, balanceDaysBefore: 21, autoCancelDaysBefore: 10, fullPaymentWindowDays: 14 })).toBe(
      "Pay 35% to hold your dates. The rest is due 21 days before you leave.",
    );
  });
});

describe("free cancellation", () => {
  it("is the band the engine actually pays in full", () => {
    expect(freeCancellationDays()).toBe(30);
  });

  it("moves with the engine rather than being typed beside it", () => {
    const d = freeCancellationDays();
    const paid = 100_000;
    const inside = computeCancellation({
      totalPaidUsdCents: paid,
      guideFeeUsdCents: 60_000,
      daysUntilStart: d - 1,
      reason: "trekker",
    });
    // One day later and you are no longer made whole — that is the boundary.
    expect(inside.refundToTrekkerUsdCents).toBeLessThan(paid * 0.9);
  });

  it("says free, and says in the same breath what is withheld", () => {
    const { headline, detail } = freeCancellationLine();
    expect(headline).toBe("Free cancellation up to 30 days before you leave");
    expect(detail).toMatch(/card processing fee/);
  });
});
