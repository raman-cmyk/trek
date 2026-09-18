import { describe, it, expect } from "vitest";
import { byOwner, daysUntil, tripReadiness, type ReadinessInput } from "./trip-readiness";

/** Two people going, both named — the roster the permits are filed against. */
const PARTY = [
  { id: "t1", full_name: "Odonell Brian" },
  { id: "t2", full_name: "Ana Lima" },
];

/** Both of them have sent this, and the office has passed it. */
const bothSent = (type: string, verified_at: string | null = "2026-09-02") =>
  PARTY.map((t) => ({ type, traveller_id: t.id, verified_at }));

const TREK: ReadinessInput = {
  status: "deposit_paid",
  kind: "trek",
  startDate: "2026-12-01",
  partySize: 2,
  paidUp: false,
  outstandingUsdCents: 102774,
  paymentDueOn: "2026-11-17",
  documents: [],
  travellers: PARTY,
  permits: [],
  arrangements: [],
  guideAdvancePaid: false,
  todayIso: "2026-10-01",
};

const step = (r: ReturnType<typeof tripReadiness>, key: string) =>
  r.steps.find((s) => s.key === key)!;

describe("the steps a trip actually has", () => {
  it("gives a trek papers, permits and a TIMS card", () => {
    const keys = tripReadiness(TREK).steps.map((s) => s.key);
    expect(keys).toContain("passport");
    expect(keys).toContain("permits");
    expect(keys).toContain("tims");
  });

  it("gives a momo crawl none of them, and a meeting point instead", () => {
    const keys = tripReadiness({ ...TREK, kind: "food_culture" }).steps.map((s) => s.key);
    expect(keys).not.toContain("passport");
    expect(keys).not.toContain("permits");
    expect(keys).not.toContain("tims");
    expect(keys).toContain("meeting");
  });
});

describe("who has to move", () => {
  it("puts each step on exactly one of the three", () => {
    const r = tripReadiness(TREK);
    for (const s of r.steps) expect(["client", "guide", "office"]).toContain(s.owner);
    const split = byOwner(r);
    const counted = split.client.length + split.guide.length + split.office.length;
    expect(counted).toBe(r.outstanding.length);
  });

  it("does not chase the trekker for a passport before the deposit", () => {
    const r = tripReadiness({ ...TREK, status: "pending_deposit" });
    expect(step(r, "passport").state).toBe("blocked");
    expect(step(r, "passport").detail).toContain("deposit");
  });

  it("asks for it once money has moved", () => {
    expect(step(tripReadiness(TREK), "passport").state).toBe("open");
  });

  it("says a passport is uploaded but unchecked, which is the office's move", () => {
    const r = tripReadiness({ ...TREK, documents: bothSent("passport", null) });
    expect(step(r, "passport").detail).toContain("waiting for the office");
  });

  it("counts papers per person, not per booking", () => {
    // The whole point of the roster: one passport used to satisfy a party of
    // two, which is what confirmed bookings on one document (0099).
    const one = tripReadiness({
      ...TREK,
      documents: [{ type: "passport", traveller_id: "t1", verified_at: "2026-09-02" }],
    });
    expect(step(one, "passport").state).toBe("open");
    expect(step(one, "passport").detail).toContain("1 still to upload");

    const both = tripReadiness({ ...TREK, documents: bothSent("passport") });
    expect(step(both, "passport").state).toBe("done");
  });

  it("wants everybody named before it wants their papers", () => {
    const r = tripReadiness({ ...TREK, travellers: [PARTY[0]] });
    expect(step(r, "roster").state).toBe("open");
    expect(step(r, "roster").detail).toContain("1 of 2");
    // And a passport for the one person named is not the party's passports.
    expect(step(r, "passport").state).toBe("open");
  });

  it("does not count a rejected document as in", () => {
    const r = tripReadiness({
      ...TREK,
      documents: [
        { type: "passport", traveller_id: "t1", verified_at: null, rejected_at: "2026-09-01" },
      ],
    });
    expect(step(r, "passport").state).toBe("open");
  });

  it("does not count a replaced document as in either", () => {
    const r = tripReadiness({
      ...TREK,
      documents: [
        // Superseded by a clearer scan (0101) — not a refusal, but not the
        // document we hold either.
        { type: "passport", traveller_id: "t1", verified_at: "2026-09-01", superseded_at: "2026-09-05" },
        { type: "passport", traveller_id: "t2", verified_at: "2026-09-02" },
      ],
    });
    expect(step(r, "passport").detail).toContain("1 still to upload");
  });
});

