import { describe, expect, it, vi } from "vitest";
import { fulfillDeposit } from "./booking.server";

const bookingId = "00000000-0000-0000-0000-000000000001";
const payment = {
  id: "pi_123",
  status: "succeeded",
  amount: 22_302,
  amountReceived: 22_302,
  currency: "usd",
  metadata: { booking_id: bookingId },
};

describe("fulfillDeposit", () => {
  it("passes all provider facts to the atomic database boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const result = await fulfillDeposit({ rpc } as any, bookingId, payment, 3);
    expect(result).toEqual({ applied: true });
    expect(rpc).toHaveBeenCalledWith("settle_booking_deposit", {
      p_booking_id: bookingId,
      p_payment_intent: "pi_123",
      p_status: "succeeded",
      p_amount_received: 22_302,
      p_currency: "usd",
      p_metadata_booking_id: bookingId,
      p_instalment_count: 3,
    });
  });

  it("preserves idempotent no-op results", async () => {
    const admin = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) } as any;
    await expect(fulfillDeposit(admin, bookingId, payment)).resolves.toEqual({ applied: false });
  });

  it("fails closed when the transaction rejects mismatched facts", async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "payment amount does not match" } }),
    } as any;
    await expect(fulfillDeposit(admin, bookingId, payment)).rejects.toThrow(/amount does not match/);
  });
});
