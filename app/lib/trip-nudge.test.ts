import { describe, expect, it } from "vitest";
import { NUDGEABLE, isClientTodo, nextNudge } from "./trip-nudge";
import { tripReadiness, type ReadinessInput } from "./trip-readiness";

const BASE: ReadinessInput = {
  status: "confirmed",
  kind: "trek",
  startDate: "2026-11-01",
  partySize: 2,
  paidUp: true,
  outstandingUsdCents: 0,
  paymentDueOn: null,
  documents: [],
  travellers: [],
  insuranceVerifiedAt: null,
  insuranceAttestedAt: null,
  permits: [],
  timsStatus: null,
  routeNeedsTims: false,
  contractStatus: null,
  meetingPoint: null,
  arrangements: [],
  guideAdvancePaid: false,
  todayIso: "2026-09-19",
};

const at = (over: Partial<ReadinessInput>) => tripReadiness({ ...BASE, ...over });

describe("nextNudge", () => {
  it("asks for the documents the moment the deposit is in", () => {
    // The founder's own example: "after the deposit is paid, a notification
    // saying 'document needed' needs to appear for the client."
    const n = nextNudge(at({}), "b1")!;
    expect(n.title).toContain("name");
    expect(n.href).toBe("/trips/b1");
  });

  it("asks for money first while money is outstanding", () => {
    const n = nextNudge(
      at({ paidUp: false, outstandingUsdCents: 128468, paymentDueOn: "2026-10-01" }),
      "b1",
    )!;
    expect(n.kind).toBe("todo_paid");
    // Straight to the page that takes it, not to the trip page.
    expect(n.href).toBe("/checkout/b1");
  });

  it("moves on to passports once everyone is named", () => {
    const n = nextNudge(
      at({ travellers: [{ id: "t1", full_name: "A" }, { id: "t2", full_name: "B" }] }),
      "b1",
    )!;
    expect(n.kind).toBe("todo_passport");
    expect(n.body).toContain("picture page");
  });

  it("then the insurance certificate, and then goes quiet", () => {
    const named = [{ id: "t1", full_name: "A" }, { id: "t2", full_name: "B" }];
    const passports = named.map((t) => ({
      type: "passport",
      traveller_id: t.id,
      verified_at: "2026-09-10",
    }));
    const n = nextNudge(at({ travellers: named, documents: passports }), "b1")!;
    expect(n.kind).toBe("todo_insurance");

    const certs = named.map((t) => ({
      type: "insurance",
      traveller_id: t.id,
      verified_at: "2026-09-10",
    }));
    expect(
      nextNudge(
        at({
          travellers: named,
          documents: [...passports, ...certs],
          insuranceVerifiedAt: "2026-09-11",
        }),
        "b1",
      ),
    ).toBeNull();
  });

  it("says nothing about a step that is not the trekker's yet", () => {
    // Papers are blocked until money has moved. Chasing somebody for a
    // passport on a trip they have not paid a deposit on is the thing
    // tripReadiness's "blocked" state exists to prevent — and a notification
    // is the loudest possible way to do it.
    const r = at({ status: "pending_deposit", paidUp: false, outstandingUsdCents: 50000 });
    expect(r.steps.find((s) => s.key === "passport")?.state).toBe("blocked");
    expect(nextNudge(r, "b1")!.kind).toBe("todo_paid");
  });

  it("never nudges about somebody else's step", () => {
    // The guide's contract and the office's permits are on the same list and
    // are none of the trekker's business.
    for (const key of NUDGEABLE) {
      expect(["paid", "roster", "passport", "insurance"]).toContain(key);
    }
    const r = at({
      travellers: [{ id: "t1", full_name: "A" }, { id: "t2", full_name: "B" }],
      documents: [
        { type: "passport", traveller_id: "t1", verified_at: "2026-09-10" },
        { type: "passport", traveller_id: "t2", verified_at: "2026-09-10" },
        { type: "insurance", traveller_id: "t1", verified_at: "2026-09-10" },
        { type: "insurance", traveller_id: "t2", verified_at: "2026-09-10" },
      ],
      insuranceVerifiedAt: "2026-09-11",
    });
    // Permits and the contract are still open; the trekker hears nothing.
    expect(r.outstanding.some((s) => s.owner !== "client")).toBe(true);
    expect(nextNudge(r, "b1")).toBeNull();
  });

  it("lets an overdue step jump the queue and says so", () => {
    const n = nextNudge(
      at({ paidUp: false, outstandingUsdCents: 1000, paymentDueOn: "2026-09-01" }),
      "b1",
    )!;
    expect(n.title).toContain("overdue");
  });

  it("is one nudge, not four", () => {
    // A bell that fires four times the moment a deposit clears is a bell
    // somebody turns off.
    const r = at({});
    expect(r.steps.filter(isClientTodo).length).toBeGreaterThan(1);
    expect(nextNudge(r, "b1")).not.toBeNull();
  });

  it("has nothing to say about a day trip that collects no papers", () => {
    expect(nextNudge(at({ kind: "food_culture" }), "b1")).toBeNull();
  });

  it("gives each step its own kind, so the same nudge is never sent twice", () => {
    const named = [{ id: "t1", full_name: "A" }, { id: "t2", full_name: "B" }];
    const kinds = new Set(
      [
        nextNudge(at({ paidUp: false, outstandingUsdCents: 100 }), "b1"),
        nextNudge(at({}), "b1"),
        nextNudge(at({ travellers: named }), "b1"),
      ].map((n) => n!.kind),
    );
    expect(kinds.size).toBe(3);
  });
});
