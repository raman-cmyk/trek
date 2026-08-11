import { describe, expect, it } from "vitest";
import {
  assignShares,
  blockedFromBooking,
  groupMoney,
  groupSlug,
  slugTail,
  splitEvenly,
  type GroupMember,
  type TripGroup,
} from "./groups";

const member = (over: Partial<GroupMember> & { id: string }): GroupMember => ({
  user_id: over.id,
  invited_email: null,
  display_name: over.id,
  role: "member",
  status: "joined",
  share_usd_cents: 0,
  paid_usd_cents: 0,
  ...over,
});

describe("splitEvenly", () => {
  it("sums back to the total exactly", () => {
    for (const [total, n] of [
      [100000, 3],
      [99999, 7],
      [1, 4],
      [250033, 6],
    ] as const) {
      const parts = splitEvenly(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("puts the remainder on the earliest members, one cent each", () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitEvenly(10, 4)).toEqual([3, 3, 2, 2]);
  });

  it("handles the degenerate cases without throwing", () => {
    expect(splitEvenly(500, 0)).toEqual([]);
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
  });
});

describe("assignShares", () => {
  const members = [
    member({ id: "a", role: "organiser" }),
    member({ id: "b" }),
    member({ id: "c" }),
  ];

  it("splits across everyone in split mode", () => {
    const shares = assignShares(members, 100000, "split", "a");
    expect([...shares.values()]).toEqual([33334, 33333, 33333]);
  });

  it("puts the whole trip on the organiser in organiser mode", () => {
    const shares = assignShares(members, 100000, "organiser", "a");
    expect(shares.get("a")).toBe(100000);
    expect(shares.get("b")).toBe(0);
    expect(shares.get("c")).toBe(0);
  });

  it("ignores members who declined", () => {
    const withDrop = [...members, member({ id: "d", status: "declined" })];
    const shares = assignShares(withDrop, 90000, "split", "a");
    expect(shares.get("d")).toBe(0);
    expect(shares.get("a")).toBe(30000);
  });
});

describe("groupMoney", () => {
  it("reports outstanding and who still owes", () => {
    const m = groupMoney([
      member({ id: "a", share_usd_cents: 30000, paid_usd_cents: 30000 }),
      member({ id: "b", share_usd_cents: 30000, paid_usd_cents: 10000 }),
      member({ id: "c", share_usd_cents: 30000, paid_usd_cents: 0 }),
    ]);
    expect(m.totalUsdCents).toBe(90000);
    expect(m.paidUsdCents).toBe(40000);
    expect(m.outstandingUsdCents).toBe(50000);
    expect(m.owing.map((x) => x.id)).toEqual(["b", "c"]);
    expect(m.everyoneIn).toBe(false);
  });

  it("never shows more than 100% collected when someone overpays", () => {
    const m = groupMoney([
      member({ id: "a", share_usd_cents: 100, paid_usd_cents: 500 }),
      member({ id: "b", share_usd_cents: 100, paid_usd_cents: 100 }),
    ]);
    expect(m.progress).toBe(1);
    expect(m.paidUsdCents).toBe(200);
  });
});

describe("blockedFromBooking", () => {
  const group: TripGroup = {
    id: "g",
    slug: "manaslu-abc",
    name: "Manaslu with the lads",
    organiser_id: "a",
    offering_id: "o",
    guide_id: "gu",
    start_date: "2026-10-12",
    party_target: 3,
    payment_mode: "split",
    status: "forming",
    booking_id: null,
    note: null,
  };
  const paid = [
    member({ id: "a", role: "organiser", share_usd_cents: 100, paid_usd_cents: 100 }),
    member({ id: "b", share_usd_cents: 100, paid_usd_cents: 100 }),
  ];

  it("clears when everyone has joined and paid", () => {
    expect(blockedFromBooking(group, paid)).toBeNull();
  });

  it("names what is missing", () => {
    expect(blockedFromBooking({ ...group, offering_id: null }, paid)).toContain("trip");
    expect(blockedFromBooking({ ...group, start_date: null }, paid)).toContain("start date");
    expect(blockedFromBooking(group, [])).toContain("Nobody");
  });

  it("counts people who have not accepted yet", () => {
    const pending = [paid[0], { ...paid[1], status: "invited" as const }];
    expect(blockedFromBooking(group, pending)).toBe("Waiting on 1 person to accept.");
  });

  it("counts unpaid shares, and says it differently when one person pays", () => {
    const owing = [paid[0], { ...paid[1], paid_usd_cents: 0 }];
    expect(blockedFromBooking(group, owing)).toBe("Waiting on 1 share.");
    expect(blockedFromBooking({ ...group, payment_mode: "organiser" }, owing)).toBe(
      "Waiting on the deposit.",
    );
  });

  it("refuses a group that is already booked or cancelled", () => {
    expect(blockedFromBooking({ ...group, status: "booked" }, paid)).toContain("already");
    expect(blockedFromBooking({ ...group, status: "cancelled" }, paid)).toContain("cancelled");
  });
});

describe("groupSlug", () => {
  it("keeps the trip readable and adds an unguessable tail", () => {
    const tail = slugTail(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(groupSlug("Manaslu with the lads", tail)).toBe(`manaslu-with-the-lads-${tail}`);
    expect(tail).toHaveLength(8);
    expect(tail).not.toMatch(/[aeiou]/);
  });

  it("survives a name that is all punctuation", () => {
    expect(groupSlug("!!!", "abc")).toBe("trip-abc");
  });
});
