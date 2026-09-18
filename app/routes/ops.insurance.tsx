import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.insurance";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { StatusTabs } from "~/components/ops/StatusTabs";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { rows, write } from "~/lib/ops.server";
import { fmtDate } from "~/lib/format";
import { applyFilter, countsFor, resolveKey } from "~/lib/status-filter";
import {
  INSURANCE_FILTERS,
  INSURANCE_LABEL,
  INSURANCE_TONE,
  bySoonestStart,
  insuranceState,
  missingCover,
  needsAttention,
  type InsuranceState,
} from "~/lib/insurance-queue";
import { cleanReason } from "~/lib/doc-review";
import { sendEmail } from "~/lib/notify.server";

/**
 * Every trip's insurance, in one queue.
 *
 * Checking a policy is a job somebody sits down and does — and it was only
 * ever visible one booking at a time, so the way an unverified policy got
 * found was that somebody opened the trip and noticed. On a trek above
 * 4,000 m that is the wrong way round: from 2026 the TIMS card is not issued
 * without cover, so an unchecked policy is a trek that cannot legally start.
 *
 * The tab that earns this page is "Cover too thin". It is not the same job as
 * the rest: the answer is not "check this", it is "tell them to go and buy a
 * different policy", and it needs saying weeks out rather than the night
 * before.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const url = new URL(request.url);
  const filter = resolveKey(INSURANCE_FILTERS, url.searchParams.get("status"));
  const today = new Date().toISOString().slice(0, 10);

  const bookings = await rows<any>(
    admin
      .from("bookings")
      .select(
        "id, status, start_date, party_size, insurance_provider, insurance_policy_no, insurance_meta, insurance_attested_at, insurance_verified_at, insurance_rejected_at, insurance_rejected_reason, insurance_help_asked_at, insurance_help_closed_at, trekker:users!bookings_trekker_id_fkey(full_name, email), offering:offerings(title, kind)",
      )
      .not("status", "like", "cancelled%")
      .order("start_date"),
    "the bookings",
  );

  // Only treks. A momo crawl needs no policy, and a queue that lists one is a
  // queue with a row nobody will ever action — which is how a queue stops
  // being trusted.
  const treks = bookings.rows.filter((b: any) => b.offering?.kind === "trek");
  const withState = treks.map((b: any) => ({ ...b, state: insuranceState(b) }));

  return data(
    {
      rows: bySoonestStart(
        applyFilter(withState, INSURANCE_FILTERS, filter, (r: any) => r.state),
      ),
      counts: countsFor(withState, INSURANCE_FILTERS, (r: any) => r.state),
      filter,
      // The count that belongs in the sidebar badge and at the top of this
      // page: what is actually still somebody's job.
      outstanding: needsAttention(withState, today).length,
      loadError: bookings.error,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("booking_id"));

  if (intent === "verify") {
    const ok = await write(
      admin
        .from("bookings")
        .update({
          insurance_verified_at: new Date().toISOString(),
          // Verifying settles it, so an earlier refusal is over — a row
          // claiming both is a row nobody can read.
          insurance_rejected_at: null,
          insurance_rejected_reason: null,
          insurance_rejected_by: null,
        })
        .eq("id", id),
      "verifying this policy",
    );
    return ok.ok
      ? data({ ok: "Verified." }, { headers })
      : data({ error: ok.error }, { status: 500, headers });
  }

  if (intent === "reject") {
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason) {
      return data(
        { error: "Say what is wrong with it — the trekker reads this." },
        { status: 400, headers },
      );
    }
    const ok = await write(
      admin
        .from("bookings")
        .update({
          insurance_rejected_at: new Date().toISOString(),
          insurance_rejected_reason: cleanReason(reason),
          insurance_rejected_by: user.id,
          insurance_verified_at: null,
        })
        .eq("id", id),
      "sending this policy back",
    );
    if (!ok.ok) return data({ error: ok.error }, { status: 500, headers });

    // Telling them is the point. A policy sent back in silence is a trekker
    // who finds out at the TIMS counter.
    const who = await rows<any>(
      admin
        .from("bookings")
        .select("trekker:users!bookings_trekker_id_fkey(email)")
        .eq("id", id),
      "the trekker's address",
    );
    const email = who.rows[0]?.trekker?.email;
    if (email) {
      await sendEmail(
        env,
        email,
        "Your insurance needs another look",
        `We could not accept your policy: ${cleanReason(reason)}\n\nUpdate it from your trip page and we will check it again.`,
      );
    }
    return data({ ok: "Sent back." }, { headers });
  }

  // The office has come back to them with a policy. Closing the ask is what
  // empties this queue — without it, "asked us to sort it" is a state a
  // booking can never leave except by being verified.
  if (intent === "close_help") {
    const ok = await write(
      admin
        .from("bookings")
        .update({ insurance_help_closed_at: new Date().toISOString() })
        .eq("id", id),
      "closing this request",
    );
    return ok.ok
      ? data({ ok: "Marked as dealt with." }, { headers })
      : data({ error: ok.error }, { status: 500, headers });
  }

  return data({ error: "Unknown action." }, { status: 400, headers });
}

export default function OpsInsurance({ loaderData, actionData }: Route.ComponentProps) {
  const { rows: list, counts, filter, outstanding, loadError } = loaderData as any;
  const act = (actionData ?? {}) as any;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Insurance</h1>
        <StatusTabs filters={INSURANCE_FILTERS} current={filter} counts={counts} />
      </div>

      <p className="text-sm text-ink-soft">
        Every trek needs cover that pays for a helicopter above 4,000 m. From
        2026 the blue TIMS card is not issued without it, so an unchecked
        policy is a trek that cannot start.{" "}
        {outstanding > 0 ? (
          <span className="font-medium text-ink">{outstanding} still to deal with.</span>
        ) : (
          <span className="font-medium text-ink">Nothing outstanding.</span>
        )}
      </p>

      {/* A failed read and an empty queue look identical, so say which. */}
      {loadError && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      )}
      {act.error && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {act.error}
        </p>
      )}
      {act.ok && (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {act.ok}
        </p>
      )}

      <Panel title={`${list.length} ${list.length === 1 ? "trek" : "treks"}`}>
        {list.length === 0 ? (
          <EmptyRow>Nothing under this tab.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((b: any) => {
              const state = b.state as InsuranceState;
              const gaps = missingCover(b.insurance_meta);
              return (
                <li key={b.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/ops/bookings/${b.id}`}
                        className="text-sm font-medium text-ink hover:text-primary hover:underline"
                      >
                        {b.offering?.title ?? "A trek"}
                      </Link>
                      <p className="text-xs text-ink-soft">
                        {b.trekker?.full_name ?? "—"} · party of {b.party_size} ·{" "}
                        {b.start_date ? fmtDate(b.start_date) : "no date"}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {b.insurance_provider ? (
                          <>
                            {b.insurance_provider}
                            {b.insurance_policy_no && (
                              <span className="ml-1 font-mono">{b.insurance_policy_no}</span>
                            )}
                          </>
                        ) : (
                          "no policy on file"
                        )}
                      </p>
                      {/* What is missing, named — so the office can say what
                          to go and buy rather than "it is not enough". */}
                      {gaps.length > 0 && state !== "not_declared" && (
                        <p className="mt-0.5 text-xs font-medium text-red-900">
                          No cover for: {gaps.join(", ")}
                        </p>
                      )}
                      {state === "help_wanted" && (
                        <p className="mt-0.5 text-xs font-medium text-ink">
                          Asked us to arrange cover on{" "}
                          {fmtDate(b.insurance_help_asked_at)} — they have been
                          told a person is on it.
                        </p>
                      )}
                      {state === "sent_back" && b.insurance_rejected_reason && (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          Sent back {fmtDate(b.insurance_rejected_at)} — {b.insurance_rejected_reason}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge tone={INSURANCE_TONE[state]}>{INSURANCE_LABEL[state]}</Badge>
                      {state !== "verified" && b.insurance_attested_at && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="verify" />
                          <input type="hidden" name="booking_id" value={b.id} />
                          <button className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50">
                            Verify
                          </button>
                        </Form>
                      )}
                      {state === "help_wanted" && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="close_help" />
                          <input type="hidden" name="booking_id" value={b.id} />
                          <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                            Dealt with
                          </button>
                        </Form>
                      )}
                    </div>
                  </div>

                  {state !== "verified" && b.insurance_attested_at && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                        Send it back…
                      </summary>
                      <Form method="post" className="mt-1.5 flex flex-wrap items-start gap-2">
                        <input type="hidden" name="intent" value="reject" />
                        <input type="hidden" name="booking_id" value={b.id} />
                        <textarea
                          name="reason"
                          rows={2}
                          required
                          defaultValue={
                            gaps.length > 0
                              ? `Your policy does not cover ${gaps.join(" or ")}. A trek above 4,000 m needs both altitude cover and helicopter evacuation.`
                              : ""
                          }
                          className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                        />
                        <button className="rounded border border-border px-2 py-1 text-xs hover:bg-amber-50">
                          Send back
                        </button>
                      </Form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
