/**
 * Addresses that cannot receive mail, known before we try.
 *
 * The seed data gives all 65 demo accounts an `@example.com` address, which
 * is not a placeholder convention but an IANA-reserved domain (RFC 2606) that
 * is guaranteed to reject mail. For as long as the worker had no
 * `RESEND_API_KEY` this cost nothing: every send was logged `skipped ·
 * no_api_key` and nothing left the building. The key is set now, so the first
 * guide to accept an enquiry would post a real send to a domain that hard
 * bounces, and so would every demo click after it.
 *
 * A hard bounce is not a failed email. It is a mark against the sending
 * domain, and `guidesofnepal.com` started sending today with no reputation to
 * spend — a run of them is how a new domain ends up in spam folders, taking
 * the booking receipts with it. The existing gate already refuses an address
 * that has bounced once (`email_blocked_at`); this refuses the ones that can
 * be known to bounce without spending a bounce to find out.
 *
 * Deliberately narrow: only the domains the RFCs reserve, never a guess at
 * what looks fake. A real trekker with an unusual domain must still get their
 * receipt.
 */

/** Reserved by RFC 2606 / RFC 6761. None of these can accept mail, ever. */
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

/** Reserved TLDs. `.local` is included: it is mDNS, not the internet. */
const RESERVED_TLDS = ["test", "example", "invalid", "localhost", "local"];

/**
 * Why this address cannot be mailed, or null when it can.
 *
 * A reason rather than a boolean because it is written into `email_log`, and
 * "seed data, not a real address" is what an ops person needs to read there —
 * "failed" would send somebody looking for a fault that does not exist.
 */
export function undeliverableReason(email: string | null | undefined): string | null {
  const addr = String(email ?? "").trim().toLowerCase();
  if (!addr || !addr.includes("@")) return null; // not our question; the gate handles empties
  const domain = addr.slice(addr.lastIndexOf("@") + 1);
  if (!domain) return null;

  if (RESERVED_DOMAINS.has(domain)) return "reserved_domain";
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (domain.includes(".") && RESERVED_TLDS.includes(tld)) return "reserved_domain";
  return null;
}

/** Would mailing this address certainly bounce? */
export function isUndeliverable(email: string | null | undefined): boolean {
  return undeliverableReason(email) !== null;
}
