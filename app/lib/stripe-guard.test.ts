import { describe, it, expect } from "vitest";
import { canTakePayments, getStripe } from "./stripe.server";

/**
 * The hole this closes.
 *
 * `MockStripe.retrievePaymentIntent` answered "succeeded" unconditionally, and
 * both checkout actions fulfil a booking on that word. With no
 * STRIPE_SECRET_KEY — the state of the live worker — pressing "Pay deposit"
 * marked a trek paid with no money moving. These are the two assertions that
 * stop it coming back.
 */

const env = (over: Record<string, unknown> = {}) => over as unknown as Env;

describe("an environment with no Stripe key cannot take money", () => {
  it("says so", () => {
    expect(canTakePayments(env())).toBe(false);
    expect(canTakePayments(env({ STRIPE_SECRET_KEY: "sk_test_x" }))).toBe(true);
  });

  it("never reports a payment as succeeded", async () => {
    const stripe = getStripe(env());
    const pi = await stripe.retrievePaymentIntent("pi_anything");
    expect(pi.status).not.toBe("succeeded");
    expect(pi.status).toBe("requires_payment_method");
  });

  it("is still recognisable as the mock, so the page can warn", () => {
    expect(getStripe(env()).isMock).toBe(true);
    expect(getStripe(env({ STRIPE_SECRET_KEY: "sk_test_x" })).isMock).toBe(false);
  });
});

describe("the local escape hatch", () => {
  it("fakes a success only when explicitly asked, by name", async () => {
    const stripe = getStripe(env({ ALLOW_FAKE_PAYMENTS: "1" }));
    expect((await stripe.retrievePaymentIntent("pi_x")).status).toBe("succeeded");
  });

  it("is off for every other value, including 'true'", async () => {
    for (const v of ["", "0", "true", "yes", undefined]) {
      const stripe = getStripe(env({ ALLOW_FAKE_PAYMENTS: v }));
      expect((await stripe.retrievePaymentIntent("pi_x")).status).toBe(
        "requires_payment_method",
      );
    }
  });

  it("does not make the environment able to take real money", () => {
    expect(canTakePayments(env({ ALLOW_FAKE_PAYMENTS: "1" }))).toBe(false);
  });
});
