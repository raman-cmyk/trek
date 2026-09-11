import { describe, expect, it } from "vitest";
import {
  assignShares,
  blockedFromAsking,
  blockedFromBooking,
  groupHeading,
  groupMoney,
  groupStep,
  guideHasAgreed,
  membersWithoutAccounts,
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

describe("the order a group actually happens in", () => {
  const base: TripGroup = {
    id: "g",
    slug: "manaslu-abc",
    name: "Manaslu with the lads",
    organiser_id: "a",
    offering_id: "o",
    guide_id: "gu",
    start_date: "2099-10-12",
    party_target: 2,
    payment_mode: "split",
    status: "forming",
    booking_id: null,
    note: null,
  };
  const roster = [
    member({ id: "a", role: "organiser" }),
    member({ id: "b" }),
  ];

  it("asks the guide before the roster or the money", () => {
    // The old gate wanted every share paid before the organiser could ask —
    // and a share is paid into a booking that does not exist until the guide
    // says yes, so the sequence could not be walked at all.
    expect(blockedFromAsking(base, [roster[0]])).toBeNull();
  });

  it("says what is still missing before it can be asked", () => {
    expect(blockedFromAsking({ ...base, offering_id: null }, roster)).toContain("trip");
    expect(blockedFromAsking({ ...base, start_date: null }, roster)).toContain("start date");
    expect(blockedFromAsking({ ...base, start_date: "2020-01-01" }, roster)).toContain("future");
    expect(blockedFromAsking({ ...base, status: "requested" }, roster)).toContain("waiting");
  });

  it("walks plan → asking → roster → paying → done", () => {
    expect(groupStep(base, roster)).toBe("plan");
    expect(groupStep({ ...base, status: "requested" }, roster)).toBe("asking");

    const agreed = { ...base, status: "accepted" as const, guide_accepted_at: "2026-09-01T00:00:00Z" };
    expect(groupStep(agreed, [roster[0]])).toBe("roster");
    expect(groupStep(agreed, roster)).toBe("paying");
    expect(groupStep({ ...agreed, status: "booked" }, roster)).toBe("done");
  });

  it("knows the guide has agreed once a booking exists, however it got there", () => {
    expect(guideHasAgreed(base)).toBe(false);
    expect(guideHasAgreed({ ...base, booking_id: "b1" })).toBe(true);
    expect(guideHasAgreed({ ...base, guide_accepted_at: "2026-09-01T00:00:00Z" })).toBe(true);
  });

  it("finds the people who were invited and never signed in", () => {
    const ghosts = membersWithoutAccounts([
      roster[0],
      { ...roster[1], user_id: null },
      { ...roster[1], id: "c", user_id: null, status: "removed" as const },
    ]);
    // The removed one does not count — they are not going.
    expect(ghosts).toHaveLength(1);
  });
});

describe("blockedFromBooking", () => {
  // A group the guide has already taken: everything after the guide's yes is
  // what this gate is about, and until 0065 it was asked about first.
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
    status: "accepted",
    booking_id: null,
    note: null,
    guide_accepted_at: "2026-09-01T00:00:00Z",
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

  it("wants the guide's yes before anything is asked of anybody", () => {
    const unasked = { ...group, status: "forming" as const, guide_accepted_at: null };
    expect(blockedFromBooking(unasked, paid)).toBe("Ask the guide first.");
    expect(blockedFromBooking({ ...unasked, status: "requested" }, paid)).toBe(
      "Waiting on the guide to accept.",
    );
    // A booking is the guide's yes in its strongest form.
    expect(blockedFromBooking({ ...unasked, booking_id: "b1" }, paid)).toBeNull();
  });

  it("will not go with somebody who has never signed in", () => {
    const ghost = [paid[0], { ...paid[1], user_id: null, display_name: "Yuki" }];
    expect(blockedFromBooking(group, ghost)).toContain("Yuki has not signed in");
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

describe("groupMoney on a booked trip", () => {
  const one = [member({ id: "a", role: "organiser", share_usd_cents: 3240, paid_usd_cents: 0 })];

  it("prices off the booking, not the shares that happen to exist", () => {
    const m = groupMoney(one, 12960, 4);
    expect(m.totalUsdCents).toBe(12960);
    expect(m.unclaimedSeats).toBe(3);
    expect(m.everyoneIn).toBe(false);
  });

  it("is not 'everyone in' while seats are unclaimed, even if the members paid", () => {
    const paid = [{ ...one[0], paid_usd_cents: 3240 }];
    expect(groupMoney(paid, 12960, 4).everyoneIn).toBe(false);
    expect(groupMoney(paid, 3240, 1).everyoneIn).toBe(true);
  });

  it("falls back to the share sum when there is no booking", () => {
    expect(groupMoney(one).totalUsdCents).toBe(3240);
    expect(groupMoney(one).unclaimedSeats).toBe(0);
  });
});

describe("groupHeading", () => {
  it("leads with the trek, not whose trip it is", () => {
    // The founder's screenshot: "Odonell's trip" as the headline with
    // "Everest Trek" in grey underneath, so the list was unsearchable by eye.
    expect(groupHeading({ name: "Odonell's trip", offeringTitle: "Everest Trek" })).toEqual({
      title: "Everest Trek",
      sub: "Odonell's trip",
    });
  });

  it("does not say the same thing twice", () => {
    // Groups created when a guide accepts are named after the offering, so
    // the card printed the trek as both lines.
    expect(
      groupHeading({
        name: "Patan Durbar Square heritage walk",
        offeringTitle: "Patan Durbar Square heritage walk",
      }),
    ).toEqual({ title: "Patan Durbar Square heritage walk", sub: null });
  });

  it("treats punctuation and case as noise when comparing", () => {
    expect(groupHeading({ name: "Kathmandu Momo Crawl!", offeringTitle: "Kathmandu momo crawl" }).sub)
      .toBeNull();
    expect(groupHeading({ name: "Everest  trek", offeringTitle: "Everest trek" }).sub).toBeNull();
  });

  it("falls back to the group's own name before a trek is picked", () => {
    // What to say about the absent trek belongs to the page, not here: the
    // list says "No trek picked yet", the group's page offers the guide.
    expect(groupHeading({ name: "Odonell's trip", offeringTitle: null })).toEqual({
      title: "Odonell's trip",
      sub: null,
    });
  });

  it("is never nameless", () => {
    expect(groupHeading({}).title).toBe("Trip");
    expect(groupHeading({ name: "   ", offeringTitle: "  " }).title).toBe("Trip");
  });

  it("drops an empty group name rather than printing a blank line", () => {
    expect(groupHeading({ name: "", offeringTitle: "Everest Trek" })).toEqual({
      title: "Everest Trek",
      sub: null,
    });
  });
});
