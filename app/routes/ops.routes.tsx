import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.routes";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { Badge } from "~/components/ops/ui";

/**
 * Every route, and the queue of ones a guide has proposed.
 *
 * This page used to list ONLY guide-proposed routes — and no guide has ever
 * proposed one, so it read "nothing waiting" while twenty-four live routes sat
 * invisible behind it. The only way to reach a route in the console was to
 * type its URL, which is not a console.
 *
 * So: the queue when there is one, then all of them, each a door into its
 * page builder (0071).
 *
 * The check on a proposed route is short and it is not editorial: are these
 * real places in this order, are the altitudes roughly right, and are those
 * the permits it actually needs. Approving one publishes a route page credited
 * to the guide who wrote it, and lets every other guide list trips on it.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const [{ data: rows }, { data: blocks }] = await Promise.all([
    admin
      .from("routes")
      .select(
        "id, slug, name, region, status, typical_days, max_altitude_m, difficulty, start_point, end_point, summary, day_stops, review_note, created_at, created_by_guide_id, permits(name, cost_usd_cents), guide:guides!routes_created_by_guide_id_fkey(slug, users(full_name))",
      )
      .order("region")
      .order("name"),
    // How much of a page each route has, so the list says which ones are
    // built and which are still on the standard layout.
    admin.from("route_blocks").select("route_id, live"),
  ]);

  const built = new Map<string, { live: number; draft: number }>();
  for (const b of blocks ?? []) {
    const at = built.get(b.route_id) ?? { live: 0, draft: 0 };
    b.live ? at.live++ : at.draft++;
    built.set(b.route_id, at);
  }

  const all = (rows ?? []).map((r: any) => ({
    ...r,
    blocks: built.get(r.id) ?? { live: 0, draft: 0 },
    proposed: !!r.created_by_guide_id,
  }));

  return data(
    {
      // The queue is what needs a decision; the rest is the catalogue.
      queue: all.filter((r: any) => r.proposed && r.status === "pending"),
      all,
    },
    { headers },
  );
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
  const { queue, all } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const builtCount = all.filter((r: any) => r.blocks.live > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Routes</h1>
        <p className="text-sm text-ink-soft">
          {all.length} routes. {builtCount} {builtCount === 1 ? "has" : "have"} a built
          page; the rest show the standard layout until you build one.
          {queue.length > 0 && ` ${queue.length} proposed by a guide, waiting to be checked.`}
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

      {/* ── The queue: routes a guide proposed, waiting on a decision ──── */}
      {queue.length > 0 && (
        <section className="space-y-3">
          <h2 className="label text-ink-soft">Waiting to be checked</h2>
          {queue.map((r: any) => (
            <ProposedRoute key={r.id} r={r} busy={busy} />
          ))}
        </section>
      )}

      {/* ── Every route, each a door into its page builder ─────────────── */}
      <section>
        <h2 className="label text-ink-soft">All routes</h2>
        <ul className="mt-2 divide-y divide-border rounded-card border border-border bg-card">
          {all.map((r: any) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">
                  {r.name}
                  {r.proposed && (
                    <span className="ml-2 text-caption font-normal text-ink-soft">
                      from {r.guide?.users?.full_name ?? "a guide"}
                    </span>
                  )}
                </p>
                <p className="text-caption text-ink-soft">
                  {r.region} · <span className="font-mono">{r.typical_days}</span> days ·{" "}
                  <span className="font-mono">
                    {r.max_altitude_m ? r.max_altitude_m.toLocaleString("en-US") : "—"}
                  </span>{" "}
                  m · {r.difficulty}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  tone={r.status === "live" ? "green" : r.status === "pending" ? "amber" : "neutral"}
                >
                  {r.status}
                </Badge>
                {/* Which layout the public page is on right now. */}
                <Badge tone={r.blocks.live > 0 ? "blue" : "neutral"}>
                  {r.blocks.live > 0
                    ? `built · ${r.blocks.live} live${r.blocks.draft ? ` · ${r.blocks.draft} draft` : ""}`
                    : r.blocks.draft > 0
                      ? `${r.blocks.draft} draft`
                      : "standard"}
                </Badge>
              </div>

              <div className="flex shrink-0 items-center gap-3 text-sm">
                <Link
                  to={`/ops/routes/${r.slug}/page`}
                  className="rounded-button bg-pine px-3 py-1.5 font-medium text-paper hover:bg-moss"
                >
                  {r.blocks.live + r.blocks.draft > 0 ? "Edit the page" : "Build the page"}
                </Link>
                <a
                  href={`/routes/${r.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  See it →
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** A guide's proposal: the days and permits to check, and the two buttons. */
function ProposedRoute({ r, busy }: { r: any; busy: boolean }) {
  return (
    <article className="space-y-2 rounded-card border border-border bg-card p-4">
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
        <Badge tone="amber">{r.status}</Badge>
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
    </article>
  );
}
