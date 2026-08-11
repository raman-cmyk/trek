import { describe, expect, it } from "vitest";
import { MIN_JOURNAL_PHOTOS, validateForPublish } from "./journals.server";
import { layoutFor, seasonOf, sortTags, type JournalEntry } from "./journals";

const ok = {
  cover_photo_url: "https://x/cover.jpg",
  guide_note: "Jef crossed first by day 10.",
  group_label: "Jef & Simon, BE",
  group_anon: null,
  client_names_ok: true,
  start_date: "2025-10-12",
  end_date: "2025-10-16", // 5 days
};

/** n entries, one per day, `per` photos each. */
const album = (days: number, per: number) =>
  Array.from({ length: days }, (_, i) => ({
    day_no: i + 1,
    photos: Array.from({ length: per }, (_, p) => ({ url: `d${i}-${p}.jpg` })),
  }));

describe("validateForPublish", () => {
  it("passes a complete album", () => {
    expect(validateForPublish(ok, album(5, 3))).toBeNull();
  });

  it("refuses fewer than the photo minimum", () => {
    const bad = validateForPublish(ok, album(5, 1));
    expect(bad).toContain(String(MIN_JOURNAL_PHOTOS));
    expect(bad).toContain("(you have 5)");
  });

  it("refuses a journal that skips days", () => {
    const entries = album(5, 3).filter((e) => e.day_no !== 2 && e.day_no !== 3);
    expect(validateForPublish(ok, entries)).toContain("2–3");
  });

  it("names a single missing day without a range", () => {
    const entries = album(5, 3).filter((e) => e.day_no !== 4);
    const bad = validateForPublish(ok, entries)!;
    expect(bad).toContain("day 4");
    expect(bad).not.toContain("–");
  });

  it("still enforces cover, note and consent before the album rules", () => {
    expect(validateForPublish({ ...ok, cover_photo_url: null }, album(5, 3))).toContain(
      "cover photo",
    );
    expect(
      validateForPublish({ ...ok, client_names_ok: false }, album(5, 3)),
    ).toContain("anonymous version");
  });

  it("accepts the legacy bare-count call shape", () => {
    expect(validateForPublish(ok, 3)).toBeNull();
    expect(validateForPublish(ok, 0)).toContain("at least one day");
  });

  it("prefers a stored day count over the dates", () => {
    expect(validateForPublish({ ...ok, days: 8 }, album(5, 3))).toContain("6–8");
  });
});

describe("layoutFor", () => {
  const entry = (n: number, layout = "full"): JournalEntry =>
    ({
      id: String(n),
      day_no: n,
      title: "",
      body: null,
      altitude_m: null,
      is_hard_day: false,
      layout,
      photos: Array.from({ length: n }, () => ({ url: "x.jpg" })),
    }) as JournalEntry;

  it("never repeats a shape on consecutive single-photo days", () => {
    const shapes = [0, 1, 2, 3].map((i) => layoutFor(entry(1), i));
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i]).not.toBe(shapes[i - 1]);
    }
  });

  it("uses the photo count when there is more than one", () => {
    expect(layoutFor(entry(2), 0)).toBe("two");
    expect(layoutFor(entry(3), 0)).toBe("three");
    expect(layoutFor(entry(5), 1)).toBe("three");
  });

  it("lets the guide's own choice win", () => {
    expect(layoutFor(entry(1, "pano"), 0)).toBe("pano");
  });
});

describe("tags", () => {
  it("orders tags so conditions read first", () => {
    const sorted = sortTags([
      { kind: "difficulty", value: "Hard" },
      { kind: "conditions", value: "Snow" },
      { kind: "group", value: "Solo" },
    ]);
    expect(sorted.map((t) => t.value)).toEqual(["Snow", "Solo", "Hard"]);
  });

  it("derives the season from the start month", () => {
    expect(seasonOf("2025-10-12")).toBe("Autumn");
    expect(seasonOf("2025-04-02")).toBe("Spring");
    expect(seasonOf("2025-07-30")).toBe("Monsoon");
    expect(seasonOf("2026-01-05")).toBe("Winter");
  });
});
