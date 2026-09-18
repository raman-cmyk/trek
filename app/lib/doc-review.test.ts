import { describe, expect, it } from "vitest";
import {
  cleanReason,
  docState,
  liveDocs,
  outstanding,
  rejectionProblem,
  STATE_LABEL,
} from "./doc-review";

const verified = { verified_at: "2026-09-01T00:00:00Z" };
const rejected = { rejected_at: "2026-09-01T00:00:00Z", rejected_reason: "Blurry — page unreadable." };
const pending = {};

describe("docState", () => {
  it("names the three states", () => {
    expect(docState(verified)).toBe("verified");
    expect(docState(rejected)).toBe("rejected");
    expect(docState(pending)).toBe("pending");
  });

  it("prefers verified when a row somehow claims both", () => {
    // 0073 forbids it in the database; this is the belt to that's braces.
    expect(docState({ ...verified, ...rejected })).toBe("verified");
  });

  it("says 'needs redoing' rather than 'rejected' to the trekker", () => {
    expect(STATE_LABEL.rejected).toBe("needs redoing");
  });
});

describe("rejectionProblem", () => {
  it("refuses a rejection with no reason", () => {
    expect(rejectionProblem("")).toMatch(/Say what is wrong/);
    expect(rejectionProblem("   ")).toMatch(/Say what is wrong/);
    expect(rejectionProblem("no")).toMatch(/Say what is wrong/);
  });

  it("accepts a real reason", () => {
    expect(rejectionProblem("Blurry — the passport number is unreadable.")).toBeNull();
    expect(rejectionProblem("Expired")).toBeNull();
  });

  it("refuses an essay", () => {
    expect(rejectionProblem("x".repeat(601))).toMatch(/under 600/);
    expect(rejectionProblem("x".repeat(600))).toBeNull();
  });
});

describe("cleanReason", () => {
  it("trims and caps", () => {
    expect(cleanReason("  Expired in March.  ")).toBe("Expired in March.");
    expect(cleanReason("x".repeat(900))).toHaveLength(600);
  });
});

describe("liveDocs", () => {
  it("drops rejected documents from the count", () => {
    expect(liveDocs([verified, rejected, pending])).toEqual([verified, pending]);
  });

  it("does not let a rejection block a booking forever", () => {
    // Re-uploading inserts a NEW row rather than replacing the old one, so a
    // rejected row left in the reckoning would keep the booking unconfirmable
    // no matter what the trekker sent afterwards.
    expect(liveDocs([rejected, verified])).toEqual([verified]);
  });

  // Whether a booking's papers are complete is no longer answerable from a
  // list of documents alone — it needs the roster — so those tests live in
  // travellers.test.ts beside `documentsComplete`.
});

describe("outstanding", () => {
  it("is what the trekker still has to redo", () => {
    expect(outstanding([verified, rejected, pending])).toEqual([rejected]);
    expect(outstanding([verified, pending])).toEqual([]);
  });
});
