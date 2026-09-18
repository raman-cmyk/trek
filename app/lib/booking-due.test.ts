import { describe, it, expect } from "vitest";
import { bookingDue } from "./booking-due";

const paid = (n: number, type = "deposit") => ({
  type,
  amount_usd_cents: n,
  status: "succeeded",
});

const TREK = {
  total_usd_cents: 128468,
  deposit_usd_cents: 25694,
  start_date: "2026-08-07",
};

describe("what the trekker still owes", () => {
  it("counts from the money that arrived, not from total minus deposit", () => {
    // Five people paying shares against the same booking. The flags still say
    // deposit_paid; the money is all in. This is the bug that charged an
    // organiser's card for a trip that was already paid for.
    const d = bookingDue(
      {
        ...TREK,
        status: "deposit_paid",
        payments: [paid(25694), paid(50000, "share"), paid(52774, "share")],
      },
      "2026-07-01",
    );
    expect(d.outstandingUsdCents).toBe(0);
    expect(d.next.key).toBe("settled");
    expect(d.next.amountUsdCents).toBe(0);
  });

  it("ignores a payment that did not succeed", () => {
    const d = bookingDue(
      {
        ...TREK,
        status: "deposit_paid",
        payments: [{ type: "balance", amount_usd_cents: 102774, status: "failed" }],
      },
      "2026-07-01",
    );
    expect(d.outstandingUsdCents).toBe(128468);
  });
});

describe("the next thing somebody has to pay", () => {
  it("is the deposit while the dates are only held", () => {
    const d = bookingDue(
      { ...TREK, status: "pending_deposit", hold_expires_at: "2026-07-02T09:00:00Z", payments: [] },
      "2026-07-01",
    );
    expect(d.next.key).toBe("deposit");
    expect(d.next.amountUsdCents).toBe(25694);
    expect(d.next.dueOn).toBe("2026-07-02");
    expect(d.next.daysAway).toBe(1);
    expect(d.next.consequence).toContain("calendar is released");
  });

  it("never asks for a deposit larger than what is actually left", () => {
    const d = bookingDue(
      { ...TREK, status: "pending_deposit", payments: [paid(120000)] },
      "2026-07-01",
    );
    expect(d.next.amountUsdCents).toBe(8468);
  });

  it("is the balance, due fourteen days before the trek", () => {
    const d = bookingDue(
      { ...TREK, status: "deposit_paid", payments: [paid(25694)] },
      "2026-07-01",
    );
    expect(d.next.key).toBe("balance");
    expect(d.next.amountUsdCents).toBe(102774);
    expect(d.next.dueOn).toBe("2026-07-24");
    expect(d.next.overdue).toBe(false);
  });

  it("says so when that date has gone by", () => {
    const d = bookingDue(
      { ...TREK, status: "deposit_paid", payments: [paid(25694)] },
      "2026-07-30",
    );
    expect(d.next.overdue).toBe(true);
    expect(d.next.daysAway).toBe(-6);
  });

  it("warns that the trip auto-cancels once inside ten days", () => {
    const d = bookingDue(
      { ...TREK, status: "deposit_paid", payments: [paid(25694)] },
      "2026-08-01", // six days out
    );
    expect(d.next.consequence).toContain("auto-cancels");
  });

  it("prefers the next unpaid instalment over the single balance", () => {
    const d = bookingDue(
      {
        ...TREK,
        status: "deposit_paid",
        payments: [paid(25694)],
        instalments: [
          { seq: 1, amount_usd_cents: 51387, due_date: "2026-06-15", status: "paid" },
          { seq: 2, amount_usd_cents: 51387, due_date: "2026-07-15", status: "due" },
        ],
      },
      "2026-07-01",
    );
    expect(d.next.key).toBe("instalment");
    expect(d.next.label).toBe("Instalment 2");
    expect(d.next.amountUsdCents).toBe(51387);
    expect(d.next.dueOn).toBe("2026-07-15");
  });

  it("skips a cancelled instalment", () => {
    const d = bookingDue(
      {
        ...TREK,
        status: "deposit_paid",
        payments: [paid(25694)],
        instalments: [
          { seq: 1, amount_usd_cents: 51387, due_date: "2026-06-15", status: "cancelled" },
          { seq: 2, amount_usd_cents: 51387, due_date: "2026-07-15", status: "due" },
        ],
      },
      "2026-07-01",
    );
    expect(d.next.label).toBe("Instalment 2");
  });

  it("says nothing is owed on a booking that is paid up", () => {
    const d = bookingDue(
      { ...TREK, status: "active", payments: [paid(128468)] },
      "2026-08-10",
    );
    expect(d.next.key).toBe("settled");
    expect(d.next.consequence).toBe("");
  });

  it("survives a booking with no dates and no payments", () => {
    const d = bookingDue({ total_usd_cents: 1000, status: "deposit_paid" }, "2026-07-01");
    expect(d.outstandingUsdCents).toBe(1000);
    expect(d.next.dueOn).toBeNull();
    expect(d.next.overdue).toBe(false);
  });
});
