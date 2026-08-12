import { Link, data } from "react-router";
import type { Route } from "./+types/ops._index";
import { Badge } from "~/components/ops/ui";
import { formatNpr, formatUsd } from "~/lib/pricing";
import { fmtDate } from "~/lib/format";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { cn } from "~/lib/cn";

/**
 * The morning screen.
 *
 * /ops used to bounce straight to the verification queue, which made the
 * first question of every day — "what needs me?" — cost eight page visits to
 * answer. This screen answers it once: every queue with work in it, who is on
 * a mountain right now, who flies soon, and where the money stands. Queues
 * with nothing in them do not appear; an empty dashboard says so in one line
 * instead of rendering eight zeros.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [
    verifs,
    payable,
    incidents,
    flaggedMsgs,
    pendingPhotos,
    proposedEvents,
    readyJournals,
    staleQuestions,
    holds,
    active,
    departing,
    paidThisMonth,
    verifiedGuides,
    bookingsInFlight,
  ] = await Promise.all([
    admin
      .from("guides")
      .select("user_id", { count: "exact", head: true })
      .in("status", ["applied", "in_review"]),
    admin.from("payouts").select("amount_npr_paisa").eq("status", "payable"),
    admin
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .neq("status", "closed"),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .not("flagged_reason", "is", null),
    admin
      .from("offering_photos")
      .select("id", { count: "exact", head: true })
      .eq("approved", false)
      .eq("source", "trekker"),
    admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .in("status", ["proposed", "accepted"]),
    admin
      .from("guide_change_requests")
      .select("id", { count: "exact", head: true })
      .ilike("note", "Journal ready to publish%"),
    // Questions a guide has left hanging for three days: the asker was
    // promised an answer, so the office nudges.
    admin
      .from("guide_questions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString()),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_deposit"),
    // On the trail right now.
    admin
      .from("bookings")
      .select(
        "id, start_date, end_date, party_size, trekker:users(full_name), guide:guides(users(full_name)), offering:offerings(title)",
      )
      .eq("status", "active")
      .order("start_date"),
    // Departing in the next fortnight — the treks whose paperwork has a
    // deadline attached.
    admin
      .from("bookings")
      .select(
        "id, start_date, status, party_size, trekker:users(full_name), guide:guides(users(full_name)), offering:offerings(title)",
      )
      .in("status", ["deposit_paid", "docs_pending", "confirmed"])
      .gte("start_date", today)
      .lte("start_date", soon)
      .order("start_date"),
    admin
      .from("payments")
      .select("amount_usd_cents")
      .eq("status", "succeeded")
      .gte("created_at", monthStart),
    admin
      .from("guides")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "verified"),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending_deposit", "deposit_paid", "docs_pending", "confirmed", "active"]),
  ]);

  const payableNpr = (payable.data ?? []).reduce(
    (n, p: any) => n + (p.amount_npr_paisa ?? 0),
    0,
  );
  const collectedUsd = (paidThisMonth.data ?? []).reduce(
    (n, p: any) => n + (p.amount_usd_cents ?? 0),
    0,
  );

  // The queue list. Order = how quickly each one goes bad if ignored.
  const queues = [
    {
      to: "/ops/incidents",
      label: "Open incidents",
      count: incidents.count ?? 0,
      why: "Someone on a mountain reported a problem.",
    },
    {
      to: "/ops/moderation",
      label: "Flags to review",
      count: (flaggedMsgs.count ?? 0) + (pendingPhotos.count ?? 0),
      why: "Messages and photos waiting on a human eye.",
    },
    {
      to: "/ops/verifications",
      label: "Guides to verify",
      count: verifs.count ?? 0,
      why: "People who applied and are waiting to hear back.",
    },
    {
      to: "/ops/payouts",
      label: "Payouts to send",
      count: (payable.data ?? []).length,
      why: `${formatNpr(payableNpr)} owed to guides for completed treks.`,
    },
    {
      to: "/ops/events",
      label: "Trip proposals",
      count: proposedEvents.count ?? 0,
      why: "Organisers waiting on a yes, or on going live.",
    },
    {
      to: "/ops/journals",
      label: "Journals to publish",
      count: readyJournals.count ?? 0,
      why: "Written up, consent to check, ready to go on a profile.",
    },
    {
      to: "/ops/pipeline",
      label: "Deposits pending",
      count: holds.count ?? 0,
      why: "Accepted bookings whose hold expires if unpaid.",
    },
    {
      to: "/ops/data?table=guide_questions",
      label: "Questions gone quiet",
      count: staleQuestions.count ?? 0,
      why: "Asked over three days ago; the guide may need a text.",
    },
  ].filter((q) => q.count > 0);

  return data(
    {
      today,
      queues,
      active: active.data ?? [],
      departing: departing.data ?? [],
      numbers: {
        verifiedGuides: verifiedGuides.count ?? 0,
        bookingsInFlight: bookingsInFlight.count ?? 0,
        payableNpr,
        collectedUsd,
      },
    },
    { headers },
  );
}

export default function OpsHome({ loaderData }: Route.ComponentProps) {
  const { queues, active, departing, numbers } = loaderData as any;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Today</h1>
        {/* The position, in four numbers. */}
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Num n={numbers.verifiedGuides} label="verified guides" />
          <Num n={numbers.bookingsInFlight} label="bookings in flight" />
          <Num n={formatUsd(numbers.collectedUsd)} label="collected this month" />
          <Num n={formatNpr(numbers.payableNpr)} label="owed to guides" />
        </dl>
      </div>

      {/* ── What needs you ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Needs you
        </h2>
        {queues.length === 0 ? (
          <p className="mt-2 rounded-md border border-line bg-card p-4 text-sm text-ink-soft">
            Nothing waiting. Every queue is clear.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-card">
            {queues.map((q: any) => (
              <li key={q.to}>
                <Link
                  to={q.to}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-mist/60"
                >
                  <span className="min-w-[2.5rem] rounded bg-pine px-2 py-0.5 text-center font-mono text-sm text-paper">
                    {q.count}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{q.label}</span>
                    <span className="block truncate text-xs text-ink-soft">{q.why}</span>
                  </span>
                  <span aria-hidden className="text-primary">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── On the trail ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            On the trail now
          </h2>
          {active.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Nobody is out today.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-card">
              {active.map((b: any) => (
                <li key={b.id}>
                  <Link
                    to={`/ops/bookings/${b.id}`}
                    className="block px-4 py-3 hover:bg-mist/60"
                  >
                    <p className="text-sm font-medium text-ink">
                      {b.offering?.title ?? "Trek"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {b.trekker?.full_name} with {b.guide?.users?.full_name} ·{" "}
                      <DayOfTrek start={b.start_date} end={b.end_date} />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Departing soon ───────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Departing in the next fortnight
          </h2>
          {departing.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No departures inside two weeks.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-card">
              {departing.map((b: any) => (
                <li key={b.id}>
                  <Link
                    to={`/ops/bookings/${b.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-mist/60"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs text-ink">
                      {fmtDate(b.start_date)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {b.offering?.title ?? "Trek"} — {b.trekker?.full_name}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        guide {b.guide?.users?.full_name}
                      </span>
                    </span>
                    <StatusChip status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Num({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="m-0 font-mono text-ink">{typeof n === "number" ? n.toLocaleString("en-US") : n}</dd>
      <dt className="text-ink-soft">{label}</dt>
    </div>
  );
}

/** "Day 4 of 14" — the number that tells you whether to worry. */
function DayOfTrek({ start, end }: { start: string; end: string }) {
  const day =
    Math.floor((Date.now() - Date.parse(start + "T00:00:00Z")) / 86_400_000) + 1;
  const total =
    Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86_400_000) + 1;
  return (
    <span className={cn("font-mono", day > total && "text-ember")}>
      day {Math.max(1, day)} of {total}
      {day > total && " — overdue"}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "confirmed" ? "green" : status === "docs_pending" ? "amber" : "neutral";
  const label =
    status === "deposit_paid"
      ? "deposit paid"
      : status === "docs_pending"
        ? "docs missing"
        : status;
  return <Badge tone={tone as any}>{label}</Badge>;
}
