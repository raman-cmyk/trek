import { Form, data } from "react-router";
import type { Route } from "./+types/ops.permits";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { getEnv, requireOps } from "~/lib/supabase.server";

const STATUSES = ["awaiting_docs", "filed", "approved", "ready", "rejected"] as const;
const TONE: Record<string, "neutral" | "amber" | "blue" | "green" | "red"> = {
  awaiting_docs: "neutral",
  filed: "amber",
  approved: "blue",
  ready: "green",
  rejected: "red",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { data: apps } = await admin
    .from("permit_applications")
    .select(
      "id, status, reference_no, permit:permits(name, issuing_body, lead_time_days), booking:bookings(start_date, trekker:users(full_name), offering:offerings(title))",
    );
  // Sort by trek start-date proximity (soonest first).
  const rows = (apps ?? []).sort((a: any, b: any) =>
    (a.booking?.start_date ?? "").localeCompare(b.booking?.start_date ?? ""),
  );
  return data({ rows }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const id = String(form.get("id"));
  const status = String(form.get("status"));
  const reference_no = String(form.get("reference_no") ?? "") || null;
  const patch: Record<string, unknown> = { status, reference_no };
  if (status === "filed") patch.filed_at = new Date().toISOString();
  if (status === "approved" || status === "ready")
    patch.approved_at = new Date().toISOString();
  await admin.from("permit_applications").update(patch).eq("id", id);
  return data({ ok: true }, { headers });
}

export default function OpsPermits({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows as any[];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Permit tracker</h1>
      <Panel>
        {rows.length === 0 ? (
          <EmptyRow>No open permit applications.</EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-soft">
              <tr className="border-b border-border">
                <th className="pb-2 font-medium">Permit</th>
                <th className="pb-2 font-medium">Trek / trekker</th>
                <th className="pb-2 font-medium">Start</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Advance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-3">
                    <p className="font-medium">{r.permit?.name}</p>
                    <p className="text-xs text-ink-soft">
                      {r.permit?.issuing_body} · lead {r.permit?.lead_time_days}d
                    </p>
                  </td>
                  <td className="py-3">
                    <p>{r.booking?.offering?.title}</p>
                    <p className="text-xs text-ink-soft">
                      {r.booking?.trekker?.full_name}
                    </p>
                  </td>
                  <td className="py-3 text-ink-soft">{r.booking?.start_date}</td>
                  <td className="py-3">
                    <Badge tone={TONE[r.status]}>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <Form method="post" className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <select
                        name="status"
                        defaultValue={r.status}
                        className="rounded border border-border px-1 py-1 text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <input
                        name="reference_no"
                        defaultValue={r.reference_no ?? ""}
                        placeholder="ref no."
                        className="w-24 rounded border border-border px-1 py-1 text-xs"
                      />
                      <button className="rounded border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary">
                        Save
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
