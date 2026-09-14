/**
 * The notification bell — the pure half.
 *
 * Every notification this platform sends went to email or to SMS, and there is
 * no key for either in production: 39 attempts, 39 rows reading
 * "skipped · no_api_key", nothing delivered, ever. A channel we do not own is
 * a channel that can be switched off by a missing secret, a bounced domain or
 * a Nepali carrier — so the notification a booking depends on has to exist
 * inside the app as well.
 *
 * Titles, hrefs and the unread count, kept pure so the bell, the list and the
 * writer cannot disagree about what a notification is.
 */

export interface InAppRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * The number on the bell. Anything past 9 is "9+", because the difference
 * between 14 and 23 unread changes nothing anybody does.
 */
export function badgeCount(rows: Pick<InAppRow, "read_at">[]): string | null {
  const n = rows.filter((r) => !r.read_at).length;
  if (n === 0) return null;
  return n > 9 ? "9+" : String(n);
}

export function unreadCount(rows: Pick<InAppRow, "read_at">[]): number {
  return rows.filter((r) => !r.read_at).length;
}

/**
 * Where a notification leads when there is nothing more specific.
 *
 * A notification with no destination is an advert for a problem: it tells
 * somebody a thing happened and leaves them to find it. Every kind resolves
 * to somewhere, and the fallback is the dashboard rather than nowhere.
 */
const FALLBACK_HREF: Record<string, string> = {
  new_enquiry: "/g/enquiries",
  enquiry_accepted: "/trips",
  deposit_paid: "/trips",
  new_message: "/messages",
  group_message: "/messages",
  instalment_charged: "/trips",
  balance_charged: "/trips",
  booking_cancelled: "/trips",
  tims_issued: "/trips",
  guide_verification: "/g",
  guide_question: "/g/questions",
  question_answered: "/guides",
  listing_edited: "/g/experiences",
  guide_welcome: "/g/setup",
  package_proposed: "/trips",
  proposal_approved: "/trips",
  you_re_confirmed: "/trips",
};

export function hrefFor(kind: string, href: string | null | undefined): string {
  const h = (href ?? "").trim();
  // Only our own paths. A notification row is written by the server, but a
  // row that ever carried an absolute URL would be an open redirect on a
  // click somebody trusts.
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  return FALLBACK_HREF[kind] ?? "/";
}

/** "4 minutes ago", for a list read at a glance. */
export function ago(iso: string, now: Date = new Date()): string {
  // Postgres hands back "2026-09-14 11:00:00+00": a space instead of the T,
  // and a two-digit offset that Date() reads as NaN. Both normalised here
  // rather than at every call site.
  const norm = iso
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const then = new Date(norm);
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}

/**
 * The first line of an email, as a notification's body.
 *
 * The email templates are blocks of prose; a bell wants one sentence. Taking
 * the first real one keeps the two in step without a second copy to write.
 */
export function bodyFromText(text: string | null | undefined, max = 160): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const stop = t.search(/[.!?](\s|$)/);
  const first = stop > 20 ? t.slice(0, stop + 1) : t;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}
