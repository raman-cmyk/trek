import { describe, expect, it } from "vitest";
import { assurances, CARD_NETWORKS, paymentNote } from "./assurance";
import { depositFacts, freeCancellationDays } from "./policy-copy";

describe("assurances", () => {
  it("offers exactly three, which is what the row has room for", () => {
    expect(assurances()).toHaveLength(3);
  });

  it("quotes the cancellation window the refund engine actually pays", () => {
    const row = assurances().find((a) => a.key === "cancel")!;
    expect(row.headline).toContain(String(freeCancellationDays()));
  });

  it("quotes the deposit the booking flow actually charges", () => {
    const row = assurances().find((a) => a.key === "deposit")!;
    expect(row.headline).toContain(`${depositFacts().depositPct}%`);
    expect(row.detail).toContain(String(depositFacts().balanceDaysBefore));
  });

  it("says what is withheld in the same breath as 'free'", () => {
    // A headline promise with the exception on another page is how a refund
    // becomes a complaint.
    const row = assurances().find((a) => a.key === "cancel")!;
    expect(row.headline.toLowerCase()).toContain("free cancellation");
    expect(row.detail.toLowerCase()).toMatch(/fee/);
  });

  it("sends every claim somewhere it is spelled out in full", () => {
    for (const a of assurances()) expect(a.href).toMatch(/^\/(cancellation|trust)$/);
  });

  it("promises no rescheduling, which we do not offer", () => {
    // The founder was explicit: no unlimited rescheduling. Competitors put it
    // in this exact slot, so the guard belongs here rather than in review.
    const text = JSON.stringify(assurances()).toLowerCase();
    expect(text).not.toContain("reschedul");
    expect(text).not.toContain("change of plans");
  });

  it("promises nothing about price-matching or round-the-clock support", () => {
    const text = JSON.stringify(assurances()).toLowerCase();
    expect(text).not.toContain("lowest price");
    expect(text).not.toContain("best price");
    expect(text).not.toContain("24/7");
    expect(text).not.toContain("instant");
  });
});

describe("paymentNote", () => {
  it("says nothing at all when Stripe has no keys", () => {
    // "We accept Visa" on a site that cannot take a card is the worst line on
    // this list, because somebody will try.
    expect(paymentNote(false).show).toBe(false);
  });

  it("lists the networks once Stripe is configured", () => {
    const n = paymentNote(true);
    expect(n.show).toBe(true);
    expect(n.networks).toEqual(CARD_NETWORKS);
  });

  it("claims no method a US entity charging in dollars does not get", () => {
    const all = [...paymentNote(true).networks, ...paymentNote(true).wallets]
      .join(" ")
      .toLowerCase();
    for (const absent of ["klarna", "ideal", "bancontact", "sofort", "paypal", "alipay"]) {
      expect(all).not.toContain(absent);
    }
  });

  it("is honest about the currency rather than implying a local one", () => {
    expect(paymentNote(true).note).toContain("US dollars");
  });

  it("says who holds the card number", () => {
    expect(paymentNote(true).processor).toBe("Stripe");
    expect(paymentNote(true).note.toLowerCase()).toContain("never see your card");
  });
});
