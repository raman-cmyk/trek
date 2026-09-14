import { describe, it, expect } from "vitest";
import {
  CANCELLATION_TEASER,
  REFUND_BANDS,
  balanceLine,
  depositTeaser,
  depositLine,
  fullPaymentReason,
  paymentPlan,
} from "./payment-policy";
import { DEPOSIT_RATE, FULL_PAYMENT_WINDOW_DAYS } from "./pricing";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const fmtDate = (iso: string) => `D(${iso})`;
const plan = (total: number, start: string, today = "2026-01-01") =>
  paymentPlan({ totalUsdCents: total, startDate: start, today });

describe("what you pay now", () => {
  it("is the deposit rate on a trip far enough out", () => {
    const p = plan(124_000, "2026-06-01");
    expect(p.depositUsdCents).toBe(Math.round(124_000 * DEPOSIT_RATE));
    expect(p.depositPct).toBe(20);
    expect(p.fullUpfront).toBe(false);
    expect(depositLine(p, money)).toBe("Pay a 20% deposit of $248.00 when you book.");
  });

  it("is everything, inside the full-payment window", () => {
    const p = plan(124_000, "2026-01-10");
    expect(p.fullUpfront).toBe(true);
    expect(p.balanceUsdCents).toBe(0);
    expect(p.depositUsdCents).toBe(124_000);
    expect(depositLine(p, money)).toBe("Pay $1240.00 in full when you book.");
    expect(fullPaymentReason(p)).toContain(`within ${FULL_PAYMENT_WINDOW_DAYS} days`);
    expect(fullPaymentReason(p)).toContain("starts in 9 days");
  });

  it("says 'day' when there is one", () => {
    expect(fullPaymentReason(plan(1000, "2026-01-02"))).toContain("1 day.");
  });

  it("adds up to the total, either way", () => {
    for (const start of ["2026-06-01", "2026-01-10", "2026-01-15"]) {
      const p = plan(99_999, start);
      expect(p.depositUsdCents + p.balanceUsdCents).toBe(99_999);
    }
  });

  it("treats the boundary the way pricing does", () => {
    // 14 days out is the first day a deposit is allowed.
    expect(plan(1000, "2026-01-15").fullUpfront).toBe(false);
    expect(plan(1000, "2026-01-14").fullUpfront).toBe(true);
  });
});

describe("when the rest is taken", () => {
  it("is 14 days before the start, named", () => {
    const p = plan(124_000, "2026-06-01");
    expect(p.balanceDueDate).toBe("2026-05-18");
    expect(balanceLine(p, money, fmtDate)).toBe(
      "The remaining $992.00 is charged on D(2026-05-18), 14 days before you start.",
    );
  });
  it("says nothing when there is nothing left to take", () => {
    const p = plan(124_000, "2026-01-10");
    expect(p.balanceDueDate).toBeNull();
    expect(balanceLine(p, money, fmtDate)).toBeNull();
    expect(fullPaymentReason(plan(1000, "2026-06-01"))).toBeNull();
  });
});

describe("the refund bands shown before booking", () => {
  it("cover every case the policy has, in order", () => {
    expect(REFUND_BANDS).toHaveLength(4);
    expect(REFUND_BANDS[0].when).toContain("30 days or more");
    // The card fee is not refundable, and saying "free" would be a promise
    // the policy does not keep.
    expect(REFUND_BANDS[0].youGetBack).toContain("except the card fee");
    expect(REFUND_BANDS[3].youGetBack).toContain("nothing");
  });
});

describe("the two rows a reader sees before opening anything", () => {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const date = (iso: string) => iso;

  it("names both figures and the day the second one goes", () => {
    const plan = paymentPlan({
      totalUsdCents: 124_000,
      startDate: "2026-12-01",
      today: "2026-09-14",
    });
    expect(depositTeaser(plan, money, date)).toBe("$248.00 now, $992.00 on 2026-11-17.");
  });

  it("says why there is only one figure when the trip is soon", () => {
    const plan = paymentPlan({
      totalUsdCents: 124_000,
      startDate: "2026-09-20",
      today: "2026-09-14",
    });
    expect(depositTeaser(plan, money, date)).toBe(
      "$1240.00 now — trips this soon are paid in full.",
    );
  });

  it("takes the cancellation summary from the bands, so the two cannot disagree", () => {
    expect(CANCELLATION_TEASER).toContain(REFUND_BANDS[0].youGetBack);
    expect(CANCELLATION_TEASER).toBe(
      "Cancel 30 days or more before and you get everything except the card fee back.",
    );
  });
});
