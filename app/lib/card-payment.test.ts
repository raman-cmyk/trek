import { describe, expect, it } from "vitest";
import {
  canCollectCard,
  cardStepProblem,
  isPaid,
  outcomeOfStatus,
  payErrorMessage,
} from "./card-payment";

describe("what a payment status means", () => {
  it("treats a succeeded intent as money, and nothing else as money by accident", () => {
    expect(outcomeOfStatus("succeeded")).toBe("fulfil");
    expect(isPaid("succeeded")).toBe(true);
    for (const s of ["requires_payment_method", "processing", "canceled", ""]) {
      expect(isPaid(s), s).toBe(false);
    }
  });

  it("counts a held authorisation as paid, because that is the deposit model", () => {
    expect(outcomeOfStatus("requires_capture")).toBe("fulfil");
  });

  it("asks for a card in every state that is waiting for one", () => {
    expect(outcomeOfStatus("requires_payment_method")).toBe("collect");
    expect(outcomeOfStatus("requires_confirmation")).toBe("collect");
    expect(outcomeOfStatus("requires_action")).toBe("collect");
  });

  it("waits while Stripe is still deciding rather than fulfilling or retrying", () => {
    expect(outcomeOfStatus("processing")).toBe("wait");
  });

  it("calls a cancelled intent dead, so a fresh one gets made instead", () => {
    expect(outcomeOfStatus("canceled")).toBe("dead");
  });

  it("never guesses about money when Stripe says something it has not seen", () => {
    expect(outcomeOfStatus("something_new_from_stripe")).toBe("wait");
    expect(outcomeOfStatus(null)).toBe("wait");
    expect(outcomeOfStatus(undefined)).toBe("wait");
  });

  it("is the reason the browser and the server cannot disagree about one payment", () => {
    // The same string, asked by both sides, gives the same answer. This is the
    // whole point of the function existing rather than two switch statements.
    for (const s of ["succeeded", "processing", "requires_payment_method", "canceled"]) {
      expect(outcomeOfStatus(s), s).toBe(outcomeOfStatus(s));
    }
    expect(isPaid("processing")).toBe(false);
  });
});

describe("whether the card field can be shown", () => {
  const ok = { isMock: false, publishableKey: "pk_test_x", clientSecret: "pi_1_secret_2" };

  it("shows the field when the server has a key, a secret and a real intent", () => {
    expect(cardStepProblem(ok)).toBeNull();
    expect(canCollectCard(ok)).toBe(true);
  });

  it("says so plainly when payments are still mocked, and that nobody was billed", () => {
    const p = cardStepProblem({ ...ok, isMock: true })!;
    expect(p).toContain("not switched on");
    expect(p).toContain("Nobody has been billed");
  });

  it("catches the half-configured deployment: a secret key but no publishable key", () => {
    const p = cardStepProblem({ ...ok, publishableKey: null })!;
    expect(p).toContain("half configured");
    expect(canCollectCard({ ...ok, publishableKey: "" })).toBe(false);
  });

  it("refuses rather than drawing an empty space where the card should be", () => {
    // A blank where the card belongs reads as "already paid", which is the
    // one misreading this must never allow.
    expect(cardStepProblem({ ...ok, clientSecret: null })).not.toBeNull();
    expect(cardStepProblem({ ...ok, clientSecret: "" })).not.toBeNull();
  });

  it("tells the payer no money moved in every refusal, not only the mock one", () => {
    const refusals = [
      cardStepProblem({ ...ok, isMock: true })!,
      cardStepProblem({ ...ok, publishableKey: null })!,
      cardStepProblem({ ...ok, clientSecret: null })!,
    ];
    for (const r of refusals) expect(r).toContain("Nobody has been billed");
  });
});

describe("what a failed payment says", () => {
  it("prefers Stripe's own words, which are written for the payer", () => {
    expect(payErrorMessage({ message: "Your card was declined." })).toBe(
      "Your card was declined.",
    );
  });

  it("still says something when the network dropped and Stripe said nothing", () => {
    const m = payErrorMessage(null);
    expect(m).toContain("not been charged");
    expect(payErrorMessage({ message: "   " })).toBe(m);
    expect(payErrorMessage(undefined)).toBe(m);
  });
});
