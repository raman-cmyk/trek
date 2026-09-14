import { unpackPending, type PendingEnquiry } from "~/lib/pending-enquiry";

/**
 * The parked request, in a cookie the browser cannot rewrite.
 *
 * Signed with the service-role key, which never leaves the server. The
 * signature is not what makes the replay safe — submitEnquiry revalidates
 * everything — it is what stops a crafted cookie turning into a request the
 * trekker never made and then finds in My Trips.
 *
 * SameSite=Lax deliberately: the cookie has to survive a top-level redirect
 * back from the login page, which Strict would drop.
 */

const COOKIE = "gon_pending_enquiry";

async function key(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(env: Env, payload: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await key(env), new TextEncoder().encode(payload));
  return b64url(mac);
}

/** The Set-Cookie value that parks a request. */
export async function parkedCookie(env: Env, payload: string): Promise<string> {
  const value = `${b64url(new TextEncoder().encode(payload))}.${await sign(env, payload)}`;
  // 30 minutes, matching PENDING_TTL_MS — the cookie and the payload expire
  // together, so neither outlives the other.
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=1800`;
}

/** The Set-Cookie value that clears it, whatever happened. */
export function clearedCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

/** The parked request, or null when there is none or it does not verify. */
export async function readParked(
  env: Env,
  request: Request,
): Promise<PendingEnquiry | null> {
  const header = request.headers.get("Cookie") ?? "";
  const hit = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!hit) return null;

  const [body, mac] = hit.slice(COOKIE.length + 1).split(".");
  if (!body || !mac) return null;

  let payload: string;
  try {
    const b = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    payload = new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
  if ((await sign(env, payload)) !== mac) return null;
  return unpackPending(payload);
}
