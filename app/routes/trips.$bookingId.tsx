import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/trips.$bookingId";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { getStripe } from "~/lib/stripe.server";
import { cancelBooking } from "~/lib/booking.server";
import { formatUsd } from "~/lib/pricing";
import { cn } from "~/lib/cn";

const STEPS = [
  ["pending_deposit", "Deposit due"],
  ["deposit_paid", "Deposit paid"],
  ["docs_pending", "Documents"],
  ["confirmed", "Confirmed"],
  ["active", "On the trail"],
  ["completed", "Completed"],
] as const;

export function meta() {
  return [{ title: "Your trip" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, party_size, total_usd_cents, deposit_usd_cents, offering:offerings(title), guide:guides(slug, users(full_name))",
    )
    .eq("id", params.bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });
  const { data: payments } = await admin
    .from("payments")
    .select("type, amount_usd_cents, status, created_at")
    .eq("booking_id", b.id)
    .order("created_at");
  return data({ booking: b, payments: payments ?? [] }, { headers });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const { data: owned } = await admin
    .from("bookings")
    .select("id")
    .eq("id", params.bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!owned) throw new Response("Not found", { status: 404 });
  const outcome = await cancelBooking(admin, getStripe(env), params.bookingId, "trekker");
  return data({ cancelled: true, refund: outcome.refundToTrekkerUsdCents }, { headers });
}

export default function TripDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { booking: b, payments } = loaderData as any;
  const nav = useNavigation();
  const cancelled = b.status.startsWith("cancelled");
  const activeIdx = STEPS.findIndex((s) => s[0] === b.status);

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Link to="/" className="text-sm text-primary">
        ← Home
      </Link>
      <h1 className="mt-2 font-display text-2xl text-ink">{b.offering?.title}</h1>
      <p className="text-ink-soft">
        with {b.guide?.users?.full_name} · {b.start_date} → {b.end_date} ·{" "}
        {b.party_size}p
      </p>

      {actionData && "cancelled" in actionData && (
        <div className="mt-4 rounded-card bg-amber-50 p-3 text-sm text-amber-800">
          Booking cancelled. Refund of {formatUsd((actionData as any).refund)} is on
          its way.
        </div>
      )}

      {b.status === "pending_deposit" && !cancelled && (
        <Link
          to={`/checkout/${b.id}`}
          className="mt-5 block rounded-button bg-primary px-4 py-3 text-center font-medium text-white"
        >
          Pay {formatUsd(b.deposit_usd_cents)} deposit
        </Link>
      )}

      {/* Status timeline */}
      {!cancelled ? (
        <ol className="mt-6 space-y-3">
          {STEPS.map(([key, label], i) => {
            const done = activeIdx >= 0 && i <= activeIdx;
            return (
              <li key={key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    done ? "bg-accent text-white" : "bg-border text-ink-soft",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={cn("text-sm", i === activeIdx && "font-medium text-ink")}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-6 rounded-card bg-surface p-3 text-sm text-ink-soft">
          This booking was cancelled.
        </p>
      )}

      {/* Payments */}
      {payments.length > 0 && (
        <section className="mt-6">
          <p className="mb-2 text-sm font-medium text-ink">Payments</p>
          <ul className="space-y-1 text-sm">
            {payments.map((p: any, i: number) => (
              <li key={i} className="flex justify-between">
                <span className="capitalize text-ink-soft">{p.type}</span>
                <span>{formatUsd(p.amount_usd_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!cancelled && ["pending_deposit", "deposit_paid"].includes(b.status) && (
        <Form method="post" className="mt-8">
          <button
            className="text-sm text-danger hover:underline"
            disabled={nav.state !== "idle"}
          >
            Cancel this booking
          </button>
        </Form>
      )}
    </main>
  );
}
