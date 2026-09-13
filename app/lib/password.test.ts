import { describe, expect, it } from "vitest";
import { PASSWORD_MIN, passwordProblem, resetSentMessage, safeNextPath } from "./password";

describe("passwordProblem", () => {
  it("accepts a password long enough", () => {
    expect(passwordProblem("dal-bhat-2026")).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MIN))).toBeNull();
  });

  it("refuses one that is too short, and says the number", () => {
    expect(passwordProblem("short")).toContain("8");
    expect(passwordProblem("a".repeat(PASSWORD_MIN - 1))).not.toBeNull();
  });

  it("checks the confirmation only when there is one", () => {
    expect(passwordProblem("dal-bhat-2026", "dal-bhat-2026")).toBeNull();
    expect(passwordProblem("dal-bhat-2026", "dal-bhat-2025")).toContain("not the same");
    expect(passwordProblem("dal-bhat-2026")).toBeNull();
  });

  it("complains about the length before the mismatch", () => {
    // One thing to fix at a time, and the length is the one they control.
    expect(passwordProblem("abc", "xyz")).toContain("8");
  });

  it("survives nothing at all", () => {
    expect(passwordProblem("")).not.toBeNull();
  });
});

describe("resetSentMessage", () => {
  it("says the same thing whether or not the account exists", () => {
    // Anything else confirms to a stranger that a given person is a customer
    // here, which for a trekker is a fact about where they are going.
    expect(resetSentMessage("a@example.com")).toContain("If a@example.com has an account");
  });

  it("still reads as a sentence with no address", () => {
    expect(resetSentMessage("")).toContain("If that address has an account");
  });

  it("says how long the link lasts", () => {
    expect(resetSentMessage("a@example.com")).toContain("an hour");
  });
});

describe("safeNextPath", () => {
  it("keeps a same-site path", () => {
    expect(safeNextPath("/g")).toBe("/g");
  });

  it("refuses anywhere off this site", () => {
    expect(safeNextPath("//evil.example.com")).toBeNull();
    expect(safeNextPath("https://evil.example.com")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
  });
});
