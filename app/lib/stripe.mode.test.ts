import { describe, expect, it } from "vitest";
import { getStripe } from "./stripe.server";

describe("Stripe mode selection", () => {
  it("fails closed when no secret is configured", () => {
    expect(() => getStripe({ SITE_URL: "https://trek.example" } as Env)).toThrow(/required/);
  });

  it("permits mock payments only with an explicit localhost flag", async () => {
    const stripe = getStripe({ SITE_URL: "http://localhost:5173", STRIPE_MOCK_MODE: "true" } as Env);
    const created = await stripe.createDepositIntent({
      amountUsdCents: 1234,
      bookingId: "booking-1",
      saveCard: true,
    });
    await expect(stripe.retrievePaymentIntent(created.paymentIntentId)).resolves.toMatchObject({
      amountReceived: 1234,
      currency: "usd",
      metadata: { booking_id: "booking-1" },
    });
  });

  it("rejects explicit mock mode on a public origin", () => {
    expect(() => getStripe({ SITE_URL: "https://trek.example", STRIPE_MOCK_MODE: "true" } as Env))
      .toThrow(/required/);
  });
});
