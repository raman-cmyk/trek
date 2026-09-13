import { describe, expect, it } from "vitest";
import {
  AVATAR_MAX_BYTES,
  avatarPath,
  avatarProblem,
  bucketObjectPath,
  storedAs,
} from "./avatar";

describe("avatarProblem", () => {
  it("accepts the three things a browser can actually show", () => {
    expect(avatarProblem(200_000, "jpeg")).toBeNull();
    expect(avatarProblem(200_000, "png")).toBeNull();
    expect(avatarProblem(200_000, "webp")).toBeNull();
  });

  it("refuses a file over the limit, and says the limit", () => {
    expect(avatarProblem(AVATAR_MAX_BYTES + 1, "jpeg")).toContain("5 MB");
    expect(avatarProblem(AVATAR_MAX_BYTES, "jpeg")).toBeNull();
  });

  it("tells an iPhone owner what to change, not just that it failed", () => {
    // HEIC is the default on every iPhone sold, and the fix is three taps in
    // a Settings screen nobody would find on their own.
    const problem = avatarProblem(100_000, "heic");
    expect(problem).toContain("Settings");
    expect(problem).toContain("Most Compatible");
  });

  it("refuses a GIF with a reason of our own", () => {
    // Otherwise the storage layer refuses it with "mime type not allowed",
    // which is nobody's idea of an explanation.
    expect(avatarProblem(100_000, "gif")).toContain("profile photo");
  });

  it("refuses what it cannot read at all", () => {
    expect(avatarProblem(100_000, "unknown")).toContain("JPEG, PNG or WebP");
  });

  it("checks the size before the format", () => {
    // A 40 MB HEIC should be told about its size too, but one message at a
    // time; the size is the one they can fix without changing a setting.
    expect(avatarProblem(AVATAR_MAX_BYTES + 1, "heic")).toContain("5 MB");
  });
});

describe("storedAs", () => {
  it("names the file after what the bytes are", () => {
    expect(storedAs("jpeg")).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    expect(storedAs("png")).toEqual({ ext: "png", contentType: "image/png" });
    expect(storedAs("webp")).toEqual({ ext: "webp", contentType: "image/webp" });
  });
});

describe("avatarPath", () => {
  it("puts the file in the folder the storage policy checks", () => {
    expect(avatarPath("9f2b-1111", "jpg", 1757148900123)).toBe(
      "9f2b-1111/1757148900123.jpg",
    );
  });

  it("gives a replacement a new path", () => {
    // Writing an avatar back to the same path leaves the old bytes in every
    // cache that saw them, and the person is left looking at the photo they
    // just replaced.
    const a = avatarPath("u1", "jpg", 1_000);
    const b = avatarPath("u1", "jpg", 2_000);
    expect(a).not.toBe(b);
  });
});

describe("bucketObjectPath", () => {
  const base = "https://bcdgmxpwqhghheppvwhm.supabase.co";

  it("recovers the object path so the old file can be deleted", () => {
    expect(
      bucketObjectPath(`${base}/storage/v1/object/public/avatars/u1/1757148900123.jpg`, "avatars"),
    ).toBe("u1/1757148900123.jpg");
  });

  it("decodes a name that was escaped into the URL", () => {
    expect(
      bucketObjectPath(`${base}/storage/v1/object/public/avatars/u1/a%20b.jpg`, "avatars"),
    ).toBe("u1/a b.jpg");
  });

  it("leaves a seeded photo alone", () => {
    // Seeds are served from /img and are not ours to delete.
    expect(bucketObjectPath("/img/guides/pemba.jpg", "avatars")).toBeNull();
  });

  it("will not cross buckets", () => {
    expect(
      bucketObjectPath(`${base}/storage/v1/object/public/journal-photos/u1/x.jpg`, "avatars"),
    ).toBeNull();
  });

  it("is null for nothing at all", () => {
    expect(bucketObjectPath(null, "avatars")).toBeNull();
    expect(bucketObjectPath("", "avatars")).toBeNull();
  });
});
