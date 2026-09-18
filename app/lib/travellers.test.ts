import { describe, it, expect } from "vitest";
import {
  documentsComplete,
  missingDocs,
  owedSummary,
  rosterComplete,
  rosterProblems,
  type Traveller,
  type TravellerDoc,
} from "./travellers";

const lead: Traveller = { id: "t1", full_name: "Odonell Brian", is_lead: true };
const second: Traveller = { id: "t2", full_name: "Ana Lima", is_lead: false };

const doc = (
  traveller_id: string,
  type: string,
  state: "verified" | "pending" | "rejected",
): TravellerDoc => ({
  traveller_id,
  type,
  verified_at: state === "verified" ? "2026-09-01T00:00:00Z" : null,
  rejected_at: state === "rejected" ? "2026-09-01T00:00:00Z" : null,
  rejected_reason: state === "rejected" ? "Too blurry to read." : null,
});

const bothVerified = (t: Traveller) => [
  doc(t.id, "passport", "verified"),
  doc(t.id, "insurance", "verified"),
];

describe("the roster", () => {
  it("is happy with one named lead for a solo trip", () => {
    expect(rosterProblems([lead], 1)).toEqual([]);
    expect(rosterComplete([lead], 1)).toBe(true);
  });

  it("counts out loud how many names are still missing", () => {
    expect(rosterProblems([lead], 2)[0].message).toContain("One more name");
    expect(rosterProblems([lead], 4)[0].message).toContain("3 more names");
  });

  it("says so when there are more names than the trip was booked for", () => {
    const p = rosterProblems([lead, second], 1);
    expect(p[0].message).toContain("booked for 1");
  });

  it("wants exactly one lead — somebody to call first", () => {
    expect(
      rosterProblems([{ ...lead, is_lead: false }], 1).map((p) => p.field),
    ).toContain("is_lead");
    expect(
      rosterProblems([lead, { ...second, is_lead: true }], 2).map((p) => p.field),
    ).toContain("is_lead");
  });

  it("names the row that is wrong, not just 'a name is wrong'", () => {
    const p = rosterProblems([{ id: "t9", full_name: "J", is_lead: true }], 1);
    expect(p[0].field).toBe("full_name:t9");
  });

  it("catches the same person typed twice", () => {
    const twin = { id: "t3", full_name: "odonell brian" };
    const p = rosterProblems([lead, twin], 2);
    expect(p.some((x) => x.message.includes("twice"))).toBe(true);
  });

  it("reports every problem at once, not the first", () => {
    const p = rosterProblems([{ id: "t9", full_name: "J", is_lead: false }], 3);
    expect(p.length).toBe(3); // bad name, short roster, no lead
  });

  it("is never complete with nobody on it", () => {
    expect(rosterComplete([], 1)).toBe(false);
  });
});

describe("who owes what", () => {
  it("asks each traveller for a passport and an insurance certificate", () => {
    const owed = missingDocs([lead, second], [doc("t1", "passport", "verified")]);
    expect(owed[0].missing).toEqual(["insurance"]);
    expect(owed[1].missing).toEqual(["passport", "insurance"]);
  });

  it("separates 'not sent' from 'sent, waiting on us'", () => {
    const owed = missingDocs([lead], [doc("t1", "passport", "pending")]);
    expect(owed[0].pending).toEqual(["passport"]);
    expect(owed[0].missing).toEqual(["insurance"]);
  });

  it("does not count a rejected document as sent", () => {
    const owed = missingDocs([lead], [doc("t1", "passport", "rejected")]);
    expect(owed[0].missing).toContain("passport");
  });

  it("does not let one person's passport cover somebody else's", () => {
    const owed = missingDocs([lead, second], bothVerified(lead));
    expect(owed[1].missing).toEqual(["passport", "insurance"]);
  });

  it("says in one line what is still to come", () => {
    const owed = missingDocs([lead, second], bothVerified(lead));
    expect(owedSummary(owed)).toBe(
      "Still to come: Ana Lima (passport and insurance certificate).",
    );
    expect(owedSummary(missingDocs([lead], bothVerified(lead)))).toBeNull();
  });
});

describe("documentsComplete — the rule that confirms a booking", () => {
  it("is true when everybody named has both documents verified", () => {
    expect(
      documentsComplete({
        travellers: [lead, second],
        docs: [...bothVerified(lead), ...bothVerified(second)],
        partySize: 2,
      }),
    ).toBe(true);
  });

  it("THE BUG: one verified passport and no insurance no longer confirms a trip for six", () => {
    // This is what the old `docsSettled` returned true for, which confirmed the
    // booking and fired the permit trigger.
    expect(
      documentsComplete({
        travellers: [lead],
        docs: [doc("t1", "passport", "verified")],
        partySize: 6,
      }),
    ).toBe(false);
  });

  it("will not confirm on a roster that is short of the party", () => {
    expect(
      documentsComplete({ travellers: [lead], docs: bothVerified(lead), partySize: 2 }),
    ).toBe(false);
  });

  it("will not confirm on documents nobody has checked yet", () => {
    expect(
      documentsComplete({
        travellers: [lead],
        docs: [doc("t1", "passport", "verified"), doc("t1", "insurance", "pending")],
        partySize: 1,
      }),
    ).toBe(false);
  });

  it("will not confirm on documents belonging to nobody on the roster", () => {
    expect(
      documentsComplete({
        travellers: [lead],
        docs: bothVerified({ id: "ghost", full_name: "Nobody" } as Traveller),
        partySize: 1,
      }),
    ).toBe(false);
  });

  it("is false with nothing uploaded at all", () => {
    expect(documentsComplete({ travellers: [lead], docs: [], partySize: 1 })).toBe(false);
    expect(documentsComplete({ travellers: [], docs: [], partySize: 1 })).toBe(false);
  });
});
