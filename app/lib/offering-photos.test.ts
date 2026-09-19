import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { byOffering, galleryPhotos } from "./offering-photos";

describe("galleryPhotos", () => {
  const extras = [
    { url: "/b.jpg", alt_text: "The pass", credit_name: "Nima" },
    { url: "/c.jpg", alt_text: null, credit_name: null },
  ];

  it("leads with the cover, then everything else in order", () => {
    // The cover is the picture somebody chose to represent the trip. It used
    // to be dropped entirely whenever a guide had uploaded anything.
    expect(galleryPhotos("/a.jpg", extras, "Gokyo Lakes").map((p) => p.url)).toEqual([
      "/a.jpg",
      "/b.jpg",
      "/c.jpg",
    ]);
  });

  it("shows the same file once", () => {
    // A guide who sets the cover from an upload has it in both places, and a
    // slider that turns over onto the identical photograph looks broken.
    expect(galleryPhotos("/b.jpg", extras, "Gokyo Lakes").map((p) => p.url)).toEqual([
      "/b.jpg",
      "/c.jpg",
    ]);
  });

  it("falls back to the trip's title for alt text, never to nothing", () => {
    const [cover, , unlabelled] = galleryPhotos("/a.jpg", extras, "Gokyo Lakes");
    expect(cover.alt).toBe("Gokyo Lakes");
    expect(unlabelled.alt).toBe("Gokyo Lakes");
  });

  it("keeps the credit where a photographer is named", () => {
    expect(galleryPhotos(null, extras, "Gokyo Lakes")[0].credit).toBe("Nima");
  });

  it("is empty for a trip with no picture at all, so the card draws its fallback", () => {
    expect(galleryPhotos(null, [], "Gokyo Lakes")).toEqual([]);
    expect(galleryPhotos("   ", null, "Gokyo Lakes")).toEqual([]);
  });
});

describe("byOffering", () => {
  it("groups one batched select by trip, in the order the rows arrived", () => {
    const rows = [
      { offering_id: "a", url: "/1.jpg" },
      { offering_id: "b", url: "/2.jpg" },
      { offering_id: "a", url: "/3.jpg" },
    ];
    expect(byOffering(rows).a.map((r) => r.url)).toEqual(["/1.jpg", "/3.jpg"]);
    expect(byOffering(rows).b).toHaveLength(1);
    expect(byOffering(null)).toEqual({});
  });
});

/**
 * The slider needs its photographs handed to it, and a prop is easy to lose.
 *
 * `public_offerings` carries `cover_photo_url` and no photo array, so a page
 * that renders an OfferingCard without fetching `offering_photos` shows one
 * picture per trip and nothing fails — no type error, no runtime error, just a
 * card that quietly stopped turning over. The same trap `card-rating.test.ts`
 * was written for, one prop along.
 */
describe("the pages that render an OfferingCard", () => {
  const dir = join(import.meta.dirname, "..", "routes");
  const pages = readdirSync(dir).filter((f) => {
    if (!f.endsWith(".tsx") || f.startsWith("_dev.")) return false;
    return /<OfferingCard[\s/>]/.test(readFileSync(join(dir, f), "utf8"));
  });

  it.each(pages)("%s hands the card its photographs", (page) => {
    const src = readFileSync(join(dir, page), "utf8");
    expect(src).toContain("photosByOffering");
    expect(src).toMatch(/photos=\{/);
  });
});
