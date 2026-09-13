/**
 * Profile photographs.
 *
 * A trekker asking a stranger to walk them to 5,300m is asking that stranger
 * to trust them too, and a grey circle is a poor way to make that case. The
 * profile page has always shown an avatar; nothing anywhere let the person it
 * belongs to put a face in it.
 *
 * The rules live here rather than in the route so they can be tested without
 * a Supabase client, and so the message a person actually reads when their
 * photo is refused is written in one place.
 */

/** 5 MB. A face off a phone, not a landscape and not a RAW file. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export const AVATAR_BUCKET = "avatars";

/** What `sniffImage` can tell us, and what we are willing to store. */
export type ImageKind = "jpeg" | "png" | "webp" | "gif" | "heic" | "unknown";

/**
 * Why this file cannot be a profile photo — or null if it can.
 *
 * Every branch says what to do next, because "invalid file" tells somebody
 * standing in front of a broken profile nothing at all. HEIC gets the longest
 * answer because it is the default on every iPhone sold and the fix is three
 * taps in Settings that nobody would guess.
 */
export function avatarProblem(size: number, kind: ImageKind): string | null {
  if (size > AVATAR_MAX_BYTES) {
    return "That photo is over 5 MB. Send a smaller one.";
  }
  if (kind === "heic") {
    return "That is an iPhone HEIC photo, which most browsers cannot show. On your iPhone: Settings → Camera → Formats → Most Compatible, then take it again — or send it to yourself on WhatsApp and upload the copy.";
  }
  if (kind === "gif") {
    // The bucket does not accept it, and an animated avatar is not what
    // anybody meant. Refused with a reason beats refused by the storage layer
    // with "mime type not allowed".
    return "A GIF can't be a profile photo. A JPEG, PNG or WebP is fine.";
  }
  if (kind === "unknown") {
    return "That file is not a photo we can read. JPEG, PNG or WebP.";
  }
  return null;
}

/** The extension and content type we store it under — from the bytes, not the
 * browser's guess, so the stored file and its content type always agree. */
export function storedAs(kind: "jpeg" | "png" | "webp"): {
  ext: string;
  contentType: string;
} {
  const ext = kind === "jpeg" ? "jpg" : kind;
  return { ext, contentType: kind === "jpeg" ? "image/jpeg" : `image/${kind}` };
}

/**
 * Where the file goes: avatars/<user_id>/<when>.<ext>.
 *
 * The folder is the user's id because that is what the storage policy checks.
 * The timestamp is what makes replacing a photo visible: an avatar written
 * back to the same path keeps its old bytes in every cache and CDN that saw
 * it, and the person is left looking at the photo they just replaced.
 */
export function avatarPath(userId: string, ext: string, now: number): string {
  return `${userId}/${now}.${ext}`;
}

/**
 * The object path inside a bucket, recovered from its public URL.
 *
 * Deleting the row is not deleting the file: without this, every replaced
 * avatar, removed photo and re-recorded voice note stays in storage for ever,
 * paid for and still reachable by anyone who kept the link. Returns null for
 * anything that is not a public URL for this bucket — seeded photos are served
 * from /img, and those must not be touched.
 */
export function bucketObjectPath(
  url: string | null | undefined,
  bucket: string,
): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}
