import { describe, expect, it } from "vitest";
import { MIN_JOURNAL_PHOTOS, validateForPublish } from "./journals.server";
import { allMedia, isVideo, seasonOf, sortTags } from "./journals";

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

describe("media", () => {
  it("reads a clip by its extension when nothing said so", () => {
    expect(isVideo({ url: "/x/pass.MP4" })).toBe(true);
    expect(isVideo({ url: "/x/pass.jpg" })).toBe(false);
    expect(isVideo({ url: "/x/clip.jpg", kind: "video" })).toBe(true);
    expect(isVideo({ url: "/x/a.webm?v=2" })).toBe(true);
  });

  it("flattens every frame into one gallery in trek order", () => {
    const gallery = allMedia([
      { day_no: 2, title: "Jagat", photos: [{ url: "b.jpg" }, { url: "c.jpg" }] },
      { day_no: 1, title: "Machha Khola", photos: [{ url: "a.jpg" }] },
      { day_no: 3, title: "Deng", photos: null },
    ]);
    expect(gallery.map((m) => m.url)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(gallery[1].day).toBe(2);
    expect(gallery[1].dayTitle).toBe("Jagat");
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
