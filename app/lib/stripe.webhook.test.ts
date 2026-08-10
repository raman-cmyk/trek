import { describe, it, expect } from "vitest";
import { verifyStripeSignature } from "./stripe.server";

const SECRET = "whsec_test_secret";
const enc = new TextEncoder();

/** Produce a valid Stripe signature header for a payload at time t (seconds). */
async function sign(payload: string, tSec: number, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${tSec}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${tSec},v1=${hex}`;
}

describe("Stripe webhook signature verification", () => {
  const nowMs = 1_700_000_000_000;
  const nowSec = Math.floor(nowMs / 1000);
  const payload = JSON.stringify({
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_1", metadata: { booking_id: "b1" } } },
  });

  it("accepts a correctly signed, fresh event", async () => {
    const header = await sign(payload, nowSec);
    const event = await verifyStripeSignature(payload, header, SECRET, { nowMs });
    expect(event.type).toBe("payment_intent.succeeded");
    expect(event.data.object.metadata.booking_id).toBe("b1");
  });

  it("rejects a tampered payload (signature mismatch)", async () => {
    const header = await sign(payload, nowSec);
    const forged = payload.replace("b1", "b2"); // attacker swaps the booking
    await expect(verifyStripeSignature(forged, header, SECRET, { nowMs })).rejects.toThrow(
      /mismatch/,
    );
  });

  it("rejects the wrong secret", async () => {
    const header = await sign(payload, nowSec, "whsec_attacker");
    await expect(verifyStripeSignature(payload, header, SECRET, { nowMs })).rejects.toThrow(
      /mismatch/,
    );
  });

  it("rejects a replayed (stale) timestamp beyond tolerance", async () => {
    const oldSec = nowSec - 600; // 10 min old, tolerance is 300s
    const header = await sign(payload, oldSec);
    await expect(verifyStripeSignature(payload, header, SECRET, { nowMs })).rejects.toThrow(
      /tolerance/,
    );
  });

  it("rejects a missing signature header (unsigned forgery)", async () => {
    await expect(verifyStripeSignature(payload, null, SECRET, { nowMs })).rejects.toThrow(
      /missing stripe-signature/,
    );
  });

  it("rejects a missing secret", async () => {
    const header = await sign(payload, nowSec);
    await expect(verifyStripeSignature(payload, header, "", { nowMs })).rejects.toThrow(
      /missing webhook secret/,
    );
  });
});
