import { describe, it, expect } from "vitest";
import {
  arrangementTotals,
  formatMinor,
  kindLabel,
  sortArrangements,
  statusLabel,
} from "./arrangements";

const jeep = { kind: "transport", title: "Jeep, KTM → Soti Khola", status: "booked", currency: "NPR", cost_minor: 2500000, paid_minor: 0, due_on: "2026-11-20" };
const hotel = { kind: "hotel", title: "Hotel Ganesh Himal", status: "paid", currency: "NPR", cost_minor: 450000, paid_minor: 450000 };
const flight = { kind: "transport", title: "Lukla seat", status: "to_book", currency: "USD", cost_minor: 18000, paid_minor: 0 };
const called_off = { kind: "gear", title: "Down jacket", status: "cancelled", currency: "NPR", cost_minor: 300000, paid_minor: 0 };

describe("what the arrangements come to", () => {
  it("never adds rupees to dollars", () => {
    const t = arrangementTotals([jeep, hotel, flight]);
    expect(t.byCurrency).toEqual([
      { currency: "NPR", costMinor: 2950000, paidMinor: 450000, owedMinor: 2500000 },
      { currency: "USD", costMinor: 18000, paidMinor: 0, owedMinor: 18000 },
    ]);
  });

  it("leaves a cancelled row out of the money entirely", () => {
    const t = arrangementTotals([hotel, called_off]);
    expect(t.byCurrency[0].costMinor).toBe(450000);
    expect(t.cancelled).toBe(1);
  });

  it("counts what is still to book and what is still to pay", () => {
    const t = arrangementTotals([jeep, hotel, flight, called_off]);
    expect(t.toBook).toBe(1);
    expect(t.toPay).toBe(1);
  });

  it("never shows a negative owed when a vendor was overpaid", () => {
    const t = arrangementTotals([{ currency: "NPR", cost_minor: 1000, paid_minor: 1500, status: "paid" }]);
    expect(t.byCurrency[0].owedMinor).toBe(0);
  });

  it("copes with a row that has no money on it at all", () => {
    const t = arrangementTotals([{ title: "Ask about porters", status: "to_book" }]);
    expect(t.byCurrency).toEqual([
      { currency: "NPR", costMinor: 0, paidMinor: 0, owedMinor: 0 },
    ]);
  });
});

describe("reading order", () => {
  it("puts an overdue vendor first, then what is coming, then settled, then cancelled", () => {
    const sorted = sortArrangements([hotel, called_off, flight, jeep], "2026-12-01");
    expect(sorted.map((r) => r.title)).toEqual([
      "Jeep, KTM → Soti Khola", // due 20 Nov, today is 1 Dec
      "Lukla seat",
      "Hotel Ganesh Himal",
      "Down jacket",
    ]);
  });

  it("does not call a vendor late before their date", () => {
    const sorted = sortArrangements([jeep, flight], "2026-11-01");
    expect(sorted[0].title).toBe("Jeep, KTM → Soti Khola"); // by date, not lateness
  });
});

describe("labels", () => {
  it("names the kinds and statuses in the office's words", () => {
    expect(kindLabel("transport")).toBe("Transport");
    expect(kindLabel("permit_agent")).toBe("Agency work");
    expect(statusLabel("to_book")).toBe("To book");
  });

  it("falls back rather than printing a raw key at somebody", () => {
    expect(kindLabel("helicopter")).toBe("Something else");
  });

  it("formats minor units with the currency beside them", () => {
    expect(formatMinor(2500000, "NPR")).toBe("NPR 25,000");
    expect(formatMinor(18050, "usd")).toBe("USD 180.50");
  });
});
