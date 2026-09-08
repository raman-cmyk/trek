import { describe, expect, it } from "vitest";
import {
  collected,
  depositIsCovered,
  depositShares,
  shareState,
  stillOwing,
} from "./group-pay";
import type { GroupMember } from "./groups";

const member = (over: Partial<GroupMember> = {}): GroupMember => ({
  id: Math.random().toString(36).slice(2),
  user_id: "u",
  invited_email: null,
  display_name: "Somebody",
  role: "member",
  status: "joined",
  share_usd_cents: 0,
  paid_usd_cents: 0,
  ...over,
});

const three = [
  member({ id: "a", user_id: "org", display_name: "Raman", role: "organiser" }),
  member({ id: "b", user_id: "u2", display_name: "Mia" }),
  member({ id: "c", user_id: "u3", display_name: "Yuki" }),
];

describe("depositShares", () => {
  it("splits the deposit so the parts add back to the whole", () => {
    const s = depositShares(10_000, three, "split", "org");
    expect([...s.values()].reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it("gives the odd cent to the earliest members, deterministically", () => {
    const s = depositShares(1000, three, "split", "org");
    expect(s.get("a")).toBe(334);
    expect(s.get("b")).toBe(333);
    expect(s.get("c")).toBe(333);
    // Same roster, same answer, every time.
    expect(depositShares(1000, three, "split", "org").get("a")).toBe(334);
  });

  it("puts the whole deposit on the organiser in organiser mode", () => {
    const s = depositShares(9_000, three, "organiser", "org");
    expect(s.get("a")).toBe(9_000);
    expect(s.get("b")).toBe(0);
  });

  it("ignores people who left or were removed", () => {
    const roster = [...three, member({ id: "d", status: "declined", display_name: "Gone" })];
    const s = depositShares(900, roster, "split", "org");
    expect(s.get("d")).toBe(0);
    expect(s.get("a")).toBe(300);
  });

  it("does not fall over on an empty roster", () => {
    expect([...depositShares(500, [], "split", "org").values()]).toEqual([]);
  });
});

describe("collected / depositIsCovered", () => {
  const paid = (n: number) => ({ type: "share", amount_usd_cents: n, status: "succeeded" });

  it("adds up what has actually landed, whoever paid it", () => {
    expect(collected([paid(300), paid(300), paid(400)])).toBe(1000);
  });

  it("ignores pending money and refunds", () => {
    expect(
      collected([
        paid(300),
        { type: "share", amount_usd_cents: 300, status: "pending" },
        { type: "refund", amount_usd_cents: -100, status: "succeeded" },
      ]),
    ).toBe(300);
  });

  it("only covers the deposit when the shares add up to it", () => {
    expect(depositIsCovered([paid(300), paid(300)], 1000)).toBe(false);
    expect(depositIsCovered([paid(300), paid(300), paid(400)], 1000)).toBe(true);
    // A booking with no deposit is not "covered" by nothing.
    expect(depositIsCovered([], 0)).toBe(false);
  });
});

describe("shareState", () => {
  it("separates what is due today from the whole trip", () => {
    const s = shareState(member({ share_usd_cents: 50_000, paid_usd_cents: 0 }), 10_000);
    expect(s.dueUsdCents).toBe(10_000);
    expect(s.outstandingUsdCents).toBe(10_000);
    expect(s.tripShareUsdCents).toBe(50_000);
  });

  it("counts what they already put in", () => {
    const s = shareState(member({ paid_usd_cents: 4_000 }), 10_000);
    expect(s.outstandingUsdCents).toBe(6_000);
  });

  it("never asks for a negative amount", () => {
    expect(shareState(member({ paid_usd_cents: 99_000 }), 10_000).outstandingUsdCents).toBe(0);
    expect(shareState(null, 500).outstandingUsdCents).toBe(500);
  });
});

describe("stillOwing", () => {
  it("names the people the group is waiting for", () => {
    const roster = [
      member({ id: "a", display_name: "Raman", paid_usd_cents: 334 }),
      member({ id: "b", display_name: "Mia", paid_usd_cents: 0 }),
      member({ id: "c", display_name: "Yuki", paid_usd_cents: 333 }),
    ];
    const shares = depositShares(1000, roster, "split", "org");
    expect(stillOwing(roster, shares).map((m) => m.display_name)).toEqual(["Mia"]);
  });

  it("is empty when everyone is square", () => {
    const roster = [member({ id: "a", paid_usd_cents: 500 }), member({ id: "b", paid_usd_cents: 500 })];
    expect(stillOwing(roster, depositShares(1000, roster, "split", "org"))).toEqual([]);
  });
});
