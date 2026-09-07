/**
 * The one email layout.
 *
 * Deliberately plain HTML: tables, inline styles, no images, no web fonts, no
 * dark-mode tricks. Email clients are a decade behind browsers and the only
 * thing worse than an ugly email is one that arrives broken in Outlook. What
 * matters is that it reads well and that the unsubscribe link is real.
 *
 * Every email is built as both HTML and plain text from the same content, so
 * a text-only client and a spam filter both see the same message.
 */

export interface EmailBlock {
  /** A paragraph. */
  p?: string;
  /** A heading above a section. */
  h?: string;
  /** A call to action. */
  button?: { label: string; url: string };
  /** A bulleted list. */
  list?: string[];
  /** Key/value facts — a booking summary, a price breakdown. */
  facts?: Array<[string, string]>;
}

export interface EmailContent {
  /** The line under the subject in most clients. Write it; do not let the
   *  client take the first sentence and repeat it. */
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
  /** Shown small at the bottom, above the footer — e.g. why they got this. */
  footnote?: string;
}

const INK = "#1c1c1a";
const SOFT = "#5f6b5f";
const LINE = "#e3e2dc";
const MOSS = "#2f5d3a";
const PAPER = "#faf9f5";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blockHtml(b: EmailBlock): string {
  if (b.h) {
    return `<tr><td style="padding:20px 0 4px;font:600 16px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}">${esc(b.h)}</td></tr>`;
  }
  if (b.p) {
    return `<tr><td style="padding:0 0 14px;font:400 16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}">${esc(b.p)}</td></tr>`;
  }
  if (b.list) {
    const items = b.list
      .map(
        (i) =>
          `<li style="margin:0 0 6px">${esc(i)}</li>`,
      )
      .join("");
    return `<tr><td style="padding:0 0 14px;font:400 16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}"><ul style="margin:0;padding-left:20px">${items}</ul></td></tr>`;
  }
  if (b.facts) {
    const rows = b.facts
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;font:400 15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${SOFT};white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font:500 15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}" align="right">${esc(v)}</td></tr>`,
      )
      .join("");
    return `<tr><td style="padding:0 0 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:6px;padding:8px 14px">${rows}</table></td></tr>`;
  }
  if (b.button) {
    return `<tr><td style="padding:6px 0 20px"><a href="${esc(b.button.url)}" style="display:inline-block;background:${MOSS};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font:600 16px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif">${esc(b.button.label)}</a></td></tr>`;
  }
  return "";
}

function blockText(b: EmailBlock): string {
  if (b.h) return `\n${b.h.toUpperCase()}\n`;
  if (b.p) return `${b.p}\n`;
  if (b.list) return b.list.map((i) => `  - ${i}`).join("\n") + "\n";
  if (b.facts) return b.facts.map(([k, v]) => `  ${k}: ${v}`).join("\n") + "\n";
  if (b.button) return `${b.button.label}: ${b.button.url}\n`;
  return "";
}

export interface RenderOpts {
  content: EmailContent;
  /** Absolute URL. Present on marketing mail, absent on transactional. */
  unsubscribeUrl?: string | null;
  /** Shown in the footer — a real postal address is a legal requirement for
   *  marketing mail in the US and good practice everywhere. */
  postalAddress: string;
  siteUrl: string;
}

export function renderEmail(o: RenderOpts): { html: string; text: string } {
  const { content: c } = o;
  const body = c.blocks.map(blockHtml).join("");

  const unsub = o.unsubscribeUrl
    ? `<p style="margin:10px 0 0">You are getting this because you asked us to keep in touch. <a href="${esc(o.unsubscribeUrl)}" style="color:${SOFT}">Stop these emails</a>.</p>`
    : `<p style="margin:10px 0 0">This is a message about your trip, so it is sent whatever your marketing preferences are.</p>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(c.heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:10px">
<tr><td style="padding:24px 28px 0">
  <a href="${esc(o.siteUrl)}" style="font:700 20px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${INK};text-decoration:none">Guides of Nepal<span style="color:${MOSS}">.</span></a>
</td></tr>
<tr><td style="padding:18px 28px 0;font:700 22px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}">${esc(c.heading)}</td></tr>
<tr><td style="padding:16px 28px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
</td></tr>
${c.footnote ? `<tr><td style="padding:0 28px 20px;font:400 14px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${SOFT}">${esc(c.footnote)}</td></tr>` : ""}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:18px 28px;font:400 13px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${SOFT}">
  <p style="margin:0">${esc(o.postalAddress)}</p>
  ${unsub}
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    c.heading,
    "",
    ...c.blocks.map(blockText),
    c.footnote ? `\n${c.footnote}` : "",
    "",
    "—",
    o.postalAddress,
    o.unsubscribeUrl ? `Stop these emails: ${o.unsubscribeUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { html, text };
}
