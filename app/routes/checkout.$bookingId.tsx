import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/checkout.$bookingId";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { getStripe } from "~/lib/stripe.server";
import { fulfillDeposit } from "~/lib/booking.server";
import { PriceBreakdown } from "~/components/public/bits";
import { Button } from "~/components/Button";
import { formatUsd } from "~/lib/pricing";

export function meta() {
  return [{ title: "Pay your deposit" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, total_usd_cents, deposit_usd_cents, guide_fee_usd_cents, permit_fees_usd_cents, service_fee_usd_cents, permit_handling_usd_cents, start_date, offering:offerings(title, kind)",
    )
    .eq("id", params.bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });
  if (b.status !== "pending_deposit") throw redirect(`/trips/${b.id}`, { headers });

  const stripe = getStripe(env);
  const intent = await stripe.createDepositIntent({
    amountUsdCents: b.deposit_usd_cents,
    bookingId: b.id,
    saveCard: true,
  });

  const balance = b.total_usd_cents - b.deposit_usd_cents;
  return data(
    { booking: b, paymentIntentId: intent.paymentIntentId, isMock: intent.mock, balance },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const form = await request.formData();
  const paymentIntentId = String(form.get("payment_intent_id"));

  // Confirm ownership, then confirm the (mock) payment succeeded and fulfill.
  const { data: b } = await admin
    .from("bookings")
    .select("id")
    .eq("id", params.bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });

  const stripe = getStripe(env);
  const pi = await stripe.retrievePaymentIntent(paymentIntentId);
  if (pi.status !== "succeeded") {
    return data({ error: "Payment didn’t complete. Try again." }, { status: 400 });
  }
  await fulfillDeposit(admin, params.bookingId, paymentIntentId);
  return redirect(`/trips/${params.bookingId}`, { headers });
}

export default function Checkout({ loaderData }: Route.ComponentProps) {
  const { booking: b, paymentIntentId, isMock, balance } = loaderData as any;
  const nav = useNavigation();
  const rows = [
    { label: b.offering?.kind === "trek" ? "Guide fee" : "Experience", usdCents: b.guide_fee_usd_cents },
    ...(b.permit_fees_usd_cents ? [{ label: "Permits", usdCents: b.permit_fees_usd_cents }] : []),
    { label: "Service fee", usdCents: b.service_fee_usd_cents },
    ...(b.permit_handling_usd_cents ? [{ label: "Permit handling", usdCents: b.permit_handling_usd_cents }] : []),
  ];

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-3xl text-ink">Pay your deposit</h1>
      <p className="mt-1 text-ink-soft">{b.offering?.title}</p>

      <div className="mt-6 rounded-card border border-border bg-card p-4">
        <PriceBreakdown rows={rows} total={b.total_usd_cents} />
        <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
          <span className="text-ink-soft">Balance on {b.start_date}</span>
          <span>{formatUsd(balance)}</span>
        </div>
      </div>

      <Form method="post" className="mt-6">
        <input type="hidden" name="payment_intent_id" value={paymentIntentId} />
        {isMock && (
          <p className="mb-2 rounded-button bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Test mode — no real card charged. Add Stripe keys to take live payments.
          </p>
        )}
        <Button type="submit" size="lg" loading={nav.state !== "idle"} className="w-full">
          Pay {formatUsd(b.deposit_usd_cents)} deposit
        </Button>
      </Form>
      <p className="mt-2 text-center text-xs text-ink-soft">
        The balance of {formatUsd(balance)} is charged automatically 14 days before you start.
      </p>
    </main>
  );
}
