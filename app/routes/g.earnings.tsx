import { Link, data } from "react-router";
import type { Route } from "./+types/g.earnings";
import { copy } from "~/lib/copy";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { formatNpr } from "~/lib/pricing";
import { fmtDate } from "~/lib/format";
import { Badge } from "~/components/ops/ui";

/**
 * The money page, answering the question a guide actually plans a life
 * around: not only "what am I owed" but "what is this season going to pay".
 *
 * Three numbers, in the order they become real:
 *
 *   booked   — treks with dates in the calendar that have not finished.
 *              This is the season ahead, and it is what a guide weighs a
 *              private client against when one calls offering cash.
 *   owed     — treks finished, payout created, money on its way.
 *   paid     — money that has landed, running total for the year.
 *
 * Every number traces to a listed trek below it, because a total nobody can
 * check is a number nobody trusts — the same rule as the public price
 * breakdown.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");

  const [{ data: payouts }, { data: upcoming }] = await Promise.all([
    admin
      .from("payouts")
      .select(
        "id, amount_npr_paisa, status, paid_at, booking:bookings(offering:offerings(title), end_date)",
      )
      .eq("guide_id", user.id)
      .order("created_at", { ascending: false }),
    // The season ahead: accepted work that has not completed. pending_deposit
    // is excluded on purpose — money is not real until a deposit lands.
    admin
      .from("bookings")
      .select(
        "id, start_date, end_date, status, party_size, guide_payout_npr_paisa, offering:offerings(title), trekker:users(full_name)",
      )
      .eq("guide_id", user.id)
      .in("status", ["deposit_paid", "docs_pending", "confirmed", "active"])
      .order("start_date"),
  ]);

  return data({ payouts: payouts ?? [], upcoming: upcoming ?? [] }, { headers });
}

export default function GuideEarnings({ loaderData }: Route.ComponentProps) {
  const { payouts, upcoming } = loaderData as any;
  const payable = payouts.filter((p: any) => p.status === "payable");
  const paid = payouts.filter((p: any) => p.status === "paid");

  const bookedTotal = upcoming.reduce(
    (s: number, b: any) => s + (b.guide_payout_npr_paisa ?? 0),
    0,
  );
  const payableTotal = payable.reduce((s: number, p: any) => s + p.amount_npr_paisa, 0);
  const yearStart = new Date().getFullYear() + "-01-01";
  const paidThisYear = paid
    .filter((p: any) => (p.paid_at ?? "") >= yearStart)
    .reduce((s: number, p: any) => s + p.amount_npr_paisa, 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink">Your money</h1>

      <div className="grid grid-cols-3 gap-2">
        <Sum label="Booked" note="season ahead" npr={bookedTotal} />
        <Sum label="Owed" note="on its way" npr={payableTotal} highlight={payableTotal > 0} />
        <Sum label="Paid" note={`in ${new Date().getFullYear()}`} npr={paidThisYear} />
      </div>

      <p className="rounded-card bg-surface p-3 text-sm text-ink-soft">
        {copy.guide.earningsExplainer} Paid within 7 days of each trek ending.
      </p>

      {/* ── The season ahead ─────────────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Coming up
          </h2>
          <ul className="mt-2 space-y-2">
            {upcoming.map((b: any) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {b.offering?.title ?? "Trek"}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {fmtDate(b.start_date)} · {b.trekker?.full_name?.split(" ")[0] ?? "client"} ·{" "}
                    {b.party_size}p
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm text-ink">
                  {b.guide_payout_npr_paisa ? formatNpr(b.guide_payout_npr_paisa) : "—"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Finished treks ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Finished treks
        </h2>
        {payouts.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            Your first payout appears here when your first trek ends.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {payouts.map((p: any) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {p.booking?.offering?.title ?? "Trip"}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {p.status === "paid" && p.paid_at
                      ? `paid ${fmtDate(p.paid_at)}`
                      : `ended ${fmtDate(p.booking?.end_date)}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm">{formatNpr(p.amount_npr_paisa)}</p>
                  <Badge tone={p.status === "paid" ? "green" : "amber"}>
                    {p.status === "payable" ? "on its way" : p.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-sm">
        <Link to="/g/calendar" className="text-primary hover:underline">
          Open more days to take more work →
        </Link>
      </p>
    </div>
  );
}

function Sum({
  label,
  note,
  npr,
  highlight,
}: {
  label: string;
  note: string;
  npr: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-card border border-primary bg-primary/5 p-3"
          : "rounded-card border border-border bg-card p-3"
      }
    >
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 font-mono text-[15px] leading-tight text-ink">{formatNpr(npr)}</p>
      <p className="mt-0.5 text-[10px] text-ink-soft">{note}</p>
    </div>
  );
}
