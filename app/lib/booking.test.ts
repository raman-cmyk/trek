import { describe, it, expect } from "vitest";
import { fulfillDeposit } from "./booking.server";

/**
 * Minimal in-memory Supabase mock — just enough of the query builder for
 * fulfillDeposit. Verifies webhook idempotency (a second delivery is a no-op).
 */
function makeMock(store: any) {
  function builder(table: string) {
    const state: any = { table, op: "select", filters: [] as [string, any][], single: false, payload: null };
    const api: any = {
      select() { return api; },
      insert(rows: any) { state.op = "insert"; state.payload = rows; return api; },
      upsert(rows: any, opts?: { onConflict?: string }) {
        state.op = "upsert";
        state.payload = rows;
        state.onConflict = (opts?.onConflict ?? "").split(",").map((k) => k.trim()).filter(Boolean);
        return api;
      },
      update(patch: any) { state.op = "update"; state.payload = patch; return api; },
      eq(k: string, v: any) { state.filters.push([k, v]); return api; },
      maybeSingle() { state.single = true; return api; },
      single() { state.single = true; return api; },
      then(onF: any, onR: any) {
        return Promise.resolve(run()).then(onF, onR);
      },
    };
    function match(row: any) {
      return state.filters.every(([k, v]: [string, any]) => row[k] === v);
    }
    function run() {
      const rows: any[] = store[state.table] ?? (store[state.table] = []);
      if (state.op === "select") {
        const found = rows.filter(match);
        return { data: state.single ? found[0] ?? null : found, error: null };
      }
      if (state.op === "insert") {
        const items = Array.isArray(state.payload) ? state.payload : [state.payload];
        rows.push(...items);
        return { data: null, error: null };
      }
      if (state.op === "upsert") {
        const items = Array.isArray(state.payload) ? state.payload : [state.payload];
        for (const item of items) {
          const keys: string[] = state.onConflict ?? [];
          const hit = keys.length
            ? rows.find((r: any) => keys.every((k) => r[k] === item[k]))
            : undefined;
          if (hit) Object.assign(hit, item);
          else rows.push(item);
        }
        return { data: null, error: null };
      }
      if (state.op === "update") {
        for (const r of rows.filter(match)) Object.assign(r, state.payload);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    return api;
  }
  return { from: (t: string) => builder(t) } as any;
}

describe("fulfillDeposit — webhook idempotency", () => {
  it("applies once and is a no-op on redelivery", async () => {
    const store: any = {
      payments: [],
      bookings: [
        {
          id: "b1",
          status: "pending_deposit",
          deposit_usd_cents: 22302,
          guide_id: "g1",
          start_date: "2026-10-01",
          end_date: "2026-10-14",
          enquiry_id: "e1",
        },
      ],
      availability: [],
      enquiries: [{ id: "e1", status: "accepted" }],
    };
    const admin = makeMock(store);

    const first = await fulfillDeposit(admin, "b1", "pi_123");
    expect(first.applied).toBe(true);
    expect(store.payments.length).toBe(1);
    expect(store.bookings[0].status).toBe("deposit_paid");
    expect(store.enquiries[0].status).toBe("converted");

    // Redelivery of the same PaymentIntent must not double-charge/advance.
    const second = await fulfillDeposit(admin, "b1", "pi_123");
    expect(second.applied).toBe(false);
    expect(store.payments.length).toBe(1);

    // A stray webhook with a DIFFERENT PaymentIntent on an already-paid booking
    // is also a no-op (status guard), so no second deposit is recorded.
    const stray = await fulfillDeposit(admin, "b1", "pi_other");
    expect(stray.applied).toBe(false);
    expect(store.payments.length).toBe(1);
  });
});
