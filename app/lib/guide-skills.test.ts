import { describe, it, expect } from "vitest";
import { parseSkills, skillLabel, SKILLS, SKILL_GROUPS, MAX_SKILLS } from "./guide-skills";

describe("what a guide claims to be good at", () => {
  it("keeps only keys from the list", () => {
    expect(parseSkills(["birds", "wizardry", "cooking"])).toEqual(["birds", "cooking"]);
  });

  it("drops a key ticked twice", () => {
    expect(parseSkills(["birds", "birds"])).toEqual(["birds"]);
  });

  it("caps the claim, so one guide cannot win every filter", () => {
    const everything = SKILLS.map((s) => s.key);
    expect(everything.length).toBeGreaterThan(MAX_SKILLS);
    expect(parseSkills(everything)).toHaveLength(MAX_SKILLS);
  });

  it("survives rubbish", () => {
    expect(parseSkills([null, 7, "", "birds"] as unknown[])).toEqual(["birds"]);
    expect(parseSkills([])).toEqual([]);
  });

  it("has no duplicate keys across the groups", () => {
    const keys = SKILL_GROUPS.flatMap((g) => g.skills.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("can name every key it accepts", () => {
    for (const s of SKILLS) expect(skillLabel(s.key)).toBe(s.label);
    expect(skillLabel("wizardry")).toBeNull();
  });
});
