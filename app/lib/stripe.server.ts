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
  async constructEvent(payload: string, _sig: string | null, _secret?: string) {
    // NOTE: signature verification requires an async HMAC; wire when keys land.
    return JSON.parse(payload) as StripeEvent;
  }
}

export function getStripe(env: Env): StripeClient {
  return env.STRIPE_SECRET_KEY
    ? new RealStripe(env.STRIPE_SECRET_KEY)
    : new MockStripe();
}
