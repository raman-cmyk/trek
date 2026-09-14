/**
 * Links in a message, as links.
 *
 * A guide pastes a Google short link — https://maps.app.goo.gl/x7Kq2mNb4 —
 * and there are no coordinates in it to read, so it stays as text. Until now
 * that meant it rendered as a dead string a trekker had to select, copy and
 * paste into another app, on a phone, with cold hands. That is not a link.
 *
 * Splitting rather than replacing with HTML, because the text belongs to
 * whoever wrote it and must never be interpreted as markup.
 */

export interface TextPart {
  kind: "text" | "link";
  value: string;
  /** For a link: where it goes. Same as value, minus any trailing full stop. */
  href?: string;
}

const LINK_RE = /(?:https?:\/\/|geo:)[^\s<>]+/gi;

/** Punctuation that ends a sentence rather than a URL. */
const TRAILING = /[.,;:!?)\]}'"»…]+$/;

/**
 * Split a run of text into what to read and what to tap.
 *
 * Trailing punctuation is pushed back into the text — "see https://x.com."
 * is a sentence about x.com, not a link to "x.com." — and an unbalanced
 * closing bracket goes the same way, since links inside parentheses are
 * commoner than links containing them.
 */
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;

  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    let url = m[0];

    const trimmed = url.replace(TRAILING, "");
    // Keep a closing bracket only when the link opened one itself — Wikipedia
    // does this and nobody else does.
    const keep = trimmed.length ? trimmed : url;
    const tail = url.slice(keep.length);
    url = keep;

    if (start > last) parts.push({ kind: "text", value: text.slice(last, start) });
    parts.push({ kind: "link", value: url, href: url });
    if (tail) parts.push({ kind: "text", value: tail });
    last = start + m[0].length;
  }

  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts.length ? parts : [{ kind: "text", value: text }];
}

/** Shorter on the screen than in the message — a phone is 360px wide. */
export function shortLink(url: string): string {
  const bare = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return bare.length <= 42 ? bare : `${bare.slice(0, 39)}…`;
}
