import { describe, expect, it } from "vitest";
import { publicImageTransform } from "./images";

describe("publicImageTransform", () => {
  it("builds a bounded Supabase render URL", () => {
    const value = publicImageTransform(
      "https://project.supabase.co/storage/v1/object/public/journal-photos/g/photo.jpg",
      300,
      375,
    );
    expect(value).toBe(
      "https://project.supabase.co/storage/v1/render/image/public/journal-photos/g/photo.jpg?width=300&height=375&resize=cover&quality=75",
    );
  });

  it("leaves non-Supabase-style image paths alone", () => {
    expect(publicImageTransform("/img/hero.jpg", 300, 200)).toBeNull();
    expect(publicImageTransform("not a url", 300, 200)).toBeNull();
  });
});
