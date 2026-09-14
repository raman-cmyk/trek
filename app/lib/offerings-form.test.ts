import { describe, it, expect } from "vitest";
import { parseExperienceForm } from "./offerings.server";

/**
 * The save path for the details a trip page carries.
 *
 * The fields render correctly when the database holds them; the untested link
 * was the guide's form actually persisting them. These go through the real
 * parser, so a renamed input or a dropped field fails here rather than on a
 * page nobody checks for a month.
 */
function baseForm(extra: Array<[string, string]> = []) {
  const f = new FormData();
  f.set("kind", "day_hike");
  f.set("title", "Sarangkot sunrise");
  f.set("summary", "Up before the light, down for breakfast in Pokhara.");
  f.set("days", "1");
  f.set("min_party", "1");
  f.set("max_party", "6");
  f.set("guide_fee_usd", "35");
  for (const [k, v] of extra) f.append(k, v);
  return f;
}

describe("the details a guide fills in", () => {
  it("keeps every field it was given", () => {
    const { patch, error } = parseExperienceForm(
      baseForm([
        ["activity_level", "moderate"],
        ["transport", "walking"],
        ["transport", "private_vehicle"],
        ["transport_note", "The jeep is shared for the first hour."],
        ["accessibility", "kid_friendly"],
        ["accessibility", "not_for_limited_mobility"],
        ["accessibility_note", "The path is uneven."],
        ["languages", "English, Nepali"],
        ["faq_q", "Is it just me and my guide?"],
        ["faq_a", "Yes — nobody else joins your group."],
      ]),
    );
    expect(error).toBeUndefined();
    expect(patch!.activity_level).toBe("moderate");
    expect(patch!.transport).toEqual(["walking", "private_vehicle"]);
    expect(patch!.transport_note).toBe("The jeep is shared for the first hour.");
    expect(patch!.accessibility).toEqual(["kid_friendly", "not_for_limited_mobility"]);
    expect(patch!.accessibility_note).toBe("The path is uneven.");
    expect(patch!.languages).toEqual(["English", "Nepali"]);
    expect(patch!.faqs).toEqual([
      { q: "Is it just me and my guide?", a: "Yes — nobody else joins your group." },
    ]);
  });

  it("drops a code the database would refuse instead of failing the save", () => {
    const { patch, error } = parseExperienceForm(
      baseForm([
        ["activity_level", "extreme"],
        ["transport", "helicopter"],
        ["transport", "walking"],
        ["accessibility", "teleportation"],
      ]),
    );
    expect(error).toBeUndefined();
    expect(patch!.activity_level).toBeNull();
    expect(patch!.transport).toEqual(["walking"]);
    expect(patch!.accessibility).toEqual([]);
  });

  it("leaves everything empty when the guide skipped the step", () => {
    const { patch, error } = parseExperienceForm(baseForm());
    expect(error).toBeUndefined();
    expect(patch!.activity_level).toBeNull();
    expect(patch!.transport).toEqual([]);
    expect(patch!.transport_note).toBeNull();
    expect(patch!.accessibility).toEqual([]);
    expect(patch!.languages).toEqual([]);
    expect(patch!.faqs).toEqual([]);
  });

  it("drops the blank rows a six-row FAQ editor posts", () => {
    const f = baseForm();
    for (const [q, a] of [
      ["Is it cold?", "At night, yes."],
      ["", ""],
      ["A question nobody answered", ""],
      ["", "An answer to nothing"],
    ]) {
      f.append("faq_q", q);
      f.append("faq_a", a);
    }
    const { patch } = parseExperienceForm(f);
    expect(patch!.faqs).toEqual([{ q: "Is it cold?", a: "At night, yes." }]);
  });
});
