/**
 * Collecting the card, and agreeing what happened afterwards.
 *
 * Until now nothing in this application ever asked anybody for a card. The
 * checkout created a PaymentIntent, drew a button, and on submit asked Stripe
 * whether that intent had succeeded. With the mock client it always had, so
 * the flow looked finished. With real keys it never would: an intent nobody
 * has paid sits at `requires_payment_method` forever, so the one thing adding
 * a secret key would have achieved is a checkout that says "Payment didn't
 * complete. Try again." to everyone, permanently.
 *
 * The missing half is the card field. What lives here is the part of it that
 * can be got wrong without a browser noticing:
 *
 *   - whether the card step can run at all, said as a problem a person could
 *     act on rather than a boolean;
 *   - what a PaymentIntent's status means, in one place, so the browser and
 *     the server cannot reach different conclusions about the same payment.
 *
 * That second one matters more than it looks. The server is the only opinion
 * that moves money — it re-reads the intent from Stripe before it fulfils
 * anything, and it should, because the browser is not trustworthy about
 * whether it paid. But when the two disagree about a status the trekker is
 * the one who suffers: the card is charged, the page says it failed, and they
 * pay twice. One function, both callers.
 */

/** What to do about a payment, given the state Stripe reports it is in. */
export type PaymentOutcome =
  /** Money is ours (or authorised and held). Fulfil the booking. */
  | "fulfil"
  /** No card yet. Show the field and ask. */
  | "collect"
  /** Stripe is still deciding. Do not fulfil, do not ask again. */
  | "wait"
  /** This intent is finished and did not pay. A new one is needed. */
  | "dead";

/**
 * A Stripe PaymentIntent status, reduced to what this application does next.
 *
 * `requires_capture` counts as paid because it means an authorisation is held
 * — which is precisely the deposit model in CLAUDE.md. It cannot arise today
 * (nothing sets `capture_method: manual`), and it is mapped here rather than
 * left to a later reader who would meet it as a payment that vanished.
 */
export function outcomeOfStatus(status: string | null | undefined): PaymentOutcome {
  switch (String(status ?? "")) {
    case "succeeded":
    case "requires_capture":
      return "fulfil";
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      return "collect";
    case "processing":
      return "wait";
    case "canceled":
      return "dead";
    default:
      // An unknown status is not an invitation to guess about money.
      return "wait";
  }
}

/** Does this status mean the booking may be fulfilled? The server's question. */
export function isPaid(status: string | null | undefined): boolean {
  return outcomeOfStatus(status) === "fulfil";
}

export interface CardStepInputs {
  /** True when there is no STRIPE_SECRET_KEY and the server faked the intent. */
  isMock: boolean;
  /** Needed by the browser to talk to Stripe at all. */
  publishableKey: string | null | undefined;
  /** Identifies this one payment to Stripe.js. */
  clientSecret: string | null | undefined;
}

/**
 * Why the card field cannot be shown, in words, or null when it can.
 *
 * Every branch here is a misconfiguration rather than a trekker's mistake, so
 * each one says what is wrong AND that no money has moved. A checkout that
 * quietly draws nothing where the card should be is the failure this whole
 * module exists to prevent — somebody would read it as "already paid".
 */
export function cardStepProblem(inputs: CardStepInputs): string | null {
  if (inputs.isMock) {
    return "Card payments are not switched on yet, so nothing can be charged. Nobody has been billed.";
  }
  if (!inputs.publishableKey) {
    return "Card payments are half configured — the key the browser needs is missing. Nobody has been billed.";
  }
  if (!inputs.clientSecret) {
    return "This payment could not be started. Nobody has been billed.";
  }
  return null;
}

/** Can the browser mount a card field right now? */
export function canCollectCard(inputs: CardStepInputs): boolean {
  return cardStepProblem(inputs) === null;
}

/**
 * A Stripe failure as a person should read it.
 *
 * Stripe's own `message` is written for the payer and is usually better than
 * anything invented here ("Your card was declined."), so it is preferred when
 * present. The fallback is the case that actually strands people: a network
 * that dropped mid-confirm, where the worst thing to say is nothing.
 */
export function payErrorMessage(err: { message?: string | null } | null | undefined): string {
  const m = typeof err?.message === "string" ? err.message.trim() : "";
  if (m) return m;
  return "The payment could not be completed. Your card has not been charged — please try again.";
}
