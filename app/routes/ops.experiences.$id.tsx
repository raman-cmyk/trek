import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.experiences.$id";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { ExperienceForm } from "~/components/ExperienceForm";
import {
  diffOffering,
  logOfferingEdit,
  parseExperienceForm,
  pauseOffering,
  daysFromRoute,
  saveOfferingPhotos,
  unpauseOffering,
} from "~/lib/offerings.server";
import {
  notifyListingEdited,
  notifyListingLive,
  notifyListingPaused,
} from "~/lib/notifications.server";
import { PAUSE_REASON_MAX, pausedFor } from "~/lib/pause";
import { Badge } from "~/components/ops/ui";
import { ChecklistPanel } from "~/components/ops/ChecklistPanel";
import { firstName } from "~/lib/names";

/**
 * The office edits any experience — same form the guide fills, full
 * authority. "In the admin we should be able to edit and fix any experience
 * that is there."
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const [{ data: offering }, { data: routes }] = await Promise.all([
    admin
      .from("offerings")
      .select("*, guide:guides!offerings_guide_id_fkey(slug, users(full_name))")
      .eq("id", params.id)
      .maybeSingle(),
    admin.from("routes").select("id, slug, name, status, typical_days, max_altitude_m, day_stops, permits(name, cost_usd_cents)").order("name"),
  ]);
  const { data: opsPhotos } = await admin
    .from("offering_photos")
    .select("url, alt_text")
    .eq("offering_id", params.id)
    .order("sort");
  if (!offering) throw new Response("Not found", { status: 404 });
  // Every time this listing went up or came down, and why. The reason on the
  // row describes the pause it is in now; this is the decision trail the
  // office argues from a month later.
  const { data: history } = await admin
    .from("offering_edits")
    .select("changed, created_at, editor:users!offering_edits_editor_id_fkey(full_name)")
    .eq("offering_id", params.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const pauses = (history ?? []).filter((h: any) => h.changed?.status);

  // Is this ready to be seen by a trekker in Berlin? There was no list for
  // that at all — an experience went live when somebody pressed publish, and
  // whether it had photographs or a price that added up was a matter of who
  // looked (0105).
  const { listTasksFor, runChecklist, syncOfferingChecklist } = await import(
    "~/lib/checklists.server"
  );
  await runChecklist(admin, {
    type: "offering",
    id: params.id!,
    appliesTo: (offering as any).kind,
    createdAt: (offering as any).created_at,
  });
  await syncOfferingChecklist(admin, params.id!);
  const tasks = await listTasksFor(admin, { type: "offering", id: params.id! });

  return data(
    {
      tasks,
      offering: {
        ...offering,
        photos: (opsPhotos ?? []).map((p: any) => ({ url: p.url, alt: p.alt_text })),
      },
      routes: routes ?? [],
      pauses,
      now: new Date().toISOString(),
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");

  // Its go-live checklist — the same three intents as a trip's or a guide's.
  const { handleTaskIntent } = await import("~/lib/tasks.server");
  const taskWrite = await handleTaskIntent(admin, {
    intent,
    subjectId: params.id!,
    form,
    by: user.id,
  });
  if (taskWrite) {
    return data(taskWrite.ok ? { ok: taskWrite.message } : { error: taskWrite.error }, {
      status: taskWrite.ok ? 200 : 400,
      headers,
    });
  }

  if (intent === "pause") {
    const res = await pauseOffering(admin, {
      offeringId: params.id!,
      editorId: user.id,
      reason: String(form.get("reason") ?? ""),
    });
    if (res.error) return data({ error: res.error }, { status: 400, headers });
    if (res.guideId) {
      await notifyListingPaused(env, admin, {
        guideId: res.guideId,
        offeringId: params.id!,
        title: res.title ?? "",
        reason: String(form.get("reason") ?? "").trim(),
      });
    }
    return data({ ok: "Paused. The guide has been told why." }, { headers });
  }

  if (intent === "unpause") {
    const res = await unpauseOffering(admin, { offeringId: params.id!, editorId: user.id });
    if (res.error) return data({ error: res.error }, { status: 400, headers });
    if (res.guideId) {
      await notifyListingLive(env, admin, {
        guideId: res.guideId,
        offeringId: params.id!,
        title: res.title ?? "",
      });
    }
    return data({ ok: "Live again." }, { headers });
  }

  if (intent === "approve") {
    await admin.from("offerings").update({ status: "live" }).eq("id", params.id);
    return data({ ok: "Live." }, { headers });
  }

  const { patch, photos, error } = parseExperienceForm(form);
  if (!patch) return data({ error }, { status: 400, headers });

  // A trek is exactly as long as its route (offerings.server.ts).

  patch.days = await daysFromRoute(admin, patch.route_id ?? null, patch.days);

  // Read it first so the trail records what actually moved, not a snapshot.
  const { data: before } = await admin
    .from("offerings")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  const { error: dbErr } = await admin.from("offerings").update(patch).eq("id", params.id);
  if (dbErr) return data({ error: dbErr.message }, { status: 400, headers });
  const pics = await saveOfferingPhotos(admin, params.id!, photos ?? [], "ops");
  if (!pics.ok) return data({ error: pics.error }, { status: 500, headers });

  // The office editing a guide's listing is the concierge model working, not
  // an exception to it — but the guide has to be told, and it has to be
  // written down with a name against it.
  const changed = diffOffering(before ?? {}, patch);
  if (Object.keys(changed).length) {
    await logOfferingEdit(admin, {
      offeringId: params.id!,
      editorId: user.id,
      editorRole: "ops",
      changed,
    });
    if (before?.guide_id) {
      await notifyListingEdited(env, admin, {
        guideId: before.guide_id,
        offeringId: params.id!,
        title: patch.title,
        fields: Object.keys(changed),
      });
    }
  }
  return data({ ok: "Saved. The guide has been told." }, { headers });
}

export default function OpsExperienceEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { offering, routes, pauses, now, tasks } = loaderData as any;
  const nav = useNavigation();
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link to="/ops/experiences" className="text-sm text-primary hover:underline">
          ← All experiences
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl text-ink">{offering.title}</h1>
          <Badge tone={offering.status === "live" ? "green" : offering.status === "pending" ? "amber" : "neutral"}>
            {offering.status}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">
          by {firstName(offering.guide?.users?.full_name)} ·{" "}
          <Link to={`/guides/${offering.guide?.slug}`} className="text-primary hover:underline">
            public page →
          </Link>
        </p>
      </div>

      {actionData && "ok" in actionData && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{(actionData as any).ok}</p>
      )}
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">{(actionData as any).error}</p>
      )}

      {/* Is this ready for a trekker in Berlin? Above the approve button on
          purpose: most of it the page can answer itself, and the rest —
          the test booking, the price checked line by line — is what somebody
          has to say they did. */}
      <ChecklistPanel
        tasks={tasks}
        title="Ready to go live?"
        today={now.slice(0, 10)}
        emptyNote="No go-live list is running on this experience yet."
      />

      {offering.status === "pending" && (
        <form method="post">
          <input type="hidden" name="intent" value="approve" />
          <button className="rounded bg-moss px-5 py-2.5 text-sm font-medium text-white hover:bg-pine">
            Approve — put it live
          </button>
        </form>
      )}

      {/* Off the market, and the reason it came off — at the top, because it
          is the first thing anybody opening this page needs to know. */}
      {offering.status === "paused" && (
        <div className="rounded-card border border-ember/30 bg-ember/5 p-4">
          <p className="label text-ember">Paused — nobody can book this</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">
            {offering.paused_reason || (
              <span className="italic text-muted">
                No reason was recorded. It was paused before the office started writing one down.
              </span>
            )}
          </p>
          {pausedFor(offering.paused_at, now) && (
            <p className="mt-1 text-caption text-muted">Off the market since {pausedFor(offering.paused_at, now)}.</p>
          )}
          <form method="post" className="mt-3">
            <input type="hidden" name="intent" value="unpause" />
            <button className="rounded bg-moss px-4 py-2 text-sm font-medium text-white hover:bg-pine">
              Put it back live
            </button>
          </form>
        </div>
      )}

      {offering.status === "live" && (
        <details className="rounded-card border border-line bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            Take this off the market
          </summary>
          <Form method="post" className="mt-3 space-y-2">
            <input type="hidden" name="intent" value="pause" />
            <label className="block text-sm text-ink" htmlFor="pause-reason">
              Why is it coming down?
            </label>
            <textarea
              id="pause-reason"
              name="reason"
              rows={3}
              required
              maxLength={PAUSE_REASON_MAX}
              placeholder="The summit photo is not his — it is off a stock site."
              className="w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-moss"
            />
            <p className="text-caption text-muted">
              The guide is sent this by SMS and email, so write it to them.
            </p>
            <button className="rounded bg-ember px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Pause it
            </button>
          </Form>
        </details>
      )}

      {/* The decision trail: every time this listing went up or came down. */}
      {pauses.length > 0 && (
        <details className="rounded-card border border-line bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            On and off the market ({pauses.length})
          </summary>
          <ul className="mt-3 divide-y divide-line text-sm">
            {pauses.map((h: any, i: number) => (
              <li key={i} className="py-2">
                <p className="text-ink">
                  <span className="font-medium">
                    {h.changed.status.to === "paused" ? "Paused" : "Put back live"}
                  </span>{" "}
                  <span className="text-ink-soft">
                    by {h.editor?.full_name ?? "the office"} ·{" "}
                    {new Date(h.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </p>
                {h.changed.paused_reason?.to && (
                  <p className="mt-0.5 whitespace-pre-wrap text-ink-soft">
                    {h.changed.paused_reason.to}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ExperienceForm
        values={offering}
        routes={routes}
        guideId={offering.guide_id}
        submitLabel="Save changes"
        busy={nav.state !== "idle"}
        canEditRoute
      />
    </div>
  );
}
