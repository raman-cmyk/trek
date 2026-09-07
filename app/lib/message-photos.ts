/**
 * Photos inside a message body.
 *
 * A photo is sent as its own line — the composer uploads the file and appends
 * the link — so the body of a message is words, links, or both. Pulling the
 * image links out is what lets a thread show a picture instead of a hundred
 * characters of storage URL, which is what it showed until now.
 *
 * Extension-based, deliberately: a link we cannot tell is an image stays a
 * link, and a link is at worst dull. Guessing wrong the other way puts a
 * broken-image icon in somebody's conversation.
 */

const IMAGE_URL_RE = /https?:\/\/\S+?\.(?:jpe?g|png|webp|gif|avif)(?=$|[)\]\s]|\?)\S*/gi;

export interface MessageParts {
  /** What is left to read, with the image links taken out. */
  text: string;
  /** In the order they were written. */
  photos: string[];
}

export function splitPhotos(body: string): MessageParts {
  const photos: string[] = [];
  const text = body
    .replace(IMAGE_URL_RE, (url) => {
      if (!photos.includes(url)) photos.push(url);
      return "";
    })
    // The blank line the removed link leaves behind.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, photos };
}

/** Is this message nothing but pictures? */
export function isPhotoOnly(body: string): boolean {
  const { text, photos } = splitPhotos(body);
  return photos.length > 0 && text === "";
}
