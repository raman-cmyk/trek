import { Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.experiences.$id";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { ExperienceForm } from "~/components/ExperienceForm";
import {
  diffOffering,
  logOfferingEdit,
  parseExperienceForm,
  saveOfferingPhotos,
} from "~/lib/offerings.server";
import { notifyListingEdited } from "~/lib/notifications.server";
import { Badge } from "~/components/ops/ui";
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
    admin.from("routes").select("id, name, status, typical_days, max_altitude_m, day_stops, permits(name, cost_usd_cents)").order("name"),
  ]);
  const { data: opsPhotos } = await admin
    .from("offering_photos")
    .select("url, alt_text")
    .eq("offering_id", params.id)
    .order("sort");
  if (!offering) throw new Response("Not found", { status: 404 });
  return data(
    {
      offering: {
        ...offering,
        photos: (opsPhotos ?? []).map((p: any) => ({ url: p.url, alt: p.alt_text })),
      },
      routes: routes ?? [],
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");

  if (["approve", "pause", "unpause"].includes(intent)) {
    const next = intent === "pause" ? "paused" : "live";
    await admin.from("offerings").update({ status: next }).eq("id", params.id);
    return data({ ok: next === "live" ? "Live." : "Paused." }, { headers });
  }

  const { patch, photos, error } = parseExperienceForm(form);
  if (!patch) return data({ error }, { status: 400, headers });

  // Read it first so the trail records what actually moved, not a snapshot.
  const { data: before } = await admin
    .from("offerings")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  const { error: dbErr } = await admin.from("offerings").update(patch).eq("id", params.id);
  if (dbErr) return data({ error: dbErr.message }, { status: 400, headers });
  await saveOfferingPhotos(admin, params.id!, photos ?? [], "ops");

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
  const { offering, routes } = loaderData as any;
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

      {offering.status === "pending" && (
        <form method="post">
          <input type="hidden" name="intent" value="approve" />
          <button className="rounded bg-moss px-5 py-2.5 text-sm font-medium text-white hover:bg-pine">
            Approve — put it live
          </button>
        </form>
      )}

      <ExperienceForm
        values={offering}
        routes={routes}
        guideId={offering.guide_id}
        submitLabel="Save changes"
        busy={nav.state !== "idle"}
      />
    </div>
  );
}
