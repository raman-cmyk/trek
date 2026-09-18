import { Link, data } from "react-router";
import type { Route } from "./+types/ops.cancellations";
import { Panel, Badge, EmptyRow } from "~/components/ops/ui";
import { StatusTabs } from "~/components/ops/StatusTabs";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { rows } from "~/lib/ops.server";
import { applyFilter, countsFor, resolveKey } from "~/lib/status-filter";
import { CANCELLATION_FILTERS } from "~/lib/ops-filters";
import { REASON_TONE, reasonLabel, refundTotals, whoCancelled } from "~/lib/cancellations";
import { fmtDateShort as fmtDate } from "~/lib/format";
import { formatUsd } from "~/lib/pricing";

/**
 * Every trip that died, and what it cost.
 *
 * Cancellations were ejected from the board on purpose — `columnFor` returns
 * null for them — and landed nowhere. The only trace anywhere in the admin
 * area was a row of red badges at the foot of the pipeline with no name, no
 * date, no refund and nothing to click. Twelve trips have been cancelled and
 * the office could not tell you when, why, or how much went back.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);

  // `users!bookings_trekker_id_fkey` is not optional: bookings has five
  // foreign keys to users, so an unqualified embed makes PostgREST refuse the
  // whole query and this page would render as "no cancellations" on a site
  // with twelve. embeds.test.ts fails the build for it.
  const cancelled = await rows<any>(
    admin
      .from("bookings")
      .select(
        "id, status, start_date, end_date, party_size, total_usd_cents, " +
          "cancellation_reason, cancelled_at, updated_at, " +
          "trekker:users!bookings_trekker_id_fkey(id, full_name), " +
          "canceller:users!bookings_cancelled_by_fkey(full_name), " +
          "guide:guides!bookings_guide_id_fkey(user_id, users(full_name)), " +
          "offering:offerings(title, kind)",
      )
      .like("status", "cancelled%")
      .order("cancelled_at", { ascending: false, nullsFirst: false }),
    "the cancelled trips",
  );

  const ids = cancelled.rows.map((b) => b.id);
  const refunds =
    ids.length > 0
      ? await rows<any>(
          admin
            .from("payments")
            .select("booking_id, amount_usd_cents")
            .eq("type", "refund")
            .eq("status", "succeeded")
            .in("booking_id", ids),
          "the refunds",
        )
      : { rows: [] as any[], error: null };

  const filter = resolveKey(
    CANCELLATION_FILTERS,
    new URL(request.url).searchParams.get("reason"),
  );
  const reasonOf = (b: any) => String(b.cancellation_reason ?? "");

  return data(
    {
      bookings: applyFilter(cancelled.rows, CANCELLATION_FILTERS, filter, reasonOf),
      counts: countsFor(cancelled.rows, CANCELLATION_FILTERS, reasonOf),
      refunds: refundTotals(refunds.rows),
      filter,
      loadError: cancelled.error ?? refunds.error,
    },
    { headers },
  );
}

export default function OpsCancellations({ loaderData }: Route.ComponentProps) {
  const { bookings, counts, refunds, filter, loadError } = loaderData as any;
  const refunded = (bookings as any[]).reduce(
    (sum, b) => sum + (refunds[b.id] ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-ink">Cancellations</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Trips that did not happen, and what went back. Sorted by the reason
          rather than the status, because a trip auto-cancelled for an unpaid
          balance is recorded as the trekker's — the reason is the only place
          the two are told apart.
        </p>
      </div>

      {/* An empty list on this page must never be able to mean "the query
          failed", which is exactly what it meant on three other ops screens. */}
      {loadError && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {loadError}
        </p>
      )}

      <StatusTabs filters={CANCELLATION_FILTERS} current={filter} counts={counts} param="reason" />

      <Panel
        title={`${bookings.length} ${bookings.length === 1 ? "trip" : "trips"}${
          refunded > 0 ? ` · ${formatUsd(refunded)} refunded` : ""
        }`}
      >
        {bookings.length === 0 ? (
          <EmptyRow>
            {loadError ? "Nothing to show — the read above failed." : "No cancellations here."}
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {(bookings as any[]).map((b) => {
              const who = whoCancelled(b.cancellation_reason);
              const refund = refunds[b.id] ?? 0;
              return (
                <li key={b.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <Link
                        to={`/ops/bookings/${b.id}`}
                        className="font-medium text-ink hover:text-primary hover:underline"
                      >
                        {b.offering?.title ?? "A trip"}
                      </Link>
                      <p className="text-xs text-ink-soft">
                        {[
                          b.trekker?.full_name,
                          b.guide?.users?.full_name
                            ? `with ${b.guide.users.full_name}`
                            : null,
                          b.start_date ? fmtDate(b.start_date) : null,
                          b.party_size
                            ? `${b.party_size} ${b.party_size === 1 ? "person" : "people"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={REASON_TONE[who]}>
                        {reasonLabel(b.status, b.cancellation_reason)}
                      </Badge>
                      <span className="font-mono text-xs text-ink">
                        {refund > 0 ? formatUsd(refund) : "—"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {b.cancelled_at ? (
                      <>Cancelled {fmtDate(b.cancelled_at)}</>
                    ) : (
                      // 0108 backfilled these, so this should not appear.
                      <>Cancelled around {fmtDate(b.updated_at)} — never stamped</>
                    )}
                    {b.canceller?.full_name
                      ? ` by ${b.canceller.full_name}`
                      : who === "platform"
                        ? " automatically"
                        : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
