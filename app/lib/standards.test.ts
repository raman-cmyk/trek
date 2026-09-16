import { describe, expect, it } from "vitest";
import { FEAR, standards, verificationChecks } from "./standards";
import { PENDING_CHECKS } from "./guide-checks";

describe("the standards", () => {
  it("gives six, covering before, during and after", () => {
    expect(standards()).toHaveLength(6);
    const keys = standards().map((s) => s.key);
    expect(keys).toContain("met"); // before
    expect(keys).toContain("checkin"); // during
    expect(keys).toContain("rescue"); // if it goes wrong
  });

  it("counts the verification checks from the real list, not by hand", () => {
    const met = standards().find((s) => s.key === "met")!;
    expect(met.detail).toContain(`${PENDING_CHECKS.length} checks`);
    expect(verificationChecks()).toHaveLength(PENDING_CHECKS.length);
  });

  it("names the first-aid certificate, which is the one that matters up there", () => {
    expect(verificationChecks().join(", ").toLowerCase()).toContain("first-aid");
  });

  it("sends every standard to a page that spells it out", () => {
    for (const s of standards()) {
      expect(s.href, s.key).toMatch(/^\/(trust|safety|insurance|transparency)$/);
    }
  });

  it("states each one as a fact, not as a feeling", () => {
    const banned = [
      "we care",
      "peace of mind",
      "rest assured",
      "your safety is",
      "utmost",
      "world-class",
      "state-of-the-art",
      "commitment to",
    ];
    const all = JSON.stringify(standards()).toLowerCase();
    for (const b of banned) expect(all, b).not.toContain(b);
  });

  it("promises nothing we cannot do", () => {
    const all = JSON.stringify(standards()).toLowerCase();
    // No claim of a capability this platform does not have: there is no
    // 24-hour phone line, no satellite tracking, no in-house helicopter.
    for (const b of ["24/7", "24 hours", "satellite track", "gps track", "our helicopter", "our own helicopter", "guarantee"]) {
      expect(all, b).not.toContain(b);
    }
  });

  it("says something specific in every detail line", () => {
    for (const s of standards()) {
      expect(s.detail.length, s.key).toBeGreaterThan(80);
      expect(s.title.length, s.key).toBeLessThan(56);
    }
  });
});

describe("the question itself", () => {
  it("names the fear instead of gesturing at it", () => {
    expect(FEAR.question.toLowerCase()).toContain("stranger you met on the internet");
    expect(FEAR.question.toLowerCase()).toMatch(/fourteen days|14 days/);
  });
});
