import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.events";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import {
  STATUS_COPY,
  eventDates,
  missingForLive,
  opsCanMove,
  type EventStatus,
} from "~/lib/events";
import { cn } from "~/lib/cn";

/**
 * The events desk.
 *
 * Anyone can propose a trip; the office is in the loop at exactly two points —
 * the accept, and the publish. Everything between is the organiser's to write.
 * Ordered by what is waiting on us, because a queue sorted by date is a queue
 * you have to read all of.
 */
const ORDER: EventStatus[] = [
  "submitted",
  "review",
  "accepted",
  "live",
  "draft",
  "declined",
  "cancelled",
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireUser(request, env, "ops");
  const [{ data: events }, { data: guides }] = await Promise.all([
    admin
      .from("events")
      .select("*, organiser:users!events_organiser_id_fkey(full_name, email)")
      .order("created_at", { ascending: false }),
    admin
      .from("public_guides")
      .select("user_id, full_name, home_district")
      .order("full_name"),
  ]);

  const list = (events ?? []).slice().sort((a, b) => {
    const d = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
    return d !== 0 ? d : String(b.created_at).localeCompare(String(a.created_at));
  });
  return data({ events: list, guides: guides ?? [] }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "ops");
  const form = await request.formData();
  const id = String(form.get("event_id") ?? "");
  const to = String(form.get("to") ?? "") as EventStatus;

  const { data: event } = await admin.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) return data({ error: "No such event." }, { status: 404, headers });

  if (String(form.get("intent")) === "assign") {
    const guideId = String(form.get("guide_id") ?? "") || null;
    await admin.from("events").update({ guide_id: guideId }).eq("id", id);
    return data({ ok: "Guide set." }, { headers });
  }

  // The transition table is the rule, not the buttons on the page — a stale
  // tab must not be able to publish something that was declined since.
  if (!opsCanMove(event.status as EventStatus, to)) {
    return data(
      { error: `Cannot go from ${event.status} to ${to}.` },
      { status: 400, headers },
    );
  }

  if (to === "live") {
    const missing = missingForLive(event);
    if (missing.length) {
      return data({ error: `Not ready — missing ${missing.join(", ")}.` }, { status: 400, headers });
    }
    if (!event.guide_id) {
      return data({ error: "Assign a guide before it goes live." }, { status: 400, headers });
    }
  }

  const patch: Record<string, unknown> = {
    status: to,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };
  if (to === "declined") patch.decline_reason = String(form.get("reason") ?? "").trim() || null;
  if (to === "live") patch.published_at = new Date().toISOString();
  if (form.has("ops_note")) patch.ops_note = String(form.get("ops_note") ?? "").trim() || null;

  const { error } = await admin.from("events").update(patch).eq("id", id);
  if (error) return data({ error: error.message }, { status: 400, headers });
  return data({ ok: `Moved to ${to}.` }, { headers });
}

export default function OpsEvents({ loaderData, actionData }: Route.ComponentProps) {
  const { events, guides } = loaderData as any;
  const nav = useNavigation();
  const waiting = events.filter((e: any) => e.status === "submitted" || e.status === "review");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Group trips</h1>
        <p className="mt-1 text-sm text-muted">
          Proposals from the public. <span className="font-mono">{waiting.length}</span> waiting on
          us.
        </p>
      </div>

      {(actionData as any)?.ok && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {(actionData as any).ok}
        </p>
      )}
      {(actionData as any)?.error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      {events.length === 0 && (
        <p className="rounded-md border border-line bg-card p-6 text-muted">
          Nothing proposed yet.
        </p>
      )}

      <ul className="space-y-4">
        {events.map((e: any) => {
          const status = e.status as EventStatus;
          const missing = missingForLive(e);
          return (
            <li key={e.id} className="rounded-md border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{e.title}</p>
                  <p className="mt-0.5 font-mono text-caption text-muted">
                    {eventDates(e.start_date, e.end_date)} · max {e.max_people}
                    {e.region ? ` · ${e.region}` : ""}
                  </p>
                  <p className="mt-0.5 text-caption text-muted">
                    {e.organiser?.full_name} · {e.organiser?.email}
                    {e.contact_phone ? ` · ${e.contact_phone}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-pill px-2.5 py-1 text-caption font-medium",
                    status === "submitted" || status === "review"
                      ? "bg-chartreuse text-pine"
                      : status === "live"
                        ? "bg-moss text-paper"
                        : "border border-line text-muted",
                  )}
                >
                  {STATUS_COPY[status].label}
                </span>
              </div>

              {e.pitch && (
                <p className="mt-3 whitespace-pre-line border-l-2 border-line pl-3 text-sm text-ink">
                  {e.pitch}
                </p>
              )}

              {(status === "accepted" || status === "review" || status === "live") && (
                <Form method="post" className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="intent" value="assign" />
                  <input type="hidden" name="event_id" value={e.id} />
                  <label className="text-caption text-ink-soft">
                    Guide
                    <select
                      name="guide_id"
                      defaultValue={e.guide_id ?? ""}
                      className="mt-1 block rounded border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
                    >
                      <option value="">— none —</option>
                      {guides.map((g: any) => (
                        <option key={g.user_id} value={g.user_id}>
                          {g.full_name} · {g.home_district}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="rounded border border-line px-3 py-1.5 text-sm text-ink hover:bg-mist">
                    Set
                  </button>
                </Form>
              )}

              {missing.length > 0 && status !== "submitted" && status !== "draft" && (
                <p className="mt-2 text-caption text-muted">
                  Organiser still owes: {missing.join(", ")}.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {status === "submitted" && (
                  <>
                    <Move id={e.id} to="accepted" label="Accept" primary busy={nav.state !== "idle"} />
                    <Decline id={e.id} />
                  </>
                )}
                {status === "review" && (
                  <>
                    <Move id={e.id} to="live" label="Publish" primary busy={nav.state !== "idle"} />
                    <Move id={e.id} to="accepted" label="Send back" busy={nav.state !== "idle"} />
                  </>
                )}
                {(status === "accepted" || status === "live") && (
                  <Move id={e.id} to="cancelled" label="Cancel" busy={nav.state !== "idle"} />
                )}
                {status === "declined" && (
                  <Move id={e.id} to="submitted" label="Reopen" busy={nav.state !== "idle"} />
                )}
                {status === "live" && (
                  <Link
                    to={`/events/${e.slug}`}
                    className="text-sm text-moss underline underline-offset-4"
                  >
                    View live →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Move({
  id,
  to,
  label,
  primary,
  busy,
}: {
  id: string;
  to: EventStatus;
  label: string;
  primary?: boolean;
  busy?: boolean;
}) {
  return (
    <Form method="post">
      <input type="hidden" name="event_id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button
        disabled={busy}
        className={cn(
          "rounded px-3.5 py-2 text-sm font-medium disabled:opacity-60",
          primary
            ? "bg-pine text-paper hover:bg-moss"
            : "border border-line text-ink hover:bg-mist",
        )}
      >
        {label}
      </button>
    </Form>
  );
}

/** Declining needs a reason — the organiser sees it on their own page. */
function Decline({ id }: { id: string }) {
  return (
    <Form method="post" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="event_id" value={id} />
      <input type="hidden" name="to" value="declined" />
      <input
        name="reason"
        required
        placeholder="Why not — they will read this"
        className="min-w-[16rem] rounded border border-line bg-paper px-3 py-2 text-sm text-ink"
      />
      <button className="rounded border border-line px-3.5 py-2 text-sm text-ember hover:bg-mist">
        Decline
      </button>
    </Form>
  );
}
