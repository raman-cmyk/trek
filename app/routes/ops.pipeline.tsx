import { Form, Link, data, useSearchParams } from "react-router";
import type { Route } from "./+types/ops.pipeline";
import { Badge } from "~/components/ops/ui";
import { formatUsd } from "~/lib/pricing";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { rows, write } from "~/lib/ops.server";
import { createPayoutForBooking } from "~/lib/booking.server";
import {
  BOARDS,
  COLUMN_LABELS,
  COLUMN_NOTES,
  boardFor,
  byColumn,
  type BoardKey,
} from "~/lib/ops-pipeline";

// The next status a booking advances to (walk it through every state).
const NEXT: Record<string, string | null> = {
  pending_deposit: "deposit_paid",
  deposit_paid: "docs_pending",
  docs_pending: "confirmed",
  confirmed: "active",
  active: "completed",
  completed: null,
};

// Timestamp columns to stamp as a booking advances. NOTE: advancing to
// `confirmed` does NOT stamp balance_paid_at — confirming a booking is not
// the same as its balance having been charged (audit finding).
const STAMP: Record<string, string | undefined> = {
  deposit_paid: "deposit_paid_at",
  completed: "completed_confirmed_at",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  // Through `rows` rather than a bare destructure: this board reported an
  // empty pipeline on a platform with thirty-five live bookings, and it could
  // not say why, because the reason was discarded one line after it arrived.
  //
  // permit_applications comes along because the board now has a column the
  // booking's own status cannot fill: a trek is `confirmed` from the moment
  // its papers are verified until the day it walks, so only the applications
  // say whether anyone has filed a permit.
  const bookings = await rows<any>(
    admin
      .from("bookings")
      .select(
        "id, status, start_date, end_date, party_size, total_usd_cents, trekker:users!bookings_trekker_id_fkey(full_name, country_code), guide:guides(users(full_name)), offering:offerings(title, kind), permit_applications(status)",
      )
      .order("start_date"),
    "the bookings",
  );
  return data({ bookings: bookings.rows, loadError: bookings.error }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const id = String(form.get("bookingId"));
  const next = String(form.get("next"));
  const reason = String(form.get("reason") ?? "");

  // The move used to be whatever `next` the form carried, with no whitelist:
  // the only bound was the database's check constraint, so a card could go
  // from "pending deposit" straight to "completed" and the booking would say
  // a trek nobody paid for was finished.
  //
  // Now the facts decide. Their own answer is always allowed and so is
  // anything behind it — putting a card back is how a mistake is undone —
  // and jumping ahead of them needs a written reason, because in six months
  // the question will be who did that.
  const { statusFacts } = await import("~/lib/booking-status.server");
  const { moveProblem } = await import("~/lib/booking-status");
  const facts = await statusFacts(admin, id);
  if (!facts) return data({ error: "That booking is gone." }, { status: 404, headers });
  const problem = moveProblem(next, facts, reason);
  if (problem) return data({ error: problem }, { status: 400, headers });

  const patch: Record<string, unknown> = { status: next };
  if (reason.trim()) {
    patch.status_override_reason = reason.trim().slice(0, 600);
    patch.status_override_at = new Date().toISOString();
  }
  const stamp = STAMP[next];
  if (stamp) patch[stamp] = new Date().toISOString();
  // Looked at, not fired and forgotten. A refused update used to reload the
  // board unchanged, which reads to the person clicking as a button that does
  // nothing — so they click it again.
  const moved = await write(
    admin.from("bookings").update(patch).eq("id", id),
    `moving this booking to ${COLUMN_LABELS[next] ?? next}`,
  );
  if (!moved.ok) return data({ error: moved.error }, { status: 500, headers });
  // Completion is when the guide gets paid — record the payout ledger row.
  if (next === "completed") await createPayoutForBooking(admin, id);
  return data({ ok: true }, { headers });
}

export default function OpsPipeline({ loaderData, actionData }: Route.ComponentProps) {
  const bookings = loaderData.bookings as any[];
  const loadError = (loaderData as any).loadError as string | null;
  const actionError = (actionData as any)?.error as string | null | undefined;
  const [params] = useSearchParams();

  const board: BoardKey = params.get("board") === "day" ? "day" : "treks";
  const def = BOARDS.find((b) => b.key === board)!;
  const columns = byColumn(bookings, board);

  // Counted from the same rule that places the cards, so a tab can never
  // advertise a number its board does not show.
  const liveOn = (key: BoardKey) =>
    Object.values(byColumn(bookings, key)).reduce((n, list) => n + list.length, 0);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Booking pipeline</h1>

      {/* Two boards, because a momo crawl and fourteen days to Everest do not
          have the same steps and one board has to name its columns vaguely
          enough to cover both. Plain links, so this survives a reload and can
          be bookmarked. */}
      <div className="flex flex-wrap gap-2">
        {BOARDS.map((b) => {
          const on = b.key === board;
          return (
            <Link
              key={b.key}
              to={`?board=${b.key}`}
              className={
                "rounded-md border px-3 py-2 text-sm transition " +
                (on
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-ink-soft hover:border-primary/50 hover:text-ink")
              }
            >
              <span className="font-medium">{b.label}</span>
              <span className="ml-2 text-xs opacity-70">{liveOn(b.key)}</span>
              <span className="block text-[11px] opacity-70">{b.note}</span>
            </Link>
          );
        })}
      </div>

      {/* Six empty columns and six empty columns look identical, so say which
          one this is. */}
      {loadError && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      )}
      {actionError && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {actionError}
        </p>
      )}

      {/* One track per column on a wide screen, wrapping down to two on a
          phone. The count comes from the board, since the two boards do not
          have the same number of columns. */}
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        style={{ ["--cols" as any]: def.columns.length }}
      >
        {def.columns.map((col) => {
          const cards = columns[col] ?? [];
          return (
            <div key={col} className="rounded-lg border border-border bg-card">
              <header className="border-b border-border px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{COLUMN_LABELS[col]}</span>
                  <span className="text-xs text-ink-soft">{cards.length}</span>
                </div>
                {/* A column called "Permits pending" beside one called
                    "Docs pending" needs one line saying which papers are
                    which, or the office guesses. */}
                <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">
                  {COLUMN_NOTES[col]}
                </p>
              </header>
              <div className="space-y-2 p-2">
                {cards.map((b: any) => (
                  <div
                    key={b.id}
                    className="rounded-md border border-border/70 bg-surface p-2 text-xs"
                  >
                    <a
                      href={`/ops/bookings/${b.id}`}
                      className="font-medium text-ink hover:text-primary hover:underline"
                    >
                      {b.offering?.title ?? "—"}
                    </a>
                    <p className="mt-1 text-ink-soft">
                      {b.trekker?.full_name}
                      {b.trekker?.country_code ? ` · ${b.trekker.country_code}` : ""}
                    </p>
                    <p className="text-ink-soft">guide {b.guide?.users?.full_name ?? "—"}</p>
                    <p className="mt-1 text-ink-soft">
                      {b.start_date} · {b.party_size}p · {formatUsd(b.total_usd_cents)}
                    </p>
                    {col === "permits_pending" ? (
                      // The status is already `confirmed`; what is missing
                      // is permits, and permits are filed on their own page.
                      // A "→ Active" button here would say the work was
                      // done.
                      <Link
                        to="/ops/permits"
                        className="mt-2 block rounded border border-border bg-card px-2 py-1 text-center text-xs font-medium hover:border-primary hover:text-primary"
                      >
                        File the permits
                      </Link>
                    ) : (
                      NEXT[b.status] && (
                        <>
                          <Form method="post" className="mt-2">
                            <input type="hidden" name="bookingId" value={b.id} />
                            <input type="hidden" name="next" value={NEXT[b.status]!} />
                            <button className="w-full rounded border border-border bg-card px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary">
                              → {COLUMN_LABELS[NEXT[b.status]!]}
                            </button>
                          </Form>
                          {/* Moving a card past what the trip's own facts
                              support is allowed, and it leaves a mark (0104).
                              Folded away, because it is the exception. */}
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] text-ink-soft hover:text-ink">
                              Move it anyway…
                            </summary>
                            <Form method="post" className="mt-1 space-y-1">
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input type="hidden" name="next" value={NEXT[b.status]!} />
                              <input
                                name="reason"
                                required
                                placeholder="Why? This is kept."
                                className="w-full rounded border border-border bg-card px-1.5 py-1 text-[11px] text-ink"
                              />
                              <button className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium">
                                Move with a reason
                              </button>
                            </Form>
                          </details>
                        </>
                      )
                    )}
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-ink-soft">
                    {loadError ? "?" : "—"}
                  </p>
                )}
              </div>
            </div>
        );
        })}
      </div>

      <CancelledStrip bookings={bookings} board={board} />
    </div>
  );
}

function CancelledStrip({ bookings, board }: { bookings: any[]; board: BoardKey }) {
  const cancelled = bookings.filter(
    (b) =>
      String(b.status ?? "").startsWith("cancelled") &&
      boardFor(b.offering?.kind ?? null) === board,
  );
  if (cancelled.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {cancelled.map((b) => (
        <Badge key={b.id} tone="red">
          {b.offering?.title} — {b.status.replace("cancelled_", "")}
        </Badge>
      ))}
    </div>
  );
}
