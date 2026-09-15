import { Form, data } from "react-router";
import type { Route } from "./+types/ops.incidents";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { rows, write } from "~/lib/ops.server";
import { StatusTabs } from "~/components/ops/StatusTabs";
import { applyFilter, countsFor, resolveKey } from "~/lib/status-filter";
import { INCIDENT_FILTERS } from "~/lib/ops-filters";

const SEV_TONE: Record<string, "amber" | "blue" | "red"> = {
  L1: "amber",
  L2: "blue",
  L3: "red",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const [incidents, openBookings] = await Promise.all([
    rows<any>(
      admin
        .from("incidents")
        .select(
          "id, severity, summary, status, opened_at, timeline, booking:bookings(offering:offerings(title), trekker:users!bookings_trekker_id_fkey(full_name))",
        )
        .order("opened_at", { ascending: false }),
      "the incidents",
    ),
    rows<any>(
      admin
        .from("bookings")
        .select("id, start_date, offering:offerings(title), trekker:users!bookings_trekker_id_fkey(full_name)")
        .in("status", ["confirmed", "active"])
        .order("start_date"),
      "the open bookings",
    ),
  ]);
  const all = incidents.rows;
  const filter = resolveKey(INCIDENT_FILTERS, new URL(request.url).searchParams.get("status"));
  return data(
    {
      incidents: applyFilter(all, INCIDENT_FILTERS, filter, (i: any) => i.status),
      counts: countsFor(all, INCIDENT_FILTERS, (i: any) => i.status),
      filter,
      bookings: openBookings.rows,
      loadError: incidents.error ?? openBookings.error,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "create") {
    const out = await write(
      admin.from("incidents").insert({
        booking_id: String(form.get("booking_id")),
        severity: String(form.get("severity")),
        summary: String(form.get("summary")),
        status: "open",
        opened_by: user.id,
        timeline: [
          { at: new Date().toISOString(), actor: "ops", action: "Incident opened" },
        ],
      }),
      "the new incident",
    );
    if (!out.ok) return data({ error: out.error }, { status: 500, headers });
  } else if (intent === "status") {
    const id = String(form.get("id"));
    const status = String(form.get("status"));
    const patch: Record<string, unknown> = { status };
    if (status === "closed") patch.closed_at = new Date().toISOString();
    const out = await write(
      admin.from("incidents").update(patch).eq("id", id),
      "the incident status",
    );
    if (!out.ok) return data({ error: out.error }, { status: 500, headers });
  }
  return data({ ok: true }, { headers });
}

export default function OpsIncidents({ loaderData }: Route.ComponentProps) {
  const incidents = loaderData.incidents as any[];
  const { counts, filter } = loaderData as any;
  const bookings = loaderData.bookings as any[];
  const loadError = (loaderData as any).loadError as string | null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* A query that failed says so. An empty incidents list and a broken
          incidents query look identical otherwise, and on this page in
          particular that is the difference between "nobody is in trouble" and
          "we cannot see who is". */}
      {loadError && (
        <p
          role="alert"
          className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger lg:col-span-3"
        >
          {loadError}
        </p>
      )}
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-2xl">Incidents</h1>
          <StatusTabs filters={INCIDENT_FILTERS} current={filter} counts={counts} />
        </div>
        <Panel>
          {incidents.length === 0 ? (
            <EmptyRow>No incidents. Good.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {incidents.map((i) => (
                <li key={i.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>
                        <span className="text-sm font-medium">
                          {i.booking?.offering?.title ?? "—"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-ink-soft">{i.summary}</p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {i.booking?.trekker?.full_name} ·{" "}
                        {(i.timeline?.length ?? 0)} timeline entr
                        {(i.timeline?.length ?? 0) === 1 ? "y" : "ies"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={i.status === "closed" ? "neutral" : "amber"}
                      >
                        {i.status}
                      </Badge>
                      <Form method="post" className="flex gap-1">
                        <input type="hidden" name="intent" value="status" />
                        <input type="hidden" name="id" value={i.id} />
                        {i.status !== "monitoring" && (
                          <button
                            name="status"
                            value="monitoring"
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-black/5"
                          >
                            Monitor
                          </button>
                        )}
                        {i.status !== "closed" && (
                          <button
                            name="status"
                            value="closed"
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-black/5"
                          >
                            Close
                          </button>
                        )}
                      </Form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg">Open an incident</h2>
        <Panel>
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="create" />
            <label className="block">
              <span className="text-xs text-ink-soft">Booking</span>
              <select
                name="booking_id"
                required
                className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
              >
                <option value="">Select a booking…</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.offering?.title} — {b.trekker?.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-soft">Severity</span>
              <select
                name="severity"
                className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
              >
                <option value="L1">L1 — minor</option>
                <option value="L2">L2 — serious</option>
                <option value="L3">L3 — critical</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-soft">Summary</span>
              <textarea
                name="summary"
                required
                rows={3}
                className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
              />
            </label>
            <Button size="sm" type="submit" className="w-full">
              Open incident
            </Button>
          </Form>
        </Panel>
      </div>
    </div>
  );
}
