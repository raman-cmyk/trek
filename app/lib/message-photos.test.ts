import { describe, expect, it } from "vitest";
import { isPhotoOnly, splitPhotos } from "./message-photos";

const url =
  "https://bcdgmxpwqhghheppvwhm.supabase.co/storage/v1/object/public/journal-photos/9f2b/1757148900123-msg.webp";

describe("splitPhotos", () => {
  it("finds a photo sent on its own", () => {
    expect(splitPhotos(url)).toEqual({ text: "", photos: [url] });
    expect(isPhotoOnly(url)).toBe(true);
  });

  it("keeps the words when a photo has a caption", () => {
    const r = splitPhotos(`These are my boots\n${url}`);
    expect(r.text).toBe("These are my boots");
    expect(r.photos).toEqual([url]);
  });

  it("takes several, in the order they were written", () => {
    const b = url.replace("9f2b", "aa11");
    const r = splitPhotos(`${url}\n${b}`);
    expect(r.photos).toEqual([url, b]);
    expect(r.text).toBe("");
  });

  it("does not repeat the same photo twice", () => {
    expect(splitPhotos(`${url}\n${url}`).photos).toEqual([url]);
  });

  it("leaves a link that is not an image alone", () => {
    const page = "https://example.com/gear-list";
    const r = splitPhotos(`have a look ${page}`);
    expect(r.photos).toEqual([]);
    expect(r.text).toBe(`have a look ${page}`);
    expect(isPhotoOnly(page)).toBe(false);
  });

  it("copes with a query string on the link", () => {
    const signed = `${url}?token=abc123`;
    expect(splitPhotos(signed).photos).toEqual([signed]);
  });

  it("leaves ordinary text untouched", () => {
    const t = "Which days in October are you free?";
    expect(splitPhotos(t)).toEqual({ text: t, photos: [] });
  });
});
