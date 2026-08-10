import { useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/checkout.$bookingId";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { getStripe } from "~/lib/stripe.server";
import { fulfillDeposit } from "~/lib/booking.server";
import { PriceBreakdown } from "~/components/public/bits";
import { Button } from "~/components/Button";
import { formatUsd } from "~/lib/pricing";
import { instalmentSchedule, maxInstalments } from "~/lib/instalments";

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
  const today = new Date().toISOString().slice(0, 10);
  return data(
    {
      booking: b,
      paymentIntentId: intent.paymentIntentId,
      isMock: intent.mock,
      balance,
      today,
      maxN: maxInstalments(today, b.start_date),
    },
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
  // Persist the chosen instalment plan before fulfilment generates the schedule.
  const instalmentCount = Math.max(1, Math.min(12, Number(form.get("instalment_count") ?? 1)));
  await admin.from("bookings").update({ instalment_count: instalmentCount }).eq("id", b.id);
  await fulfillDeposit(admin, params.bookingId, paymentIntentId);
  return redirect(`/trips/${params.bookingId}`, { headers });
}

export default function Checkout({ loaderData }: Route.ComponentProps) {
  const { booking: b, paymentIntentId, isMock, balance, today, maxN } = loaderData as any;
  const nav = useNavigation();
  const [count, setCount] = useState(1);
  const schedule = instalmentSchedule(balance, count, today, b.start_date);
  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" });
  // Concrete free-cancellation date (v3 §12): 30 days before departure.
  const freeCancelUntil = new Date(new Date(b.start_date + "T00:00:00").getTime() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const inFreeWindow = today <= freeCancelUntil;
  const rows = [
    { label: b.offering?.kind === "trek" ? "Guide fee" : "Experience", usdCents: b.guide_fee_usd_cents },
    ...(b.permit_fees_usd_cents ? [{ label: "Permits", usdCents: b.permit_fees_usd_cents }] : []),
    { label: "Service fee", usdCents: b.service_fee_usd_cents },
    ...(b.permit_handling_usd_cents ? [{ label: "Permit handling", usdCents: b.permit_handling_usd_cents }] : []),
  ];

  const payInFull = balance <= 0;
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-3xl text-ink">
        {payInFull ? "Pay & confirm" : "Pay your deposit"}
      </h1>
      <p className="mt-1 text-ink-soft">{b.offering?.title}</p>

      <div className="mt-6 rounded-card border border-border bg-card p-4">
        <PriceBreakdown rows={rows} total={b.total_usd_cents} />
        {!payInFull && (
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
            <span className="text-ink-soft">Balance</span>
            <span className="font-mono">{formatUsd(balance)}</span>
          </div>
        )}
        <p className="mt-3 border-t border-border pt-3 text-xs text-ink-soft">
          {inFreeWindow
            ? `Free cancellation until ${fmtDate(freeCancelUntil)} — full refund minus card fees.`
            : "Inside 30 days of departure — partial refunds apply if you cancel."}
        </p>
      </div>

      {/* Interest-free instalments — all due before departure (v3 §1d). */}
      {balance > 0 && maxN > 1 && (
        <div className="mt-4 rounded-card border border-border bg-card p-4">
          <p className="text-sm font-medium text-ink">Split the balance — interest-free</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Pay the {formatUsd(b.deposit_usd_cents)} deposit now, then the rest in equal payments,
            all before you depart. No interest, ever.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: maxN }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={
                  "rounded-full px-3 py-1 text-sm " +
                  (count === n ? "bg-primary text-white" : "border border-border text-ink hover:bg-mist")
                }
              >
                {n === 1 ? "1 payment" : `${n}×`}
              </button>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {schedule.map((it) => (
              <li key={it.seq} className="flex justify-between">
                <span className="text-ink-soft">Payment {it.seq} · {fmtDate(it.dueDate)}</span>
                <span className="font-mono">{formatUsd(it.amountUsdCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Form method="post" className="mt-6">
        <input type="hidden" name="payment_intent_id" value={paymentIntentId} />
        <input type="hidden" name="instalment_count" value={count} />
        {isMock && (
          <p className="mb-2 rounded-button bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Test mode — no real card charged. Add Stripe keys to take live payments.
          </p>
        )}
        <Button type="submit" size="lg" loading={nav.state !== "idle"} className="w-full">
          {payInFull
            ? `Pay ${formatUsd(b.total_usd_cents)}`
            : `Pay ${formatUsd(b.deposit_usd_cents)} deposit`}
        </Button>
      </Form>
      <p className="mt-2 text-center text-xs text-ink-soft">
        {payInFull
          ? "That's everything — you're confirmed the moment payment goes through."
          : `The balance of ${formatUsd(balance)} is charged automatically 14 days before you start.`}
      </p>
    </main>
  );
}
