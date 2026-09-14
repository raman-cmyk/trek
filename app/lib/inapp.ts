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
