import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.routes";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { Badge } from "~/components/ops/ui";

/**
 * Routes a guide has proposed, waiting to be checked.
 *
 * The check is short and it is not editorial: are these real places in this
 * order, are the altitudes roughly right, and are those the permits it
 * actually needs. Approving one publishes a route page credited to the guide
 * who wrote it, and lets every other guide list trips on it.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { data: rows } = await admin
    .from("routes")
    .select(
      "id, slug, name, region, status, typical_days, max_altitude_m, difficulty, start_point, end_point, summary, day_stops, review_note, created_at, permits(name, cost_usd_cents), guide:guides!routes_created_by_guide_id_fkey(slug, users(full_name))",
    )
    .not("created_by_guide_id", "is", null)
    .order("created_at", { ascending: false });
  return data({ rows: rows ?? [] }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const intent = String(form.get("intent") ?? "");
  const note = String(form.get("review_note") ?? "").trim();

  if (!["approve", "reject"].includes(intent) || !id) {
    return data({ error: "Unknown action." }, { status: 400, headers });
  }
  if (intent === "reject" && !note) {
    return data(
      { error: "Say why — the guide gets this back and has to be able to fix it." },
      { status: 400, headers },
    );
  }
  await admin
    .from("routes")
    .update({
      status: intent === "approve" ? "live" : "rejected",
      review_note: note || null,
    })
    .eq("id", id);
  return data({ ok: intent === "approve" ? "Live." : "Sent back." }, { headers });
}

export default function OpsRoutes({ loaderData, actionData }: Route.ComponentProps) {
  const { rows } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const pending = rows.filter((r: any) => r.status === "pending");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Proposed routes</h1>
        <p className="text-sm text-ink-soft">
          {pending.length
            ? `${pending.length} waiting to be checked.`
            : "Nothing waiting."}
        </p>
      </div>

      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}
      {actionData && "ok" in actionData && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {(actionData as any).ok}
        </p>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-ink-soft">No guide has proposed a route yet.</p>
      )}

      {rows.map((r: any) => (
        <article key={r.id} className="space-y-2 rounded-card border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-medium text-ink">{r.name}</p>
              <p className="text-caption text-ink-soft">
                {r.region} · {r.start_point} → {r.end_point} ·{" "}
                <span className="font-mono">{r.typical_days}</span> days ·{" "}
                <span className="font-mono">
                  {r.max_altitude_m ? r.max_altitude_m.toLocaleString("en-US") : "—"}
                </span>{" "}
                m · {r.difficulty}
              </p>
              <p className="text-caption text-ink-soft">
                from {r.guide?.users?.full_name ?? "a guide"}
              </p>
            </div>
            <Badge
              tone={r.status === "live" ? "green" : r.status === "pending" ? "amber" : "neutral"}
            >
              {r.status}
            </Badge>
          </div>

          <p className="text-sm text-ink-soft">{r.summary}</p>

          <details className="text-sm">
            <summary className="cursor-pointer text-ink">
              The days ({(r.day_stops ?? []).length} stops) and permits
            </summary>
            <ol className="mt-2 space-y-0.5 text-caption text-ink-soft">
              {(r.day_stops ?? []).map((s: any) => (
                <li key={`${s.day}-${s.place}`} className="flex justify-between gap-3">
                  <span>
                    <span className="font-mono">Day {s.day}</span> {s.place}
                  </span>
                  <span className="font-mono">
                    {s.altitude_m ? `${s.altitude_m.toLocaleString("en-US")} m` : "—"}
                  </span>
                </li>
              ))}
            </ol>
            {(r.permits ?? []).length > 0 && (
              <ul className="mt-2 border-t border-border pt-2 text-caption text-ink-soft">
                {r.permits.map((p: any) => (
                  <li key={p.name} className="flex justify-between gap-3">
                    <span>{p.name}</span>
                    <span className="font-mono">${(p.cost_usd_cents / 100).toFixed(0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>

          {r.review_note && (
            <p className="rounded bg-mist px-2 py-1 text-caption text-ink-soft">
              Note: {r.review_note}
            </p>
          )}

          {r.status === "pending" && (
            <Form method="post" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input
                name="review_note"
                placeholder="Why, if sending it back"
                className="min-w-0 flex-1 rounded border border-border px-2 py-1.5 text-sm"
              />
              <button
                name="intent"
                value="approve"
                disabled={busy}
                className="rounded-button bg-pine px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-50"
              >
                Approve
              </button>
              <button
                name="intent"
                value="reject"
                disabled={busy}
                className="rounded-button border border-border px-3 py-1.5 text-sm text-ink disabled:opacity-50"
              >
                Send back
              </button>
            </Form>
          )}
        </article>
      ))}
    </div>
  );
}
