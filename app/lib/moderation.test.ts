import { describe, expect, it } from "vitest";
import {
  MAX_SUSPENSION_DAYS,
  actionLabel,
  actionProblem,
  activeBlock,
  blockMessage,
  isActionKind,
  sideOf,
  splitBySide,
  suspensionEnd,
  type BlockRow,
} from "./moderation";

const NOW = "2026-09-14T10:00:00.000Z";

function row(over: Partial<BlockRow> = {}): BlockRow {
  return {
    kind: "suspended",
    reason: "Gave a trekker their WhatsApp number before the deposit.",
    starts_at: "2026-09-10T10:00:00.000Z",
    ends_at: "2026-09-24T10:00:00.000Z",
    lifted_at: null,
    ...over,
  };
}

describe("actionProblem", () => {
  it("refuses an unknown action", () => {
    expect(actionProblem("delete", "a good long reason here")).toMatch(/warn, suspend or ban/);
  });

  it("requires a reason for every kind, warnings included", () => {
    expect(actionProblem("warned", "")).toMatch(/Say why/);
    expect(actionProblem("banned", "  ")).toMatch(/Say why/);
  });

  it("refuses a reason too short to be read", () => {
    expect(actionProblem("warned", "bad")).toMatch(/few more words/);
  });

  it("accepts a warning with a real reason and no days", () => {
    expect(actionProblem("warned", "Posted a phone number in the thread.")).toBeNull();
  });

  it("makes a suspension say how long", () => {
    expect(actionProblem("suspended", "Posted a phone number in the thread.")).toMatch(/How many days/);
    expect(actionProblem("suspended", "Posted a phone number in the thread.", 0)).toMatch(/How many days/);
    expect(actionProblem("suspended", "Posted a phone number in the thread.", 14)).toBeNull();
  });

  it("pushes an absurdly long suspension towards being honest about it", () => {
    expect(
      actionProblem("suspended", "Posted a phone number in the thread.", MAX_SUSPENSION_DAYS + 1),
    ).toMatch(/ban in everything but name/);
  });

  it("does not ask a ban how long it lasts", () => {
    expect(actionProblem("banned", "Took a booking off-platform twice after a warning.")).toBeNull();
  });
});

describe("isActionKind", () => {
  it("knows the three", () => {
    expect(isActionKind("warned")).toBe(true);
    expect(isActionKind("suspended")).toBe(true);
    expect(isActionKind("banned")).toBe(true);
  });
  it("rejects anything else, including nonsense from a crafted post", () => {
    expect(isActionKind("BANNED")).toBe(false);
    expect(isActionKind(null)).toBe(false);
    expect(isActionKind(7)).toBe(false);
  });
});

describe("suspensionEnd", () => {
  it("lands the stated number of days later", () => {
    expect(suspensionEnd(14, NOW)).toBe("2026-09-28T10:00:00.000Z");
  });
});

describe("activeBlock", () => {
  it("finds a suspension that is running", () => {
    expect(activeBlock([row()], NOW)?.kind).toBe("suspended");
  });

  it("a warning never locks anybody out", () => {
    expect(activeBlock([row({ kind: "warned", ends_at: null })], NOW)).toBeNull();
  });

  it("a lifted block is over", () => {
    expect(activeBlock([row({ lifted_at: "2026-09-12T10:00:00.000Z" })], NOW)).toBeNull();
  });

  it("a suspension that has run out is over without anyone lifting it", () => {
    expect(activeBlock([row({ ends_at: "2026-09-13T10:00:00.000Z" })], NOW)).toBeNull();
  });

  it("a ban has no end and stays in force", () => {
    expect(activeBlock([row({ kind: "banned", ends_at: null })], NOW)?.kind).toBe("banned");
  });

  it("ignores a block that has not started yet", () => {
    expect(
      activeBlock([row({ starts_at: "2026-10-01T10:00:00.000Z", ends_at: null, kind: "banned" })], NOW),
    ).toBeNull();
  });

  it("finds the live one past a warning sitting in front of it", () => {
    const rows = [row({ kind: "warned", ends_at: null }), row()];
    expect(activeBlock(rows, NOW)?.kind).toBe("suspended");
  });

  it("no history is not a block", () => {
    expect(activeBlock([], NOW)).toBeNull();
  });
});

describe("blockMessage", () => {
  it("gives a suspended person the date and the reason", () => {
    const msg = blockMessage(row(), NOW);
    expect(msg).toContain("24 September 2026");
    expect(msg).toContain("10 days left");
    expect(msg).toContain("WhatsApp");
  });

  it("does not promise a ban will end", () => {
    const msg = blockMessage(row({ kind: "banned", ends_at: null }), NOW);
    expect(msg).toContain("closed");
    expect(msg).not.toMatch(/until/);
  });
});

describe("actionLabel", () => {
  it("reads as a person would say it", () => {
    expect(actionLabel("warned")).toBe("Warned");
    expect(actionLabel("banned")).toBe("Banned");
    expect(actionLabel("suspended", 14)).toBe("Suspended 14 days");
    expect(actionLabel("suspended", 1)).toBe("Suspended 1 day");
  });
});

describe("splitBySide", () => {
  it("puts guides and clients on their own sides", () => {
    const rows = [
      { id: "a", role: "guide" },
      { id: "b", role: "trekker" },
      { id: "c", role: "guide" },
    ];
    const { guides, clients } = splitBySide(rows, (r) => r.role);
    expect(guides.map((g) => g.id)).toEqual(["a", "c"]);
    expect(clients.map((c) => c.id)).toEqual(["b"]);
  });

  it("never drops a flagged message whose sender has no role", () => {
    const { guides, clients } = splitBySide([{ role: null }, { role: "ops" }], (r) => r.role);
    expect(guides).toHaveLength(0);
    expect(clients).toHaveLength(2);
  });

  it("sideOf is the one place that decides", () => {
    expect(sideOf("guide")).toBe("guides");
    expect(sideOf("trekker")).toBe("clients");
    expect(sideOf(undefined)).toBe("clients");
  });
});
