import { Form, Link, data, useSearchParams } from "react-router";
import type { Route } from "./+types/ops.incidents";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";
import { getEnv, requireOps } from "~/lib/supabase.server";

/**
 * The stages an incident passes through, in that order, plus "everything".
 *
 * Open and monitoring were mixed into one list with closed ones, so the
 * question the office actually has — what still needs a person — took reading
 * every row. The counts are on the chips, because a filter that hides how
 * many it would show is a filter you press to find out.
 */
const STAGES = [
  { key: "needs_action", label: "Needs a person", match: ["open", "monitoring"] },
  { key: "open", label: "Open", match: ["open"] },
  { key: "monitoring", label: "Monitoring", match: ["monitoring"] },
  { key: "closed", label: "Closed", match: ["closed"] },
  { key: "all", label: "Everything", match: ["open", "monitoring", "closed"] },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

function stageFor(raw: string | null): (typeof STAGES)[number] {
  return STAGES.find((s) => s.key === raw) ?? STAGES[0];
}

const SEV_TONE: Record<string, "amber" | "blue" | "red"> = {
  L1: "amber",
  L2: "blue",
  L3: "red",
};

/** L3 is somebody in trouble on a mountain. It goes first, whatever its age. */
const SEV_RANK: Record<string, number> = { L1: 1, L2: 2, L3: 3 };

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const [{ data: incidents }, { data: bookings }] = await Promise.all([
    admin
      .from("incidents")
      .select(
        "id, severity, summary, status, opened_at, timeline, booking:bookings(offering:offerings(title), trekker:users!bookings_trekker_id_fkey(full_name))",
      )
      .order("opened_at", { ascending: false }),
    admin
      .from("bookings")
      .select("id, start_date, offering:offerings(title), trekker:users!bookings_trekker_id_fkey(full_name)")
      .in("status", ["confirmed", "active"])
      .order("start_date"),
  ]);
  const all = incidents ?? [];
  const stage = stageFor(new URL(request.url).searchParams.get("stage"));
  const counts = {
    needs_action: all.filter((i: any) => i.status !== "closed").length,
    open: all.filter((i: any) => i.status === "open").length,
    monitoring: all.filter((i: any) => i.status === "monitoring").length,
    closed: all.filter((i: any) => i.status === "closed").length,
    all: all.length,
  } as Record<StageKey, number>;

  return data(
    {
      incidents: all.filter((i: any) => (stage.match as readonly string[]).includes(i.status)),
      total: all.length,
      stage: stage.key,
      counts,
      bookings: bookings ?? [],
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
    await admin.from("incidents").insert({
      booking_id: String(form.get("booking_id")),
      severity: String(form.get("severity")),
      summary: String(form.get("summary")),
      status: "open",
      opened_by: user.id,
      timeline: [
        { at: new Date().toISOString(), actor: "ops", action: "Incident opened" },
      ],
    });
  } else if (intent === "status") {
    const id = String(form.get("id"));
    const status = String(form.get("status"));
    const patch: Record<string, unknown> = { status };
    if (status === "closed") patch.closed_at = new Date().toISOString();
    await admin.from("incidents").update(patch).eq("id", id);
  }
  return data({ ok: true }, { headers });
}

export default function OpsIncidents({ loaderData }: Route.ComponentProps) {
  const incidents = loaderData.incidents as any[];
  const bookings = loaderData.bookings as any[];
  const { stage, counts, total } = loaderData as any;
  const [params] = useSearchParams();

  const chipHref = (key: string) => {
    const p = new URLSearchParams(params);
    p.set("stage", key);
    return `/ops/incidents?${p.toString()}`;
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-2xl">Incidents</h1>
          <p className="text-sm text-ink-soft">
            {counts.needs_action === 0
              ? `Nothing needs a person. ${total} on record.`
              : `${counts.needs_action} need a person, of ${total} on record.`}
          </p>
        </div>

        {/* The filter. Keeping the current stage in the URL means a shift
            handover can be a pasted link. */}
        <div className="flex flex-wrap items-center gap-2">
          {STAGES.map((s) => (
            <Link
              key={s.key}
              to={chipHref(s.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                stage === s.key
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-ink-soft hover:bg-black/5",
              )}
            >
              {s.label}
              <span className="ml-1.5 font-mono text-xs text-ink-soft">
                {counts[s.key as StageKey]}
              </span>
            </Link>
          ))}
        </div>

        <Panel>
          {incidents.length === 0 ? (
            <EmptyRow>
              {stage === "needs_action"
                ? "Nothing needs a person. Good."
                : total === 0
                  ? "No incidents. Good."
                  : "Nothing at this stage."}
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {[...incidents]
                .sort(
                  (a, b) =>
                    (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0) ||
                    String(a.opened_at).localeCompare(String(b.opened_at)),
                )
                .map((i) => (
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
