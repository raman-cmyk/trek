import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.experiences";
import { Badge } from "~/components/ops/ui";
import { formatUsd } from "~/lib/pricing";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { firstName } from "~/lib/names";

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
    .select("id, kind, title, status, days, price_usd_cents, guide:guides!offerings_guide_id_fkey(slug, users(full_name))")
    .order("title");
  const order: Record<string, number> = { pending: 0, draft: 1, live: 2, paused: 3 };
  const rows = (offerings ?? []).sort(
    (a: any, b: any) => (order[a.status] ?? 9) - (order[b.status] ?? 9),
  );
  return data({ rows }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const id = String(form.get("id"));
  const intent = String(form.get("intent"));
  const next =
    intent === "approve" ? "live" : intent === "pause" ? "paused" : intent === "unpause" ? "live" : null;
  if (!next) return data({ error: "Unknown action." }, { status: 400, headers });
  await admin.from("offerings").update({ status: next }).eq("id", id);
  return data({ ok: true }, { headers });
}

export default function OpsExperiences({ loaderData }: Route.ComponentProps) {
  const { rows } = loaderData as any;
  const pending = rows.filter((r: any) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Experiences</h1>
        {pending > 0 && (
          <p className="text-sm text-ink-soft">
            <span className="font-mono text-ember">{pending}</span> waiting on approval
          </p>
        )}
      </div>

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
                    {r.status === "live" && (
                      <Form method="post">
                        <input type="hidden" name="id" value={r.id} />
                        <button name="intent" value="pause" className="rounded border border-line px-3 py-1 text-xs hover:bg-mist">
                          Pause
                        </button>
                      </Form>
                    )}
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
