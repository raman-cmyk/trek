import { describe, it, expect } from "vitest";
import { instalmentSchedule, maxInstalments } from "./instalments";

describe("interest-free instalments", () => {
  it("splits the balance into equal parts that sum exactly (last carries remainder)", () => {
    const s = instalmentSchedule(100000, 3, "2026-01-01", "2026-06-01");
    expect(s).toHaveLength(3);
    expect(s.reduce((t, i) => t + i.amountUsdCents, 0)).toBe(100000);
    expect(s[0].amountUsdCents).toBe(33333);
    expect(s[2].amountUsdCents).toBe(33334); // remainder
  });

  it("all instalments fall on/before 7 days pre-departure", () => {
    const s = instalmentSchedule(90000, 3, "2026-01-01", "2026-06-01");
    expect(s[s.length - 1].dueDate <= "2026-05-25").toBe(true);
    expect(s[0].dueDate).toBe("2026-01-01");
  });

  it("clamps to what fits before departure", () => {
    // ~1 month out → only 1 instalment fits
    expect(maxInstalments("2026-01-01", "2026-02-01")).toBe(1);
    const s = instalmentSchedule(50000, 6, "2026-01-01", "2026-02-01");
    expect(s).toHaveLength(1);
    expect(s[0].amountUsdCents).toBe(50000);
  });

  it("more runway allows more instalments", () => {
    expect(maxInstalments("2026-01-01", "2026-12-01")).toBeGreaterThanOrEqual(6);
  });
});
