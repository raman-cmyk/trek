import { describe, expect, it } from "vitest";
import { isUndeliverable, undeliverableReason } from "./undeliverable";

describe("addresses that cannot receive mail", () => {
  it("refuses the seed data's example.com, all 65 of them", () => {
    expect(isUndeliverable("sarah@example.com")).toBe(true);
    expect(undeliverableReason("sarah@example.com")).toBe("reserved_domain");
  });

  it("refuses the other reserved domains and TLDs the RFCs set aside", () => {
    for (const a of [
      "a@example.net",
      "a@example.org",
      "a@thing.test",
      "a@thing.invalid",
      "a@thing.localhost",
      "a@printer.local",
      "a@anything.example",
    ]) {
      expect(isUndeliverable(a), a).toBe(true);
    }
  });

  it("does not care about case or stray whitespace", () => {
    expect(isUndeliverable("  Sarah@EXAMPLE.com ")).toBe(true);
  });

  it("lets every real address through, including odd-looking ones", () => {
    for (const a of [
      "raman@greyemails.com",
      "guide@sherpa.com.np",
      "a.b+tag@sub.domain.co.uk",
      "someone@example.company",
      "someone@notexample.com",
      "someone@myexample.org",
    ]) {
      expect(isUndeliverable(a), a).toBe(false);
    }
  });

  it("matches the domain, not a substring of it", () => {
    // "example.com.attacker.net" is not example.com, and
    // "notexample.com" is somebody's real domain.
    expect(isUndeliverable("a@example.com.attacker.net")).toBe(false);
    expect(isUndeliverable("a@notexample.com")).toBe(false);
  });

  it("takes the domain after the last @, not the first", () => {
    expect(isUndeliverable('"weird@thing"@example.com')).toBe(true);
  });

  it("stays quiet about empties — that is the gate's question, not this one", () => {
    expect(undeliverableReason("")).toBeNull();
    expect(undeliverableReason(null)).toBeNull();
    expect(undeliverableReason(undefined)).toBeNull();
    expect(undeliverableReason("not-an-address")).toBeNull();
  });
});
