import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.verifications";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { LaneTabs, StatusTabs } from "~/components/ops/StatusTabs";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { rejectDocument, verifyDocument } from "~/lib/documents.server";
import { cleanReason, docState, rejectionProblem, STATE_LABEL } from "~/lib/doc-review";
import { applyFilter, countsFor, resolveKey } from "~/lib/status-filter";
import { DOC_FILTERS, GUIDE_FILTERS } from "~/lib/ops-filters";
import { checkLabel } from "~/lib/guide-checks";
import { fmtDate } from "~/lib/format";
import { sendEmail } from "~/lib/notify.server";

/**
 * The queue of things waiting on a decision from the office.
 *
 * It held one of the two: guides applying, and only those still applying —
 * a verified guide or a suspended one was not reachable from here at all, and
 * a trekker's passport was not in any queue, so the only way to find one was
 * to know which booking it belonged to and open that.
 *
 * Two lanes now. Guides, with every check itemised on the row, so "why is this
 * one still in review" is answered without opening anybody. And trekker
 * documents, which can be passed or sent back from the list itself — opening
 * forty profiles to approve forty passports is the work this page exists to
 * remove.
 */
const LANES = [
  { key: "guides", label: "Guides" },
  { key: "trekkers", label: "Trekker documents" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const url = new URL(request.url);
  const who = url.searchParams.get("who") === "trekkers" ? "trekkers" : "guides";

  const [{ data: guides }, { data: docs }] = await Promise.all([
    // Every guide, not just the ones mid-application: the Verified and
    // Suspended tabs have to have something to show.
    admin
      .from("guides")
      .select(
        "user_id, slug, status, tier, home_district, created_at, users(full_name, avatar_url), guide_verifications(check_type, status, notes, expires_at)",
      )
      .order("status"),
    admin
      .from("booking_documents")
      .select(
        "id, person_name, type, verified_at, rejected_at, rejected_reason, created_at, booking:bookings(id, start_date, trekker:users!bookings_trekker_id_fkey(full_name), offering:offerings(title))",
      )
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const guideRows = (guides ?? []).map((g: any) => {
    const checks = (g.guide_verifications ?? []) as any[];
    return {
      userId: g.user_id,
      slug: g.slug,
      status: g.status as string,
      district: g.home_district as string | null,
      name: g.users?.full_name ?? g.slug,
      avatar: g.users?.avatar_url ?? null,
      tier: g.tier ?? 0,
      since: g.created_at as string,
      passed: checks.filter((c) => c.status === "passed").length,
      total: checks.length,
      // Every check, in a stable order, so a row can be read down a column.
      checks: [...checks]
        .sort((a, b) => String(a.check_type).localeCompare(String(b.check_type)))
        .map((c) => ({ type: c.check_type, status: c.status, expires: c.expires_at })),
    };
  });

  const docRows = (docs ?? []).map((d: any) => ({
    id: d.id,
    bookingId: d.booking?.id ?? null,
    person: d.person_name,
    type: d.type as string,
    trekker: d.booking?.trekker?.full_name ?? "—",
    trip: d.booking?.offering?.title ?? "—",
    startDate: d.booking?.start_date ?? null,
    reason: d.rejected_reason ?? null,
    state: docState(d),
  }));

  const filters = who === "guides" ? GUIDE_FILTERS : DOC_FILTERS;
  const rows: any[] = who === "guides" ? guideRows : docRows;
  const statusOf = (r: any) => (who === "guides" ? r.status : r.state);
  const status = resolveKey(filters, url.searchParams.get("status"));

  return data(
    {
      who,
      status,
      rows: applyFilter(rows, filters, status, statusOf),
      counts: countsFor(rows, filters, statusOf),
      // Each lane's own backlog, on its tab: what is actually waiting on us.
      lanes: {
        guides: guideRows.filter((g) => g.status === "applied" || g.status === "in_review").length,
        trekkers: docRows.filter((d) => d.state === "pending").length,
      },
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const documentId = String(form.get("document_id") ?? "");

  if (intent === "verify") {
    const { confirmed } = await verifyDocument(admin, documentId, user.id);
    return data(
      { ok: confirmed ? "Passed — that booking is now confirmed." : "Passed." },
      { headers },
    );
  }

  if (intent === "reject") {
    const reason = String(form.get("reason") ?? "");
    const problem = rejectionProblem(reason);
    if (problem) return data({ error: problem }, { status: 400, headers });

    const { bookingId, personName, type } = await rejectDocument(
      admin,
      documentId,
      user.id,
      reason,
    );
    if (!bookingId) return data({ error: "That document is gone." }, { status: 404, headers });

    const { data: who } = await admin
      .from("bookings")
      .select("trekker:users!bookings_trekker_id_fkey(email)")
      .eq("id", bookingId)
      .single();
    await sendEmail(
      env,
      (who as any)?.trekker?.email,
      `Your ${type} needs redoing`,
      `We could not accept the ${type} for ${personName}: ${cleanReason(reason)}\n\nUpload a new one from your trip page and we will check it again.`,
    );
    return data({ ok: "Sent back — the trekker has been told why." }, { headers });
  }

  return data({ error: "Unknown action." }, { status: 400, headers });
}

export default function OpsVerifications({ loaderData, actionData }: Route.ComponentProps) {
  const { who, status, rows, counts, lanes } = loaderData as any;
  const act = (actionData ?? {}) as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h1 className="font-display text-2xl">Verification queue</h1>
        <LaneTabs lanes={LANES} current={who} counts={lanes} />
        <StatusTabs
          filters={who === "guides" ? GUIDE_FILTERS : DOC_FILTERS}
          current={status}
          counts={counts}
        />
      </div>

      {act.error && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {act.error}
        </p>
      )}
      {act.ok && (
        <p className="rounded border border-accent/40 bg-accent/5 p-3 text-sm text-ink">{act.ok}</p>
      )}

      <Panel>
        {rows.length === 0 ? (
          <EmptyRow>
            {who === "guides"
              ? "No guides in this list."
              : "No trekker documents in this list."}
          </EmptyRow>
        ) : who === "guides" ? (
          <GuideList rows={rows} />
        ) : (
          <DocList rows={rows} busy={busy} />
        )}
      </Panel>
    </div>
  );
}

/** A guide per row, with every check spelled out rather than counted. */
function GuideList({ rows }: { rows: any[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.userId} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {/* The photograph is part of what is being checked — a licence
                  that does not match the face is the thing this queue exists
                  to catch — so it is on the row, not behind a click. */}
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mist text-sm font-semibold text-pine">
                {r.avatar ? (
                  <img src={r.avatar} alt="" width={40} height={40} className="h-full w-full object-cover" />
                ) : (
                  (r.name?.charAt(0) ?? "?")
                )}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {r.name}
                  {r.tier > 0 && <span className="ml-1.5 text-caption text-ink-soft">T{r.tier}</span>}
                  {!r.avatar && (
                    <span className="ml-2 text-caption font-normal text-ember">no photo</span>
                  )}
                </p>
                <p className="text-caption text-ink-soft">
                  {r.district ?? "no district"} · applied {fmtDate(r.since)}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Badge tone={guideTone(r.status)}>{r.status.replace("_", " ")}</Badge>
              <span className="font-mono text-caption text-ink-soft">
                {r.passed}/{r.total}
              </span>
              <Link
                to={`/ops/people/${r.userId}?t=verification`}
                className="font-medium text-primary hover:underline"
              >
                Review →
              </Link>
            </div>
          </div>

          {/* Itemised: which check, and where it stands. Counting them told
              you four of six had passed and never which two had not. */}
          {r.checks.length === 0 ? (
            <p className="mt-2 text-caption text-ink-soft">No checks started yet.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {r.checks.map((c: any) => (
                <li
                  key={c.type}
                  className={
                    "rounded-pill border px-2 py-0.5 text-[11px] " +
                    (c.status === "passed"
                      ? "border-moss/30 bg-moss/10 text-pine"
                      : c.status === "failed"
                        ? "border-ember/40 bg-ember/10 text-ember"
                        : c.status === "expired"
                          ? "border-ember/30 bg-card text-ember"
                          : "border-border bg-card text-ink-soft")
                  }
                  title={c.expires ? `Expires ${fmtDate(c.expires)}` : undefined}
                >
                  {checkLabel(c.type)}
                  {c.status !== "passed" && <span className="ml-1 opacity-70">· {c.status}</span>}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Trekker documents, decided from the list.
 *
 * Passing one is a button. Sending one back needs a reason, which the trekker
 * reads on their own trip page — so the box is here rather than on a page you
 * have to go and find.
 */
function DocList({ rows, busy }: { rows: any[]; busy: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((d) => (
        <li key={d.id} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium capitalize text-ink">
                {d.type}
                <span className="ml-2 text-sm font-normal text-ink-soft">{d.person}</span>
              </p>
              <p className="text-caption text-ink-soft">
                {d.trekker} · {d.trip}
                {d.startDate && ` · ${fmtDate(d.startDate)}`}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge
                tone={d.state === "verified" ? "green" : d.state === "rejected" ? "red" : "amber"}
              >
                {STATE_LABEL[d.state as keyof typeof STATE_LABEL]}
              </Badge>
              {d.bookingId && (
                <a
                  href={`/ops/doc/booking/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-border px-2 py-1 text-xs text-ink hover:bg-mist"
                >
                  View
                </a>
              )}
              {d.state !== "verified" && (
                <Form method="post">
                  <input type="hidden" name="intent" value="verify" />
                  <input type="hidden" name="document_id" value={d.id} />
                  <button
                    disabled={busy}
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50 disabled:opacity-50"
                  >
                    Pass
                  </button>
                </Form>
              )}
              {d.bookingId && (
                <Link
                  to={`/ops/bookings/${d.bookingId}`}
                  className="text-xs text-primary hover:underline"
                >
                  Booking →
                </Link>
              )}
            </div>
          </div>

          {d.state === "rejected" ? (
            <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-ink">
              <span className="font-medium">Sent back:</span> {d.reason}
              <span className="ml-1 text-ink-soft">· waiting for a new one</span>
            </p>
          ) : (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                Send it back…
              </summary>
              <Form method="post" className="mt-1.5 flex flex-wrap items-start gap-2">
                <input type="hidden" name="intent" value="reject" />
                <input type="hidden" name="document_id" value={d.id} />
                <textarea
                  name="reason"
                  rows={2}
                  required
                  placeholder="What is wrong with it? The trekker reads this."
                  className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                />
                <button
                  disabled={busy}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-amber-50 disabled:opacity-50"
                >
                  Send back
                </button>
              </Form>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function guideTone(status: string) {
  if (status === "verified") return "green" as const;
  if (status === "in_review") return "amber" as const;
  if (status === "suspended" || status === "removed") return "red" as const;
  return "neutral" as const;
}