describe("what is blocked on what", () => {
  it("cannot file permits without the passport", () => {
    expect(step(tripReadiness(TREK), "permits").state).toBe("blocked");
  });

  it("can once it is verified", () => {
    const r = tripReadiness({
      ...TREK,
      documents: bothSent("passport"),
    });
    expect(step(r, "permits").state).toBe("open");
  });

  it("leaves TIMS off a route that does not require one", () => {
    // Everest Base Camp and Gokyo Lakes have a park entry and a municipality
    // fee and no TIMS row (0102). The step used to appear anyway and could
    // never be anything but "waiting".
    const keys = tripReadiness({ ...TREK, routeNeedsTims: false }).steps.map((s) => s.key);
    expect(keys).not.toContain("tims");
    expect(keys).toContain("permits");
  });

  it("holds TIMS until insurance is verified — the 2026 rule", () => {
    expect(step(tripReadiness(TREK), "tims").state).toBe("blocked");
    const ok = tripReadiness({ ...TREK, insuranceVerifiedAt: "2026-09-03" });
    expect(step(ok, "tims").state).toBe("open");
  });
});

describe("overdue is louder than open", () => {
  it("marks a payment whose date has gone", () => {
    const r = tripReadiness({ ...TREK, todayIso: "2026-11-20" });
    expect(step(r, "paid").state).toBe("overdue");
    expect(r.overdue.map((s) => s.key)).toContain("paid");
  });

  it("marks a REJECTED permit overdue whatever the calendar says", () => {
    const r = tripReadiness({
      ...TREK,
      documents: bothSent("passport"),
      permits: [{ status: "ready" }, { status: "rejected" }],
    });
    expect(step(r, "permits").state).toBe("overdue");
    expect(step(r, "permits").detail).toContain("rejected");
  });

  it("works the list worst-first: overdue, then open, then blocked", () => {
    const r = tripReadiness({ ...TREK, todayIso: "2026-11-20" });
    const states = r.outstanding.map((s) => s.state);
    expect(states).toEqual([...states].sort((a, b) =>
      (a === "overdue" ? 0 : a === "open" ? 1 : 2) - (b === "overdue" ? 0 : b === "open" ? 1 : 2),
    ));
    expect(states[0]).toBe("overdue");
  });
});

describe("gear, hotels and transport", () => {
  const withArr = (arrangements: ReadinessInput["arrangements"]) =>
    step(tripReadiness({ ...TREK, arrangements }), "arrangements");

  it("is one step, not eight rows saying the same thing", () => {
    const r = tripReadiness({
      ...TREK,
      arrangements: [
        { status: "to_book", title: "Jeep" },
        { status: "to_book", title: "Hotel" },
        { status: "booked", title: "Down jacket" },
      ],
    });
    expect(r.steps.filter((s) => s.key === "arrangements")).toHaveLength(1);
    expect(step(r, "arrangements").detail).toContain("2 still to book");
  });

  it("is done when everything is booked and paid", () => {
    expect(withArr([{ status: "paid", title: "Jeep" }]).state).toBe("done");
  });

  it("goes overdue when a vendor should already have been paid", () => {
    const s = withArr([
      { status: "booked", title: "Buddha Air, Lukla", due_on: "2026-09-20" },
    ]);
    expect(s.state).toBe("overdue");
    expect(s.detail).toContain("Buddha Air");
  });

  it("ignores a cancelled arrangement entirely", () => {
    const r = tripReadiness({ ...TREK, arrangements: [{ status: "cancelled", title: "Jeep" }] });
    expect(r.steps.map((s) => s.key)).not.toContain("arrangements");
  });

  it("does not appear at all when nothing has been added", () => {
    expect(tripReadiness(TREK).steps.map((s) => s.key)).not.toContain("arrangements");
  });
});

describe("the bar", () => {
  it("counts blocked as not done — it is not progress", () => {
    // No roster yet either: the lead traveller is seeded when the deposit
    // lands, not when somebody clicks book.
    const r = tripReadiness({ ...TREK, status: "pending_deposit", travellers: [] });
    expect(r.percent).toBeLessThan(50);
    expect(r.doneCount).toBe(0);
  });

  it("reaches 100 when every step is done", () => {
    const r = tripReadiness({
      ...TREK,
      paidUp: true,
      outstandingUsdCents: 0,
      documents: [...bothSent("passport"), ...bothSent("insurance")],
      insuranceVerifiedAt: "2026-09-02",
      permits: [{ status: "ready" }],
      timsStatus: "issued",
      contractStatus: "signed",
      arrangements: [{ status: "paid", title: "Jeep" }],
    });
    expect(r.percent).toBe(100);
    expect(r.outstanding).toEqual([]);
  });

  it("stops chasing a cancelled trip", () => {
    const r = tripReadiness({ ...TREK, status: "cancelled_trekker", todayIso: "2026-11-20" });
    expect(r.outstanding).toEqual([]);
    expect(r.overdue).toEqual([]);
  });
});

describe("daysUntil", () => {
  it("counts forward and backward from a date", () => {
    expect(daysUntil("2026-10-05", "2026-10-01")).toBe(4);
    expect(daysUntil("2026-09-28", "2026-10-01")).toBe(-3);
    expect(daysUntil(null, "2026-10-01")).toBeNull();
  });
});
