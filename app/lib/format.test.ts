import { describe, expect, it } from "vitest";
import { fmtDateRange } from "./format";

describe("fmtDateRange", () => {
  it("does not duplicate a single day", () => {
    expect(fmtDateRange("2026-09-30", "2026-09-30")).toBe("Sep 30, 2026");
  });
  it("formats same-month and cross-month spans unambiguously", () => {
    expect(fmtDateRange("2026-08-06", "2026-08-20")).toBe("Aug 6–20, 2026");
    expect(fmtDateRange("2026-09-28", "2026-10-04")).toBe("Sep 28 – Oct 4, 2026");
  });
});
