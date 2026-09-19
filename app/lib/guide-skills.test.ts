import { describe, it, expect } from "vitest";
import {
  countByGroup,
  droppedNote,
  parseSkills,
  skillGroupOf,
  skillLabel,
  SKILLS,
  SKILL_GROUPS,
  MAX_PER_GROUP,
} from "./guide-skills";

describe("what a guide claims to be good at", () => {
  it("keeps only keys from the list", () => {
    expect(parseSkills(["birds", "wizardry", "cooking"])).toEqual(["birds", "cooking"]);
  });

  it("drops a key ticked twice", () => {
    expect(parseSkills(["birds", "birds"])).toEqual(["birds"]);
  });

  it("caps the claim, so one guide cannot win every filter", () => {
    const everything = SKILLS.map((s) => s.key);
    expect(everything.length).toBeGreaterThan(MAX_PER_GROUP * SKILL_GROUPS.length);
    expect(parseSkills(everything)).toHaveLength(MAX_PER_GROUP * SKILL_GROUPS.length);
  });

  it("gives every group its own allowance, so the first cannot starve the last", () => {
    // The bug the founder found: one shared pool of eight, counted in page
    // order, so ticking generously at the top locked the bottom groups out
    // before he had scrolled to them.
    const first = SKILL_GROUPS[0];
    const last = SKILL_GROUPS[SKILL_GROUPS.length - 1];
    const greedy = [
      ...first.skills.map((s) => s.key),
      ...last.skills.slice(0, MAX_PER_GROUP).map((s) => s.key),
    ];
    const kept = parseSkills(greedy);
    const counts = countByGroup(kept);
    expect(counts[first.key]).toBe(MAX_PER_GROUP);
    expect(counts[last.key]).toBe(MAX_PER_GROUP);
  });

  it("keeps the ticks made first when a group overflows", () => {
    const g = SKILL_GROUPS[0];
    const kept = parseSkills(g.skills.map((s) => s.key));
    expect(kept).toEqual(g.skills.slice(0, MAX_PER_GROUP).map((s) => s.key));
  });

  it("knows which group a key belongs to", () => {
    for (const g of SKILL_GROUPS) {
      for (const s of g.skills) expect(skillGroupOf(s.key)).toBe(g.key);
    }
    expect(skillGroupOf("wizardry")).toBeNull();
  });

  it("survives rubbish", () => {
    expect(parseSkills([null, 7, "", "birds"] as unknown[])).toEqual(["birds"]);
    expect(parseSkills([])).toEqual([]);
  });

  it("has no duplicate keys across the groups", () => {
    const keys = SKILL_GROUPS.flatMap((g) => g.skills.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("says so when ticks did not fit, rather than saving in silence", () => {
    // The chips work with JavaScript off, so the server is the only thing
    // that can tell a guide their fifteenth tick was not kept.
    expect(droppedNote(4, 4)).toBeNull();
    expect(droppedNote(5, 4)).toContain("One tick");
    expect(droppedNote(9, 4)).toContain("5 ticks");
  });

  it("can name every key it accepts", () => {
    for (const s of SKILLS) expect(skillLabel(s.key)).toBe(s.label);
    expect(skillLabel("wizardry")).toBeNull();
  });
});
