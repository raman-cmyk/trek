import type { Route } from "./+types/api.webhooks.stripe";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getStripe } from "~/lib/stripe.server";
import { fulfillDeposit } from "~/lib/booking.server";
import { shouldFulfilDeposit } from "~/lib/card-payment";

// Stripe webhook (docs/02). Deposit success → booking deposit_paid + calendar
// booked + notifications. Idempotent via fulfillDeposit.
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const stripe = getStripe(env);
  // MockStripe can't verify signatures — with no real keys this route would
  // accept any payload and hand out free bookings. Mock checkout self-confirms,
  // so the webhook simply doesn't exist until real Stripe keys are set.
  if (stripe.isMock) return new Response("not found", { status: 404 });
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event;
  try {
    event = await stripe.constructEvent(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    // A group member's share carries the same booking id as the deposit does.
    // Fulfilling on one would confirm the whole trip for everybody — see
    // shouldFulfilDeposit. Shares are credited by the group payment action.
    if (shouldFulfilDeposit(pi.metadata)) {
      const admin = createAdminClient(env);
      await fulfillDeposit(admin, pi.metadata!.booking_id as string, pi.id);
    }
  }
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

// Webhooks are POST-only.
export function loader() {
  return new Response("Method not allowed", { status: 405 });
}
