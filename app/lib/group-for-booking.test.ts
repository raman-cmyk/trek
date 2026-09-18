import { describe, it, expect } from "vitest";
import { groupForBooking } from "./groups.server";

/**
 * A solo trek must not get a group page.
 *
 * This is here because of a boolean whose second half undid its first:
 * `party_size < 2 && !booking.enquiry_id`. Every booking carries an enquiry
 * — an enquiry is how a trek gets booked — so the guard never once stopped
 * anything, and ten people who booked a trek alone got a page inviting them
 * to "invite the others and split it here".
 *
 * The enquiry only ever mattered as a way to find a group that had asked for
 * the trip. So the three cases below are the whole rule: no group asked and
 * one seat sold, no page; a group asked, that group gets the booking however
 * many seats it was sold with; two or more seats, a page.
 */

type Row = Record<string, any>;

/** Enough of the Supabase client for these three paths, and no more. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const inserted: Record<string, Row[]> = {};
  const updated: Record<string, Row[]> = {};

  function from(table: string) {
    const rows = () => (tables[table] ??= []);
    const filters: [string, any][] = [];
    const matching = () =>
      rows().filter((r) => filters.every(([k, v]) => r[k] === v));

    const chain: any = {
      select: () => chain,
      eq: (k: string, v: any) => (filters.push([k, v]), chain),
      order: () => chain,
      maybeSingle: async () => ({ data: matching()[0] ?? null }),
      single: async () => ({ data: matching()[0] ?? null, error: null }),
      insert: (row: Row) => {
        const withId = { id: `${table}-${rows().length + 1}`, ...row };
        rows().push(withId);
        (inserted[table] ??= []).push(withId);
        // `.insert(...)` is sometimes awaited directly and sometimes followed
        // by `.select().single()`, so the return has to serve both.
        const after: any = {
          select: () => after,
          single: async () => ({ data: withId, error: null }),
          then: (res: any) => res({ data: withId, error: null }),
        };
        return after;
      },
      update: (patch: Row) => {
        const u: any = {
          eq: (k: string, v: any) => (filters.push([k, v]), u),
          neq: () => u,
          then: (res: any) => {
            for (const r of matching()) Object.assign(r, patch);
            (updated[table] ??= []).push(patch);
            return res({ data: null, error: null });
          },
        };
        return u;
      },
      then: (res: any) => res({ data: matching(), error: null }),
    };
    return chain;
  }

  return { admin: { from } as any, inserted, updated };
}

const SOLO = {
  id: "bk1",
  trekker_id: "u1",
  guide_id: "g1",
  offering_id: "o1",
  start_date: "2026-12-01",
  party_size: 1,
  status: "booked",
  enquiry_id: "enq1",
};

describe("groupForBooking", () => {
  it("makes no group for a solo trek, even though it came from an enquiry", async () => {
    const { admin, inserted } = fakeAdmin({
      bookings: [SOLO],
      trip_groups: [],
      offerings: [{ id: "o1", title: "Langtang Valley" }],
      users: [{ id: "u1", full_name: "Pratik" }],
    });

    expect(await groupForBooking(admin, "bk1")).toBeNull();
    expect(inserted.trip_groups).toBeUndefined();
    expect(inserted.trip_group_messages).toBeUndefined();
  });

  it("still links a solo booking to the group that asked for it", async () => {
    const { admin, inserted } = fakeAdmin({
      bookings: [SOLO],
      trip_groups: [
        { id: "grp1", slug: "our-trek-abcd", enquiry_id: "enq1", party_target: 4 },
      ],
      trip_group_members: [],
      offerings: [{ id: "o1", title: "Langtang Valley" }],
      users: [{ id: "u1", full_name: "Pratik" }],
    });

    expect(await groupForBooking(admin, "bk1")).toBe("our-trek-abcd");
    // The existing group took the booking; no second page was made.
    expect(inserted.trip_groups).toBeUndefined();
  });

  it("makes a group for a party of three", async () => {
    const { admin, inserted } = fakeAdmin({
      bookings: [{ ...SOLO, party_size: 3 }],
      trip_groups: [],
      trip_group_members: [],
      offerings: [{ id: "o1", title: "Langtang Valley" }],
      users: [{ id: "u1", full_name: "Pratik" }],
    });

    expect(await groupForBooking(admin, "bk1")).toMatch(/^langtang-valley-/);
    expect(inserted.trip_groups).toHaveLength(1);
    expect(inserted.trip_groups[0].party_target).toBe(3);
  });
});
