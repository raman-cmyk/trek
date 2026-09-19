/**
 * What Resend tells us after an email leaves, and what to do about it.
 *
 * Until today nothing wrote `users.email_blocked_at`. The column has existed
 * since 0055 and the gate has always honoured it — a blocked address stops
 * everything, booking receipts included — but no code path ever set it. That
 * was harmless while no mail was going out. Now that it is, the absence is the
 * expensive kind: a hard bounce that nobody records is an address we keep
 * mailing, and repeatedly mailing a dead address is the specific behaviour
 * that gets a sending domain filed under spam.
 *
 * So Resend's webhook becomes the other half of the loop. This module is the
 * deciding half of it: which events matter, which are noise, and which address
 * an event is actually about. Pure, because the alternative is discovering in
 * production that a soft bounce blocked a real trekker's confirmation.
 *
 * The one judgement worth stating plainly: **only a permanent failure blocks.**
 * A transient bounce is a full mailbox or a server having a bad afternoon, and
 * treating that as permanent would lock somebody out of their own trip over a
 * temporary problem. Resend reports this as `data.bounce.type`, and anything
 * that is not explicitly permanent is left alone.
 */

/** The shape we care about. Resend sends more; none of the rest is used. */
export interface ResendEvent {
  type?: string | null;
  data?: {
    email_id?: string | null;
    to?: string[] | string | null;
    bounce?: { type?: string | null; subType?: string | null; message?: string | null } | null;
  } | null;
}

export type ResendOutcome =
  /** Stop mailing this address. Sets email_blocked_at + a reason. */
  | { do: "block"; reason: string }
  /** Nothing to stop, but the email_log row should say what happened. */
  | { do: "record"; status: "sent" | "failed"; detail: string }
  /** Real, and of no consequence to us. */
  | { do: "ignore" };

/** The address an event is about, or null when the payload does not say. */
export function recipientOf(event: ResendEvent | null | undefined): string | null {
  const to = event?.data?.to;
  const first = Array.isArray(to) ? to[0] : to;
  const s = typeof first === "string" ? first.trim().toLowerCase() : "";
  return s.includes("@") ? s : null;
}

/** Resend's id for the message, which is what `email_log.provider_id` holds. */
export function providerIdOf(event: ResendEvent | null | undefined): string | null {
  const id = event?.data?.email_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Is this bounce the permanent kind?
 *
 * Resend passes AWS SES's vocabulary through: `Permanent`, `Transient`,
 * `Undetermined`. Only the first is a fact about the address rather than about
 * a moment, so only the first is allowed to block somebody.
 */
export function isPermanentBounce(
  bounce: { type?: string | null } | null | undefined,
): boolean {
  return String(bounce?.type ?? "").trim().toLowerCase() === "permanent";
}

/**
 * What to do about an event.
 *
 * Unknown event types are ignored rather than guessed at: Resend adds them
 * over time, and the failure mode of guessing is blocking a paying customer.
 */
export function resendOutcome(event: ResendEvent | null | undefined): ResendOutcome {
  const type = String(event?.type ?? "").trim();

  switch (type) {
    case "email.bounced": {
      const b = event?.data?.bounce ?? null;
      if (!isPermanentBounce(b)) {
        // A full mailbox is not a dead address. Note it and move on.
        return { do: "record", status: "failed", detail: bounceDetail(b, "soft_bounce") };
      }
      return { do: "block", reason: bounceDetail(b, "hard_bounce") };
    }

    // Someone pressed "this is spam". There is no version of continuing to
    // mail them that ends well, for them or for the domain.
    case "email.complained":
      return { do: "block", reason: "spam_complaint" };

    case "email.delivered":
      return { do: "record", status: "sent", detail: "delivered" };

    // Resend's own terminal failure, before a mail server was ever involved.
    case "email.failed":
      return { do: "record", status: "failed", detail: "provider_failed" };

    // Real events that tell us nothing we act on. `delivery_delayed` is
    // deliberately here: it is a receiving server asking us to wait, which
    // usually resolves itself, and recording it as a failure would be a lie.
    case "email.sent":
    case "email.delivery_delayed":
    case "email.opened":
    case "email.clicked":
      return { do: "ignore" };

    default:
      return { do: "ignore" };
  }
}

/** A short reason worth reading in `users.email_blocked_reason` six months on. */
function bounceDetail(
  bounce: { subType?: string | null } | null | undefined,
  fallback: string,
): string {
  const sub = String(bounce?.subType ?? "").trim();
  return sub ? `${fallback}: ${sub}` : fallback;
}

/* ── Svix signature verification ────────────────────────────────────────── */

const encoder = new TextEncoder();

/** Constant-time compare, so a forged signature cannot be found by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s);
}

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Verify a Resend webhook, which is signed by Svix.
 *
 * The scheme: HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed by the
 * base64 secret with its `whsec_` prefix stripped, compared against a
 * space-separated list of `v1,<base64>` candidates — a list because Svix
 * sends every active key during a rotation.
 *
 * Deliberately the same shape as `verifyStripeSignature`: reject on anything
 * missing or malformed rather than interpreting it, and refuse a timestamp
 * outside the tolerance so a captured delivery cannot be replayed tomorrow.
 * Returns false rather than throwing — the caller's only sane response to any
 * failure is the same 400.
 */
export async function verifySvixSignature(
  body: string,
  headers: SvixHeaders,
  secret: string,
  opts: { toleranceSec?: number; nowMs?: number } = {},
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const tolerance = opts.toleranceSec ?? 300;
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > tolerance) return false;

  let keyBytes: ArrayBuffer;
  try {
    const raw = atob(secret.replace(/^whsec_/, ""));
    const buf = new ArrayBuffer(raw.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
    keyBytes = buf;
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = b64(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${body}`)),
  );

  // Every candidate is checked — Svix sends all active keys mid-rotation —
  // and each comparison is constant time.
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version === "v1" && value && timingSafeEqual(value, mac)) return true;
  }
  return false;
}
