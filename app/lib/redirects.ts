/**
 * Return a same-origin application path suitable for a redirect response.
 *
 * URL parsers treat backslashes as slashes for special schemes, so prefix
 * checks such as `startsWith("/")` are not sufficient (`/\\example.com`
 * normalizes to a protocol-relative external URL). Keep the normalized
 * pathname/search/hash only after the parsed origin is proven identical.
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  requestUrl: string,
  fallback: string,
): string {
  if (!raw || /[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  try {
    const base = new URL(requestUrl);
    const target = new URL(raw, base);
    if (target.origin !== base.origin) return fallback;
    if (!target.pathname.startsWith("/")) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export function safeInternalPath(raw: string | null | undefined, fallback: string): string {
  return safeRedirectPath(raw, "https://internal.invalid/", fallback);
}
