import { describe, it, expect } from "vitest";
import {
  BURST_WINDOW_MINS,
  catchUpSince,
  digestFor,
  quoteLine,
  recipientsFor,
  withinBurstWindow,
} from "./group-notify";

const MEMBERS = [
  { user_id: "org", status: "joined" },
  { user_id: "mate", status: "joined" },
  { user_id: "invitee", status: "invited" },
  { user_id: "quitter", status: "declined" },
  { user_id: null, status: "invited" }, // invited by email, no account yet
];

describe("who gets emailed about a group message", () => {
  it("mails the room except the person who just typed", () => {
    const to = recipientsFor({
      members: MEMBERS,
      guideId: "guide",
      authorId: "org",
      mutedUserIds: [],
    });
    expect(to.sort()).toEqual(["guide", "invitee", "mate"]);
  });

  it("includes the guide, who is in the room but not on the roster", () => {
    const to = recipientsFor({ members: MEMBERS, guideId: "guide", authorId: "mate", mutedUserIds: [] });
    expect(to).toContain("guide");
  });

  it("never mails somebody who muted the trip, or who left it", () => {
    const to = recipientsFor({
      members: MEMBERS,
      guideId: "guide",
      authorId: "org",
      mutedUserIds: ["mate"],
    });
    expect(to).not.toContain("mate");
    expect(to).not.toContain("quitter");
  });

  it("does not mail the guide their own message", () => {
    const to = recipientsFor({ members: MEMBERS, guideId: "guide", authorId: "guide", mutedUserIds: [] });
    expect(to).not.toContain("guide");
  });
});

describe("the burst window", () => {
  const now = new Date("2026-09-06T12:00:00Z");

  it("leaves alone anyone mailed inside the window", () => {
    expect(withinBurstWindow("2026-09-06T11:45:00Z", now)).toBe(true);
  });

  it("mails again once the window has passed", () => {
    expect(withinBurstWindow("2026-09-06T11:00:00Z", now)).toBe(false);
    expect(BURST_WINDOW_MINS).toBeLessThan(60);
  });

  it("always mails somebody who has never been mailed", () => {
    expect(withinBurstWindow(null, now)).toBe(false);
    expect(withinBurstWindow("not a date", now)).toBe(false);
  });
});

describe("what the email says", () => {
  const messages = [
    { author_id: "mate", author_name: "Yuki", body: "Rest day at Samagaon?", kind: "message", created_at: "2026-09-06T10:00:00Z" },
    { author_id: "org", author_name: "Tom", body: "Yes", kind: "message", created_at: "2026-09-06T10:05:00Z" },
    { author_id: "guide", author_name: "Pemba", body: "Good idea — it helps the altitude.", kind: "message", created_at: "2026-09-06T10:10:00Z" },
  ];

  it("catches you up on what you missed, never on your own lines", () => {
    const d = digestFor({ messages, recipientId: "org", since: null });
    expect(d.lines.map((l) => l.who)).toEqual(["Yuki", "Pemba"]);
    expect(d.hasRealMessage).toBe(true);
  });

  it("starts from the later of your last read and your last email", () => {
    expect(catchUpSince("2026-09-06T10:06:00Z", "2026-09-06T09:00:00Z")).toBe("2026-09-06T10:06:00Z");
    expect(catchUpSince(null, "2026-09-06T09:00:00Z")).toBe("2026-09-06T09:00:00Z");
    expect(catchUpSince(null, null)).toBeNull();

    const d = digestFor({ messages, recipientId: "org", since: "2026-09-06T10:06:00Z" });
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].who).toBe("Pemba");
  });

  it("keeps the newest lines and counts the rest", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      author_id: "mate",
      author_name: "Yuki",
      body: `line ${i}`,
      kind: "message",
      created_at: `2026-09-06T10:0${i}:00Z`,
    }));
    const d = digestFor({ messages: many, recipientId: "org", since: null });
    expect(d.lines).toHaveLength(5);
    expect(d.lines[4].text).toBe("line 8"); // the newest, not the oldest
    expect(d.more).toBe(4);
  });

  it("does not send an email for system lines alone", () => {
    const joins = [
      { author_id: "mate", author_name: "Yuki", body: "Yuki joined.", kind: "system", created_at: "2026-09-06T10:00:00Z" },
    ];
    expect(digestFor({ messages: joins, recipientId: "org", since: null }).hasRealMessage).toBe(false);
  });

  it("attributes a real line and leaves a system line unattributed", () => {
    expect(quoteLine({ who: "Yuki", text: "Rest day?" })).toBe("Yuki: Rest day?");
    expect(quoteLine({ who: "", text: "Yuki joined." })).toBe("Yuki joined.");
    expect(quoteLine({ who: "Yuki", text: "x".repeat(400) })).toHaveLength(6 + 300);
  });
});
