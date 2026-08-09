import { data } from "react-router";
import type { Route } from "./+types/g.earnings";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { formatNpr } from "~/lib/pricing";
import { Badge } from "~/components/ops/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { data: payouts } = await admin
    .from("payouts")
    .select("id, amount_npr_paisa, status, paid_at, booking:bookings(offering:offerings(title), end_date)")
    .eq("guide_id", user.id)
    .order("status");
  return data({ payouts: payouts ?? [] }, { headers });
}

export default function GuideEarnings({ loaderData }: Route.ComponentProps) {
  const payouts = loaderData.payouts as any[];
  const payable = payouts.filter((p) => p.status === "payable");
  const paid = payouts.filter((p) => p.status === "paid");
  const payableTotal = payable.reduce((s, p) => s + p.amount_npr_paisa, 0);
  const paidTotal = paid.reduce((s, p) => s + p.amount_npr_paisa, 0);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink">Earnings</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-primary bg-primary/5 p-4">
          <p className="text-xs text-ink-soft">To be paid</p>
          <p className="mt-1 text-xl font-medium text-ink">{formatNpr(payableTotal)}</p>
        </div>
        <div className="rounded-card border border-border bg-card p-4">
          <p className="text-xs text-ink-soft">Paid so far</p>
          <p className="mt-1 text-xl font-medium text-ink">{formatNpr(paidTotal)}</p>
        </div>
      </div>

      <p className="rounded-card bg-surface p-3 text-sm text-ink-soft">
        You keep 85% of every guide fee — our 15% covers the customer, permits
        and payments.
      </p>

      {payouts.length === 0 ? (
        <p className="text-sm text-ink-soft">No earnings yet — your first trip will show here.</p>
      ) : (
        <ul className="space-y-2">
          {payouts.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-card border border-border bg-card p-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {p.booking?.offering?.title ?? "Trip"}
                </p>
                <p className="text-xs text-ink-soft">{p.booking?.end_date}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatNpr(p.amount_npr_paisa)}</p>
                <Badge tone={p.status === "paid" ? "green" : "amber"}>
                  {p.status}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
