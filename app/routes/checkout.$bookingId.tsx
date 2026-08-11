import { useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/checkout.$bookingId";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { getStripe } from "~/lib/stripe.server";
import { fulfillDeposit } from "~/lib/booking.server";
import { PriceBreakdown } from "~/components/public/bits";
import { Button } from "~/components/Button";
import { computeDeposit } from "~/lib/pricing";
import { useMoney } from "~/lib/currency-context";
import { instalmentSchedule, maxInstalments } from "~/lib/instalments";

export function meta() {
  return [{ title: "Pay your deposit" }, { name: "robots", content: "noindex" }];
}

const BOOKING_COLS =
  "id, status, total_usd_cents, deposit_usd_cents, guide_fee_usd_cents, porter_fee_usd_cents, permit_fees_usd_cents, service_fee_usd_cents, permit_handling_usd_cents, logistics_usd_cents, fund_usd_cents, start_date, offering:offerings(title, kind)";

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const { data: b } = await admin
    .from("bookings")
    .select(BOOKING_COLS)
    .eq("id", params.bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });
  if (b.status !== "pending_deposit") throw redirect(`/trips/${b.id}`, { headers });

  const today = new Date().toISOString().slice(0, 10);

  // Re-quote the deposit at TODAY's distance to departure (audit B5): a quote
  // accepted at T-20 (30% deposit) but paid at T-9 must be full payment now,
  // or the trekker pays 30% and is instantly auto-cancelled at a punitive band.
  if ((b as any).offering?.kind === "trek") {
    const dueNow = computeDeposit(b.total_usd_cents, daysBetween(today, b.start_date));
    if (dueNow > b.deposit_usd_cents) {
      await admin.from("bookings").update({ deposit_usd_cents: dueNow }).eq("id", b.id);
      b.deposit_usd_cents = dueNow;
    }
  }

  const stripe = getStripe(env);
  const intent = await stripe.createDepositIntent({
    amountUsdCents: b.deposit_usd_cents,
    bookingId: b.id,
    saveCard: true,
  });

  const balance = b.total_usd_cents - b.deposit_usd_cents;
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
    .select("id, start_date")
    .eq("id", params.bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });

  const stripe = getStripe(env);
  const pi = await stripe.retrievePaymentIntent(paymentIntentId);
  if (pi.status !== "succeeded") {
    return data({ error: "Payment didn’t complete. Try again." }, { status: 400 });
  }
  // Persist the chosen plan — clamped to what actually FITS before departure
  // (audit B6), NaN-safe. The picker offers the same bound; this guards POSTs.
  const today = new Date().toISOString().slice(0, 10);
  const maxN = maxInstalments(today, b.start_date);
  const raw = Number(form.get("instalment_count"));
  const instalmentCount = Number.isFinite(raw)
    ? Math.max(1, Math.min(maxN, Math.floor(raw)))
    : 1;
  await admin.from("bookings").update({ instalment_count: instalmentCount }).eq("id", b.id);
  await fulfillDeposit(admin, params.bookingId, paymentIntentId);
  const { notifyDepositPaid } = await import("~/lib/notifications.server");
  await notifyDepositPaid(env, admin, params.bookingId);
  return redirect(`/trips/${params.bookingId}`, { headers });
}

export default function Checkout({ loaderData, actionData }: Route.ComponentProps) {
  const { booking: b, paymentIntentId, isMock, balance, today, maxN } = loaderData as any;
  const nav = useNavigation();
  const { m } = useMoney();
  const [count, setCount] = useState(1);
  const schedule = instalmentSchedule(balance, count, today, b.start_date);
  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  // Concrete free-cancellation date (v3 §12): 30 days before departure.
  // UTC throughout so SSR and the client agree (audit P6.2).
  const start = new Date(b.start_date + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 30);
  const freeCancelUntil = start.toISOString().slice(0, 10);
  const inFreeWindow = today <= freeCancelUntil;
  // Every line the total is made of (audit B2) — nothing invisible.
  const isTrek = b.offering?.kind === "trek";
  const rows = [
    { label: isTrek ? "Guide fee" : "Experience", usdCents: b.guide_fee_usd_cents },
    ...(b.porter_fee_usd_cents ? [{ label: "Porters", usdCents: b.porter_fee_usd_cents }] : []),
    ...(b.permit_fees_usd_cents ? [{ label: "Permits", usdCents: b.permit_fees_usd_cents }] : []),
    ...(b.logistics_usd_cents ? [{ label: "Teahouse, food & logistics", usdCents: b.logistics_usd_cents }] : []),
    { label: isTrek ? "Trek fee" : "Service fee", usdCents: b.service_fee_usd_cents },
    ...(b.fund_usd_cents ? [{ label: "The Fund (3%)", usdCents: b.fund_usd_cents }] : []),
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
            <span className="font-mono">{m(balance)}</span>
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
            Pay the {m(b.deposit_usd_cents)} deposit now, then the rest in equal payments,
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
                <span className="font-mono">{m(it.amountUsdCents)}</span>
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
        {actionData && "error" in actionData && (actionData as any).error && (
          <p className="mb-2 rounded-button bg-ember/10 px-3 py-2 text-sm text-ember">
            {(actionData as any).error}
          </p>
        )}
        <Button type="submit" size="lg" loading={nav.state !== "idle"} className="w-full">
          {payInFull
            ? `Pay ${m(b.total_usd_cents)}`
            : `Pay ${m(b.deposit_usd_cents)} deposit`}
        </Button>
      </Form>
      <p className="mt-2 text-center text-xs text-ink-soft">
        {payInFull
          ? "That's everything — you're confirmed the moment payment goes through."
          : `The balance of ${m(balance)} is charged automatically 14 days before you start.`}
      </p>
      <p className="mt-1 text-center text-xs text-ink-soft">
        Charged in USD — other currencies shown are approximate.
      </p>
    </main>
  );
}
