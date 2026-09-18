/**
 * Turning something we were going to email into something the app can show.
 *
 * Every transactional email this platform sends already knows three things: who
 * it is for, what happened, and the one link the person should follow. That is
 * exactly a notification. So rather than adding a notify() call beside forty
 * existing sendEmail() calls — and forgetting some — the notification is
 * derived from the email at the moment it is composed.
 *
 * It is written BEFORE the part that needs an API key, which is the whole
 * point: the app can tell somebody their guide accepted even while the email
 * channel is down. It has been down since the first day.
 */

import { linkParts } from "~/lib/linkify";

/**
 * Does this email deserve a bell?
 *
 * Marketing does not: an unread badge for a newsletter is how people learn to
 * ignore the bell. Neither does anything addressed to the office — those go to
 * a shared inbox, not to a person's account.
 */
export function shouldNotifyInApp(
  category: string | null | undefined,
  kind: string | null | undefined,
): boolean {
  if ((category ?? "transactional") !== "transactional") return false;
  const k = (kind ?? "").toLowerCase();
  if (!k) return false;
  // `*_ops` is the convention for mail to the office rather than to a person.
  if (k.endsWith("_ops") || k.startsWith("ops_")) return false;
  return true;
}

/**
 * Where the notification takes you: the first link in the email that points at
 * us.
 *
 * Taken from the body rather than passed in, because the body already contains
 * the single link the email was written around — "pay your deposit:
 * https://…/checkout/abc" — and a second place to state it is a second place
 * to get it wrong. External links are ignored: a notification must not send
 * somebody off the platform.
 */
export function hrefFromBody(body: string, siteUrl: string): string | null {
  const base = (siteUrl ?? "").replace(/\/+$/, "");
  for (const part of linkParts(body ?? "")) {
    if (part.kind !== "link" || !part.href) continue;
    if (base && part.href.startsWith(base)) {
      const path = part.href.slice(base.length);
      return path.startsWith("/") ? path : `/${path}`;
    }
  }
  return null;
}

/**
 * The first sentence of the email, as the line under the title.
 *
 * Not the whole body: a notification is a nudge towards a page, and the page
 * is where the detail belongs. Cut on a sentence rather than a character count
 * so it never ends mid-word.
 */
export function previewOf(body: string, max = 160): string | null {
  const flat = (body ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!flat) return null;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > 40) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 40 ? space : max)}…`;
}

/* ── Building the row ───────────────────────────────────────────────────── */

export interface NotificationDraft {
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  about_type: string | null;
  about_id: string | null;
}

/**
 * The row itself, built once for both ways in: derived from an email, or
 * written directly by something that has no email to send.
 *
 * Returns null rather than a row it knows the database will refuse. The title
 * column is `length(btrim(title)) between 1 and 200` (0079), and the old code
 * did `subject.slice(0, 200)` with no trim — so a subject of spaces threw, and
 * the throw vanished into a catch. Refusing here says the same thing quietly
 * and on purpose.
 *
 * The href is checked here rather than only at read time: `/notifications`
 * already guards against an off-site link when it redirects, and a value that
 * has to be re-checked every time it is read is a value that should not have
 * been stored.
 */
export function notificationRow(input: {
  userId: string;
  kind: string;
  title: string;
  /** Free text. The preview is cut from it, and the link too if none is given. */
  text?: string | null;
  /** An in-app path. Beats anything found in the text. */
  href?: string | null;
  /** Only needed when the link has to be found in the text. */
  siteUrl?: string;
  about?: { type: string; id: string } | null;
}): NotificationDraft | null {
  const title = String(input.title ?? "").trim();
  if (!title || !input.userId || !String(input.kind ?? "").trim()) return null;

  const text = String(input.text ?? "");
  const href = safeHref(input.href) ?? hrefFromBody(text, input.siteUrl ?? "");

  return {
    user_id: input.userId,
    kind: input.kind,
    title: title.slice(0, 200),
    body: text ? previewOf(text) : null,
    href,
    about_type: input.about?.type ?? null,
    about_id: input.about?.id ?? null,
  };
}

/** A path on this site, or nothing. `//evil.com` is a URL, not a path. */
function safeHref(href: string | null | undefined): string | null {
  const h = String(href ?? "").trim();
  if (!h.startsWith("/") || h.startsWith("//")) return null;
  return h;
}

/**
 * Where the office should land for a thing.
 *
 * The bell renders in the trekker layout and the guide layout, and
 * `/notifications` lets any signed-in account open it — so an ops user tapping
 * a notification that points at `/trips/:id` arrives at a page that matches on
 * `trekker_id` and dead-ends. The office gets the same event addressed to the
 * reader.
 */
export function opsHref(about: { type: string; id: string } | null | undefined): string | null {
  if (!about) return null;
  if (about.type === "booking") return `/ops/bookings/${about.id}`;
  // There is no ops page for a single request; the board is where they are worked.
  if (about.type === "enquiry") return "/ops/pipeline";
  return null;
}

/**
 * The office, minus anyone already told under another hat.
 *
 * On a team this small a guide can also hold `role='ops'`, and the two rows
 * carry different links — so they cannot be merged, only deduped by dropping
 * the office copy. The guide's own link is the more useful one.
 */
export function recipientsFor(opsUserIds: string[], alreadyTold: string[]): string[] {
  const told = new Set(alreadyTold.filter(Boolean));
  return [...new Set(opsUserIds.filter(Boolean))].filter((id) => !told.has(id));
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

/** How many are new. What the bell shows. */
export function unreadCount(rows: { read_at: string | null }[]): number {
  return rows.filter((r) => !r.read_at).length;
}

/**
 * The count as it fits on a bell. Past ninety-nine the exact number stops
 * being information and starts being a wall.
 */
export function badgeLabel(n: number): string | null {
  if (n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

/** "Just now", "3h ago", "Tuesday", "12 Aug" — a list scanned, not read. */
export function whenLabel(iso: string, nowIso: string): string {
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return "";
  const mins = Math.floor((now - then) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) {
    return new Date(then).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  }
  return new Date(then).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
