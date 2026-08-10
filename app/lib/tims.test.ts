import { describe, it, expect } from "vitest";
import { timsCardNo } from "./tims.server";

describe("TIMS blue-card serial", () => {
  it("is deterministic and formatted per year", () => {
    const id = "66666666-6666-4666-8666-000000000001";
    expect(timsCardNo(id, 2026)).toBe("TIMS-B-2026-666666");
  });
  it("pads short id fragments", () => {
    expect(timsCardNo("ab12", 2026)).toBe("TIMS-B-2026-AB1200");
  });
});
