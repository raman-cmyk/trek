/**
 * Stripe abstraction (docs/02 §Payment flow). Two implementations behind one
 * interface: a real client that calls the Stripe REST API via fetch (Workers-
 * friendly, no Node SDK), and a mock used when STRIPE_SECRET_KEY is absent so
 * the whole booking→payment flow is buildable and testable without keys.
 *
 * When the founder adds real Stripe test keys, `getStripe` returns the real
 * client and NOTHING else changes — the fulfillment logic is identical.
 */

export interface DepositIntent {
  paymentIntentId: string;
  clientSecret: string;
  /** For saving the card to charge the balance later (SetupIntent). */
  setupClientSecret: string | null;
  mock: boolean;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

export interface StripeClient {
  isMock: boolean;
  createDepositIntent(args: {
    amountUsdCents: number;
    bookingId: string;
    customerEmail?: string;
    saveCard: boolean;
  }): Promise<DepositIntent>;
  retrievePaymentIntent(id: string): Promise<{ id: string; status: string }>;
  refund(args: {
    paymentIntentId: string;
    amountUsdCents: number;
  }): Promise<{ id: string; status: string }>;
  /** Verify + parse a webhook. Mock trusts the payload. */
  constructEvent(payload: string, signature: string | null, secret?: string): Promise<StripeEvent>;
}

// ---- Webhook signature verification ----------------------------------------

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare of two equal-length hex strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a Stripe webhook signature (scheme `t=…,v1=…`) and parse the event.
 *
 * Recomputes HMAC-SHA256 over `${t}.${payload}` with the endpoint secret using
 * Web Crypto (works on Cloudflare Workers and Node 18+), compares in constant
 * time, and rejects timestamps outside the tolerance window — closing the
 * forged-webhook and replay holes. Pure + injectable clock so it's unit-tested.
 */
export async function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
  opts: { toleranceSec?: number; nowMs?: number } = {},
): Promise<StripeEvent> {
  if (!secret) throw new Error("missing webhook secret");
  if (!sigHeader) throw new Error("missing stripe-signature header");

  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(",")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) throw new Error("malformed stripe-signature header");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${t}.${payload}`));
  const expected = toHex(mac);
  if (!timingSafeEqual(expected, v1)) throw new Error("signature mismatch");

  const toleranceSec = opts.toleranceSec ?? 300;
  const nowSec = (opts.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) {
    throw new Error("timestamp outside tolerance (replay?)");
  }
  return JSON.parse(payload) as StripeEvent;
}

// ---- Mock ------------------------------------------------------------------

function rand(prefix: string) {
  // No Math.random dependency on server determinism needed here; Workers allow it.
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

class MockStripe implements StripeClient {
  isMock = true;
  async createDepositIntent(args: {
    amountUsdCents: number;
    bookingId: string;
    saveCard: boolean;
  }): Promise<DepositIntent> {
    const id = rand("pi_mock");
    return {
      paymentIntentId: id,
      clientSecret: `${id}_secret_${rand("cs")}`,
      setupClientSecret: args.saveCard ? rand("seti_mock") : null,
      mock: true,
    };
  }
  async retrievePaymentIntent(id: string) {
    return { id, status: "succeeded" };
  }
  async refund(args: { paymentIntentId: string; amountUsdCents: number }) {
    return { id: rand("re_mock"), status: "succeeded" };
  }
  async constructEvent(payload: string): Promise<StripeEvent> {
    return JSON.parse(payload) as StripeEvent;
  }
}

// ---- Real (Stripe REST via fetch) ------------------------------------------

class RealStripe implements StripeClient {
  isMock = false;
  constructor(private secret: string) {}

  private async post(path: string, form: Record<string, string>) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
    });
    if (!res.ok) throw new Error(`stripe ${path}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<any>;
  }

  async createDepositIntent(args: {
    amountUsdCents: number;
    bookingId: string;
    customerEmail?: string;
    saveCard: boolean;
  }): Promise<DepositIntent> {
    const pi = await this.post("payment_intents", {
      amount: String(args.amountUsdCents),
      currency: "usd",
      "metadata[booking_id]": args.bookingId,
      ...(args.saveCard ? { setup_future_usage: "off_session" } : {}),
    });
    return {
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      setupClientSecret: null,
      mock: false,
    };
  }
  async retrievePaymentIntent(id: string) {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${id}`, {
      headers: { Authorization: `Bearer ${this.secret}` },
    });
    const pi = (await res.json()) as any;
    return { id: pi.id, status: pi.status };
  }
  async refund(args: { paymentIntentId: string; amountUsdCents: number }) {
    const re = await this.post("refunds", {
      payment_intent: args.paymentIntentId,
      amount: String(args.amountUsdCents),
    });
    return { id: re.id, status: re.status };
  }
  async constructEvent(payload: string, sig: string | null, secret?: string) {
    // Real keys → verify the HMAC signature and reject forged/replayed events.
    return verifyStripeSignature(payload, sig, secret ?? "");
  }
}

export function getStripe(env: Env): StripeClient {
  return env.STRIPE_SECRET_KEY
    ? new RealStripe(env.STRIPE_SECRET_KEY)
    : new MockStripe();
}
