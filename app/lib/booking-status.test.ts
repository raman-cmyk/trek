import { describe, it, expect } from "vitest";
import {
  deriveBookingStatus,
  isCancelled,
  moveProblem,
  type StatusFacts,
} from "./booking-status";

const TREK: StatusFacts = {
  current: "deposit_paid",
  startDate: "2026-11-01",
  endDate: "2026-11-14",
  depositPaid: true,
  outstandingUsdCents: 80000,
  documentsComplete: false,
  needsDocuments: true,
  todayIso: "2026-09-18",
};

const ready = (over: Partial<StatusFacts> = {}): StatusFacts => ({
  ...TREK,
  outstandingUsdCents: 0,
  documentsComplete: true,
  ...over,
});

describe("what the facts say", () => {
  it("is pending until a deposit exists", () => {
    expect(deriveBookingStatus({ ...TREK, depositPaid: false })).toBe("pending_deposit");
  });

  it("is docs_pending once money has moved and the papers have not", () => {
    expect(deriveBookingStatus(TREK)).toBe("docs_pending");
  });

  it("never walks a trek backwards down the board", () => {
    // pending_deposit(0) → deposit_paid(1) → docs_pending(2) → confirmed(3).
    // A trek goes straight from 0 to 2 and stays there; what it must never do
    // is reach 2 and then report 1.
    const path = [
      deriveBookingStatus({ ...TREK, depositPaid: false }),
      deriveBookingStatus(TREK),
      deriveBookingStatus(ready({ outstandingUsdCents: 1 })),
      deriveBookingStatus(ready()),
    ];
    const rank = ["pending_deposit", "deposit_paid", "docs_pending", "confirmed"];
    const ranks = path.map((s) => rank.indexOf(s));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("is deposit_paid on something that needs no documents at all", () => {
    // A momo crawl. There is nothing to collect, so it should not sit in a
    // column called "waiting for documents" for ever.
    expect(
      deriveBookingStatus({ ...TREK, needsDocuments: false, outstandingUsdCents: 5000 }),
    ).toBe("deposit_paid");
  });

  it("is confirmed when the papers are in and nothing is owed", () => {
    expect(deriveBookingStatus(ready())).toBe("confirmed");
  });

  it("is not confirmed on papers alone while money is owed", () => {
    // Stays in docs_pending rather than dropping back to deposit_paid, which
    // sits EARLIER on the board — a status that walks a card backwards is
    // worse than one that is slightly early.
    expect(deriveBookingStatus(ready({ outstandingUsdCents: 1 }))).toBe("docs_pending");
  });

  it("THE BUG: is active while they are actually on the trail", () => {
    // Nothing writes `active` today except a drag on the ops board, so a trek
    // walking right now sits in whatever column somebody last left it in.
    expect(deriveBookingStatus(ready({ todayIso: "2026-11-05" }))).toBe("active");
    expect(deriveBookingStatus(ready({ todayIso: "2026-11-01" }))).toBe("active");
    expect(deriveBookingStatus(ready({ todayIso: "2026-11-14" }))).toBe("active");
  });

  it("is completed the day after the last day", () => {
    expect(deriveBookingStatus(ready({ todayIso: "2026-11-15" }))).toBe("completed");
  });

  it("does not complete a trek nobody paid for just because its date went by", () => {
    const abandoned = { ...TREK, depositPaid: false, todayIso: "2026-11-15" };
    expect(deriveBookingStatus(abandoned)).toBe("pending_deposit");
  });

  it("completes one the office closed out even if the paperwork never finished", () => {
    expect(
      deriveBookingStatus({ ...TREK, closedOut: true, todayIso: "2026-11-15" }),
    ).toBe("completed");
  });

  it("leaves a cancelled trip cancelled, whatever the calendar says", () => {
    for (const s of ["cancelled_trekker", "cancelled_guide", "cancelled_force_majeure"]) {
      expect(deriveBookingStatus({ ...ready(), current: s, todayIso: "2027-01-01" })).toBe(s);
    }
  });

  it("has no opinion about dates it does not have", () => {
    expect(deriveBookingStatus(ready({ startDate: null, endDate: null }))).toBe("confirmed");
  });
});

describe("dragging a card on the board", () => {
  it("allows the move the facts already agree with", () => {
    expect(moveProblem("confirmed", ready())).toBeNull();
  });

  it("allows putting a card back, because that is how a mistake is undone", () => {
    expect(moveProblem("deposit_paid", ready())).toBeNull();
  });

  it("THE BUG: refuses a jump the facts do not support, unless somebody says why", () => {
    // The action writes String(form.get("next")) with no whitelist; the only
    // bound today is the check constraint, so pending_deposit → completed is
    // one drag away.
    const p = moveProblem("completed", { ...TREK, depositPaid: false });
    expect(p).toContain("say why");
    expect(moveProblem("completed", { ...TREK, depositPaid: false }, "Paid in cash in Thamel.")).toBeNull();
  });

  it("will not take a status that is not one", () => {
    expect(moveProblem("finished", ready())).toContain("not a status");
  });

  it("sends a cancellation to the page that works out the refund", () => {
    expect(moveProblem("cancelled_trekker", ready())).toContain("refund");
  });

  it("will not drag a cancelled trip back onto the board", () => {
    expect(moveProblem("confirmed", { ...ready(), current: "cancelled_guide" })).toContain(
      "cancelled",
    );
  });
});

describe("isCancelled", () => {
  it("catches all three, and nothing else", () => {
    expect(isCancelled("cancelled_force_majeure")).toBe(true);
    expect(isCancelled("completed")).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });
});

describe("the sweep only moves a trip on", () => {
  // `applyBookingStatus({forwardOnly}) uses this ordering; the rule itself is
  // the one the board draws.
  const RANK = ["pending_deposit", "deposit_paid", "docs_pending", "confirmed", "active", "completed"];
  const rank = (s: string) => RANK.indexOf(s);

  it("moves a confirmed trek to active on its first morning", () => {
    const before = "confirmed";
    const after = deriveBookingStatus(ready({ todayIso: "2026-11-02" }));
    expect(rank(after)).toBeGreaterThan(rank(before));
  });

  it("would walk a confirmed trip back when its papers stop being complete", () => {
    // Which is right — but it belongs to the event that caused it, not to a
    // nightly sweep re-litigating every confirmation in the database.
    const after = deriveBookingStatus(ready({ current: "confirmed", documentsComplete: false }));
    expect(rank(after)).toBeLessThan(rank("confirmed"));
  });
});
