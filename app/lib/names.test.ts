import { describe, expect, it } from "vitest";
import { firstName, firstNames } from "./names";

describe("firstName", () => {
  it("takes the given name", () => {
    expect(firstName("Pemba Sherpa")).toBe("Pemba");
    expect(firstName("Maya Gurung Tamang")).toBe("Maya");
  });

  it("keeps a compound given name whole", () => {
    expect(firstName("Jean-Pierre Dubois")).toBe("Jean-Pierre");
    expect(firstName("D'Angelo Russo")).toBe("D'Angelo");
  });

  it("survives the empty cases", () => {
    expect(firstName(null)).toBe("");
    expect(firstName(undefined)).toBe("");
    expect(firstName("   ")).toBe("");
    expect(firstName("Pemba")).toBe("Pemba");
  });

  it("ignores double spaces", () => {
    expect(firstName("  Pemba   Sherpa ")).toBe("Pemba");
  });
});

describe("firstNames", () => {
  it("reads as a sentence", () => {
    expect(firstNames(["Pemba Sherpa"])).toBe("Pemba");
    expect(firstNames(["Pemba Sherpa", "Dawa Lama"])).toBe("Pemba & Dawa");
    expect(firstNames(["Pemba S", "Dawa L", "Mingma T"])).toBe("Pemba, Dawa & Mingma");
  });

  it("drops the blanks rather than leaving gaps", () => {
    expect(firstNames(["Pemba Sherpa", null, "Dawa Lama"])).toBe("Pemba & Dawa");
    expect(firstNames([])).toBe("");
  });
});
