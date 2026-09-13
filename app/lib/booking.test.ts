import { describe, it, expect } from "vitest";
import { fulfillDeposit } from "./booking.server";

/**
 * Minimal in-memory Supabase mock — just enough of the query builder for
 * fulfillDeposit. Verifies webhook idempotency (a second delivery is a no-op).
 */
function makeMock(store: any) {
  function builder(table: string) {
    const state: any = {
      table,
      op: "select",
      filters: [] as [string, any][],
      negatives: [] as [string, any][],
      ins: [] as [string, any[]][],
      nulls: [] as [string, any][],
      unlikes: [] as [string, string, any][],
      limit: 0,
      single: false,
      payload: null,
    };
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
      // Groups follow their booking, and moving one on excludes the cancelled
      // ones — so the mock needs the negative filter too.
      neq(k: string, v: any) { state.negatives.push([k, v]); return api; },
      in(k: string, vs: any[]) { state.ins.push([k, vs]); return api; },
      // `.is(col, null)` — how the sweep finds bookings with no balance yet.
      is(k: string, v: any) { state.nulls.push([k, v]); return api; },
      // `.not(col, "like", "cancelled%")` — the cancel path's guard against
      // cancelling something already cancelled.
      not(k: string, op: string, v: any) {
        state.unlikes.push([k, op, v]);
        return api;
      },
      limit(n: number) { state.limit = n; return api; },
      maybeSingle() { state.single = true; return api; },
      single() { state.single = true; return api; },
      then(onF: any, onR: any) {
        return Promise.resolve(run()).then(onF, onR);
      },
    };
    function match(row: any) {
      return (
        state.filters.every(([k, v]: [string, any]) => row[k] === v) &&
        state.negatives.every(([k, v]: [string, any]) => row[k] !== v) &&
        state.ins.every(([k, vs]: [string, any[]]) => vs.includes(row[k])) &&
        state.nulls.every(([k, v]: [string, any]) =>
          v === null ? row[k] == null : row[k] === v,
        ) &&
        state.unlikes.every(([k, op, v]: [string, string, any]) => {
          if (op !== "like") return true;
          const re = new RegExp("^" + String(v).replace(/%/g, ".*") + "$");
          return !re.test(String(row[k] ?? ""));
        })
      );
    }
    function run() {
      const rows: any[] = store[state.table] ?? (store[state.table] = []);
      if (state.op === "select") {
        let found = rows.filter(match);
        if (state.limit) found = found.slice(0, state.limit);
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
        const hit = rows.filter(match);
        for (const r of hit) Object.assign(r, state.payload);
        // `update(...).select("id")` returns the rows it changed — which is
        // how the cancel path tells a real update from a lost race.
        return { data: state.single ? (hit[0] ?? null) : hit, error: null };
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

/**
 * The founder's bug, 2026-09-03: the same trek, the same dates, twice in My
 * trips and twice in the guide's list — and both acceptable.
 *
 * The duplicate ask is refused at the door and by an index now, but requests
 * sent before that are still sitting in guides' queues, so accept refuses them
 * too. These cases all return before `quote()` is reached, which is what keeps
 * the fixture small.
 */
describe("acceptEnquiry — one booking per trip per date", () => {
  const ENQ = {
    id: "e2",
    trekker_id: "t1",
    guide_id: "g1",
    offering_id: "o1",
    start_date: "2026-10-19",
    party_size: 2,
    status: "open",
  };

  it("refuses when that trekker already has this trip booked on that date", async () => {
    const store: any = {
      enquiries: [{ ...ENQ }],
      // From the first, already-accepted request — a different enquiry id.
      bookings: [
        {
          id: "b1",
          enquiry_id: "e1",
          trekker_id: "t1",
          offering_id: "o1",
          start_date: "2026-10-19",
          status: "pending_deposit",
        },
      ],
    };
    const { acceptEnquiry } = await import("./booking.server");
    expect(await acceptEnquiry(makeMock(store), "e2", "g1")).toBeNull();
    expect(store.bookings).toHaveLength(1);
  });

  it("still refuses a second booking out of the one request", async () => {
    const store: any = {
      enquiries: [{ ...ENQ }],
      bookings: [
        {
          id: "b1",
          enquiry_id: "e2",
          trekker_id: "t1",
          offering_id: "o1",
          start_date: "2026-10-19",
          status: "confirmed",
        },
      ],
    };
    const { acceptEnquiry } = await import("./booking.server");
    expect(await acceptEnquiry(makeMock(store), "e2", "g1")).toBeNull();
  });

  it("lets the trip be booked again after the first one was cancelled", async () => {
    const store: any = {
      enquiries: [{ ...ENQ }],
      bookings: [
        {
          id: "b1",
          enquiry_id: "e1",
          trekker_id: "t1",
          offering_id: "o1",
          start_date: "2026-10-19",
          status: "cancelled_guide",
        },
      ],
    };
    const { acceptEnquiry } = await import("./booking.server");
    // Past both guards, so it reaches pricing — which this fixture has no
    // offering for. Getting that far is the assertion: it was not refused.
    await expect(acceptEnquiry(makeMock(store), "e2", "g1")).rejects.toBeTruthy();
  });

  it("ignores another trekker's booking on the same trip and date", async () => {
    const store: any = {
      enquiries: [{ ...ENQ }],
      bookings: [
        {
          id: "b1",
          enquiry_id: "e1",
          trekker_id: "SOMEBODY-ELSE",
          offering_id: "o1",
          start_date: "2026-10-19",
          status: "confirmed",
        },
      ],
    };
    const { acceptEnquiry } = await import("./booking.server");
    // Not a duplicate — a clash, which is `clashingDays`' job further down.
    await expect(acceptEnquiry(makeMock(store), "e2", "g1")).rejects.toBeTruthy();
  });

  it("will not accept a request that is already accepted or declined", async () => {
    const { acceptEnquiry } = await import("./booking.server");
    for (const status of ["accepted", "converted", "declined", "expired", "withdrawn"]) {
      const store: any = { enquiries: [{ ...ENQ, status }], bookings: [] };
      expect(await acceptEnquiry(makeMock(store), "e2", "g1")).toBeNull();
    }
  });
});

/**
 * The founder's bug, 2026-09-08: a group paid for the whole trek in shares,
 * and the organiser was still asked for the full balance.
 *
 * The sweep charged `total − deposit` on the fourteenth day, arithmetic that
 * is right for one person paying alone and wrong for every group — the shares
 * are recorded against the same booking and it never looked at them. Inside
 * ten days the same blindness cancelled a paid-up trip for nonpayment.
 */
describe("runBalanceSweep — what is actually still owed", () => {
  const booking = (over: any = {}) => ({
    id: "b1",
    status: "deposit_paid",
    total_usd_cents: 5400,
    deposit_usd_cents: 1080,
    start_date: "2026-10-01",
    balance_paid_at: null,
    instalment_count: 1,
    ...over,
  });
  // Twelve days out: inside the charging window, outside the cancelling one.
  const TODAY = "2026-09-19";

  function stripeThatWouldCharge(log: number[]) {
    return {
      createDepositIntent: async ({ amountUsdCents }: any) => {
        log.push(amountUsdCents);
        return { paymentIntentId: "pi_x", clientSecret: "cs" };
      },
      retrievePaymentIntent: async () => ({ status: "succeeded" }),
    } as any;
  }

  it("charges nothing when the group has already paid in full", async () => {
    const store: any = {
      bookings: [booking()],
      payments: [
        { booking_id: "b1", type: "share", amount_usd_cents: 2700, status: "succeeded" },
        { booking_id: "b1", type: "share", amount_usd_cents: 2700, status: "succeeded" },
      ],
      instalments: [],
    };
    const charges: number[] = [];
    const { runBalanceSweep } = await import("./booking.server");
    const res = await runBalanceSweep(makeMock(store), stripeThatWouldCharge(charges), TODAY);

    expect(charges).toEqual([]);
    expect(res.charged).toBe(0);
    expect(res.settled).toBe(1);
    // And the booking moves on rather than sitting in deposit_paid forever.
    expect(store.bookings[0].status).toBe("docs_pending");
    expect(store.bookings[0].balance_paid_at).toBeTruthy();
  });

  it("charges only what is left when part has come in", async () => {
    const store: any = {
      bookings: [booking()],
      payments: [
        { booking_id: "b1", type: "deposit", amount_usd_cents: 1080, status: "succeeded" },
        { booking_id: "b1", type: "share", amount_usd_cents: 2700, status: "succeeded" },
      ],
      instalments: [],
    };
    const charges: number[] = [];
    const { runBalanceSweep } = await import("./booking.server");
    await runBalanceSweep(makeMock(store), stripeThatWouldCharge(charges), TODAY);
    // Not 5400 − 1080 = 4320, which is what the old arithmetic charged.
    expect(charges).toEqual([1620]);
  });

  it("charges the whole balance when only the deposit is in", async () => {
    const store: any = {
      bookings: [booking()],
      payments: [
        { booking_id: "b1", type: "deposit", amount_usd_cents: 1080, status: "succeeded" },
      ],
      instalments: [],
    };
    const charges: number[] = [];
    const { runBalanceSweep } = await import("./booking.server");
    await runBalanceSweep(makeMock(store), stripeThatWouldCharge(charges), TODAY);
    expect(charges).toEqual([4320]);
  });

  it("never cancels a paid-up trip for nonpayment", async () => {
    // Eight days out — inside the cancellation window. The old order checked
    // the date first, so a group that had paid everything lost its trip.
    const store: any = {
      bookings: [booking()],
      payments: [
        { booking_id: "b1", type: "share", amount_usd_cents: 5400, status: "succeeded" },
      ],
      instalments: [],
    };
    const charges: number[] = [];
    const { runBalanceSweep } = await import("./booking.server");
    const res = await runBalanceSweep(makeMock(store), stripeThatWouldCharge(charges), "2026-09-23");

    expect(res.cancelled).toBe(0);
    expect(res.settled).toBe(1);
    expect(store.bookings[0].status).toBe("docs_pending");
  });

  it("still cancels one that has genuinely not paid", async () => {
    const store: any = {
      bookings: [booking()],
      payments: [
        { booking_id: "b1", type: "deposit", amount_usd_cents: 1080, status: "succeeded" },
      ],
      instalments: [],
      availability: [],
      trip_groups: [],
    };
    const charges: number[] = [];
    const { runBalanceSweep } = await import("./booking.server");
    const res = await runBalanceSweep(makeMock(store), stripeThatWouldCharge(charges), "2026-09-23");
    expect(res.cancelled).toBe(1);
    expect(charges).toEqual([]);
  });
});
