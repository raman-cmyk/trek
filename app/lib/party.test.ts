import { describe, it, expect } from "vitest";
import { partyWords } from "./party";

describe("how many people", () => {
  it("says it is private, whatever the numbers", () => {
    expect(partyWords(1, 8)).toBe("Private trip for 1 to 8 people");
    expect(partyWords(2, 6)).toBe("Private trip for 2 to 6 people");
  });

  it("does not say 'for 1 to 1'", () => {
    expect(partyWords(1, 1)).toBe("Private trip for 1 person");
    expect(partyWords(4, 4)).toBe("Private trip for 4 people");
  });

  it("treats a missing maximum as open-ended rather than printing null", () => {
    expect(partyWords(2, null)).toBe("Private trip, from 2 people");
    expect(partyWords(null, null)).toBe("Private trip, from 1 person");
  });

  it("floors a nonsense minimum at one", () => {
    expect(partyWords(0, 6)).toBe("Private trip for 1 to 6 people");
  });
});
