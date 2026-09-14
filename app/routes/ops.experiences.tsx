import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.experiences";
import { Badge } from "~/components/ops/ui";
import { formatUsd } from "~/lib/pricing";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { firstName } from "~/lib/names";
import { StatusTabs } from "~/components/ops/StatusTabs";
import { applyFilter, countsFor, resolveKey } from "~/lib/status-filter";
import { OFFERING_FILTERS } from "~/lib/ops-filters";
import { pauseOffering, unpauseOffering } from "~/lib/offerings.server";
import { notifyListingLive, notifyListingPaused } from "~/lib/notifications.server";
import { PAUSE_REASON_MAX, isStalePause, pausedFor } from "~/lib/pause";

/**
 * Every experience on the marketplace, with the review gate.
 *
 * Guides list their own trips now (/g/experiences); they arrive here as
 * `pending` and sell only after a human look: price adds up, route is real,
 * photo is theirs. The same table is the office's lever on anything already
 * live — pause it, fix it, or take it over entirely via Edit.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { data: offerings } = await admin
    .from("offerings")
    .select("id, kind, title, status, days, price_usd_cents, paused_reason, paused_at, paused_by, guide:guides!offerings_guide_id_fkey(slug, users(full_name))")
    .order("title");
  const order: Record<string, number> = { pending: 0, draft: 1, live: 2, paused: 3 };
  const all = (offerings ?? []).sort(
    (a: any, b: any) => (order[a.status] ?? 9) - (order[b.status] ?? 9),
  );
  const filter = resolveKey(OFFERING_FILTERS, new URL(request.url).searchParams.get("status"));
  return data(
    {
      rows: applyFilter(all, OFFERING_FILTERS, filter, (r: any) => r.status),
      counts: countsFor(all, OFFERING_FILTERS, (r: any) => r.status),
      filter,
      // Rendered on the server so "13 days ago" is the same on every screen.
      now: new Date().toISOString(),
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const id = String(form.get("id"));
  const intent = String(form.get("intent"));

  // A pause takes somebody's listing off the market, so it never happens
  // without a reason written down and sent to them.
  if (intent === "pause") {
    const res = await pauseOffering(admin, {
      offeringId: id,
      editorId: user.id,
      reason: String(form.get("reason") ?? ""),
    });
    if (res.error) return data({ error: res.error, id }, { status: 400, headers });
    if (res.guideId) {
      await notifyListingPaused(env, admin, {
        guideId: res.guideId,
        offeringId: id,
        title: res.title ?? "",
        reason: String(form.get("reason") ?? "").trim(),
      });
    }
    return data({ ok: "Paused. The guide has been told why." }, { headers });
  }

  if (intent === "unpause") {
    const res = await unpauseOffering(admin, { offeringId: id, editorId: user.id });
    if (res.error) return data({ error: res.error, id }, { status: 400, headers });
    if (res.guideId) {
      await notifyListingLive(env, admin, {
        guideId: res.guideId,
        offeringId: id,
        title: res.title ?? "",
      });
    }
    return data({ ok: "Live again." }, { headers });
  }

  if (intent !== "approve") return data({ error: "Unknown action." }, { status: 400, headers });
  await admin.from("offerings").update({ status: "live" }).eq("id", id);
  return data({ ok: "Live." }, { headers });
}

export default function OpsExperiences({ loaderData, actionData }: Route.ComponentProps) {
  const { rows, counts, filter, now } = loaderData as any;
  // Counted over everything, not the visible tab.
  const pending = counts.pending ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-2xl text-ink">Experiences</h1>
          <StatusTabs filters={OFFERING_FILTERS} current={filter} counts={counts} />
        </div>
        <div className="flex items-center gap-4">
          {pending > 0 && (
            <p className="text-sm text-ink-soft">
              <span className="font-mono text-ember">{pending}</span> waiting on approval
            </p>
          )}
          <Link
            to="/ops/experiences/new"
            className="rounded bg-pine px-3 py-1.5 text-sm font-medium text-paper hover:bg-moss"
          >
            + List a trip
          </Link>
        </div>
      </div>

      {actionData && (actionData as any).ok && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {(actionData as any).ok}
        </p>
      )}
      {actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">{(actionData as any).error}</p>
      )}

      <div className="overflow-x-auto rounded-md border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-3 py-2 font-medium">Experience</th>
              <th className="px-3 py-2 font-medium">Guide</th>
              <th className="px-3 py-2 font-medium">Days</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r: any) => (
              <tr key={r.id} className="hover:bg-mist/40">
                <td className="px-3 py-2">
                  <Link to={`/ops/experiences/${r.id}`} className="font-medium text-primary hover:underline">
                    {r.title}
                  </Link>
                  <span className="ml-2 text-xs text-ink-soft">{r.kind}</span>
                  {r.status === "paused" && (
                    <p className="mt-1 max-w-md text-xs text-ink-soft">
                      <span className="font-medium text-ink">Paused:</span>{" "}
                      {r.paused_reason || (
                        <span className="italic text-muted">
                          no reason recorded — paused before we asked for one
                        </span>
                      )}
                      {pausedFor(r.paused_at, now) && (
                        <span className={isStalePause(r.paused_at, now) ? "text-ember" : "text-muted"}>
                          {" · "}
                          {pausedFor(r.paused_at, now)}
                        </span>
                      )}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2">{firstName(r.guide?.users?.full_name)}</td>
                <td className="px-3 py-2 font-mono">{r.days}</td>
                <td className="px-3 py-2 font-mono">
                  {r.price_usd_cents ? formatUsd(r.price_usd_cents) : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    tone={r.status === "live" ? "green" : r.status === "pending" ? "amber" : "neutral"}
                  >
                    {r.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    {r.status === "pending" && (
                      <Form method="post">
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          name="intent"
                          value="approve"
                          className="rounded bg-moss px-3 py-1 text-xs font-medium text-white hover:bg-pine"
                        >
                          Approve → live
                        </button>
                      </Form>
                    )}
                    {r.status === "live" && <PauseButton id={r.id} />}
                    {r.status === "paused" && (
                      <Form method="post">
                        <input type="hidden" name="id" value={r.id} />
                        <button name="intent" value="unpause" className="rounded border border-line px-3 py-1 text-xs hover:bg-mist">
                          Go live
                        </button>
                      </Form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Pause, with the reason written at the same moment.
 *
 * A <details> rather than a dialog, so it works with JavaScript off like
 * every other form in the console, and so the box appears in the row it
 * belongs to rather than over the top of the table.
 *
 * The reason is required by the action, not just by the browser — a required
 * attribute is a courtesy, and this is a rule.
 */
function PauseButton({ id }: { id: string }) {
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none rounded border border-line px-3 py-1 text-xs hover:bg-mist">
        Pause
      </summary>
      <Form
        method="post"
        className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded-md border border-line bg-card p-3 text-left shadow-lift"
      >
        <input type="hidden" name="id" value={id} />
        <label className="block text-xs font-medium text-ink" htmlFor={`reason-${id}`}>
          Why is it coming down?
        </label>
        <textarea
          id={`reason-${id}`}
          name="reason"
          rows={3}
          required
          maxLength={PAUSE_REASON_MAX}
          placeholder="The summit photo is not his — it is off a stock site."
          className="w-full rounded border border-line bg-paper px-2 py-1.5 text-xs text-ink outline-none focus:border-moss"
        />
        <p className="text-caption text-muted">
          The guide is sent this, so write it to them.
        </p>
        <button
          name="intent"
          value="pause"
          className="w-full rounded bg-ember px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Pause it
        </button>
      </Form>
    </details>
  );
}
