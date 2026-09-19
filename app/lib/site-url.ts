/**
 * Where this site lives, said once.
 *
 * Every email and SMS we send is mostly a link — pay your deposit, read the
 * message, download the TIMS card — and the address those links point at was
 * being assembled in fourteen places from `env.SITE_URL`, four different ways.
 * Two of them defaulted to the real domain, one to the empty string, and ten
 * interpolated the variable bare, so with SITE_URL unset a guide's SMS read
 *
 *     Reply: undefined/messages/abc
 *
 * That never surfaced because nothing has ever sent an email or an SMS: the
 * worker has no RESEND_API_KEY and no SPARROW_SMS_TOKEN, and every one of the
 * 39 rows in email_log says `skipped · no_api_key`. It would have surfaced in
 * the first message sent after the keys were added.
 *
 * The default is the real domain rather than the workers.dev address, which
 * is safe to state now that guidesofnepal.com resolves and serves the site.
 */

const FALLBACK = "https://guidesofnepal.com";

/**
 * A usable origin from whatever the environment happens to hold.
 *
 * Anything that is not an http(s) URL is treated as absent, including the
 * string "undefined" — which is what a bare interpolation of an unset
 * variable produces, and is the exact failure this replaces.
 */
export function siteOrigin(raw: string | null | undefined): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!/^https?:\/\/[^\s/]+/i.test(s)) return FALLBACK;
  return s.replace(/\/+$/, "");
}

/** The origin for this environment. Never ends in a slash. */
export function siteUrl(env: { SITE_URL?: string }): string {
  return siteOrigin(env?.SITE_URL);
}

/**
 * An absolute link to a path on this site.
 *
 * Takes the join seriously because the callers disagreed about slashes:
 * `${site}${threadPath}` and `${site}/trips/${id}` both existed, so a
 * SITE_URL with a trailing slash produced `//trips/…`.
 */
export function siteLink(env: { SITE_URL?: string }, path: string): string {
  const p = String(path ?? "");
  return `${siteUrl(env)}${p.startsWith("/") ? "" : "/"}${p}`;
}
