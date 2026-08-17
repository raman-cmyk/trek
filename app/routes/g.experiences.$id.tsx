import { Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/g.experiences.$id";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { ExperienceForm } from "~/components/ExperienceForm";
import { parseExperienceForm, saveOfferingPhotos } from "~/lib/offerings.server";
import { Badge } from "~/components/ops/ui";
import { fmtDate } from "~/lib/format";

/**
 * A guide edits an experience he already listed.
 *
 * Rules by status:
 *   draft / pending — edit freely; it has never been public.
 *   live            — edits apply at once (his trip, his price), and the
 *                     office is notified through the change queue so a bad
 *                     edit is caught the same day rather than never.
 *   paused          — a guide can pause a live trip (monsoon, injury) and
 *                     put it back live himself; it was already approved.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const [{ data: offering }, { data: routes }] = await Promise.all([
    admin.from("offerings").select("*").eq("id", params.id).eq("guide_id", user.id).maybeSingle(),
    admin
      .from("routes")
      .select("id, name, status, typical_days, max_altitude_m, day_stops, permits(name, cost_usd_cents)")
      .or(`status.eq.live,created_by_guide_id.eq.${user.id}`)
      .order("name"),
  ]);
  if (!offering) throw new Response("Not found", { status: 404 });
  // What the office has changed on this listing, so a guide is never looking
  // at an edit they did not make with no idea where it came from.
  const { data: edits } = await admin
    .from("offering_edits")
    .select("changed, created_at, editor_role")
    .eq("offering_id", offering.id)
    .eq("editor_role", "ops")
    .order("created_at", { ascending: false })
    .limit(5);
  // The gallery has to arrive with the form, or saving would post an empty
  // list and wipe the photographs that are already there.
  const { data: photos } = await admin
    .from("offering_photos")
    .select("url, alt_text")
    .eq("offering_id", offering.id)
    .order("sort");
  return data(
    {
      offering: {
        ...offering,
        photos: (photos ?? []).map((p: any) => ({ url: p.url, alt: p.alt_text })),
      },
      routes: routes ?? [],
      guideId: user.id,
      edits: edits ?? [],
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");

  const { data: offering } = await admin
    .from("offerings")
    .select("id, status, title")
    .eq("id", params.id)
    .eq("guide_id", user.id)
    .maybeSingle();
  if (!offering) throw new Response("Not found", { status: 404 });

  if (intent === "pause" || intent === "unpause") {
    if (!["live", "paused"].includes(offering.status)) {
      return data({ error: "Only a live experience can be paused." }, { status: 400, headers });
    }
    await admin
      .from("offerings")
      .update({ status: intent === "pause" ? "paused" : "live" })
      .eq("id", offering.id);
    return data(
      { ok: intent === "pause" ? "Paused — hidden from the site until you turn it back on." : "Live again." },
      { headers },
    );
  }

  const { patch, photos, error } = parseExperienceForm(form, { minPhotos: 3 });
  if (!patch) return data({ error }, { status: 400, headers });

  const { error: dbErr } = await admin.from("offerings").update(patch).eq("id", offering.id);
  if (dbErr) return data({ error: "That did not save. Try again." }, { status: 400, headers });
  await saveOfferingPhotos(admin, offering.id, photos ?? []);

  if (offering.status === "live") {
    await admin.from("guide_change_requests").insert({
      guide_id: user.id,
      note: `Live experience edited: ${patch.title}`,
    });
  }
  return data({ ok: "Saved." }, { headers });
}

export default function EditExperience({ loaderData, actionData }: Route.ComponentProps) {
  const { offering, routes, guideId, edits } = loaderData as any;
  const nav = useNavigation();
  return (
    <div className="space-y-5">
      <div>
        <Link to="/g/experiences" className="text-sm text-primary hover:underline">
          ← Your experiences
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl text-ink">{offering.title}</h1>
          <Badge tone={offering.status === "live" ? "green" : offering.status === "pending" ? "amber" : "neutral"}>
            {offering.status}
          </Badge>
        </div>
        {offering.status === "pending" && (
          <p className="mt-1 text-sm text-ink-soft">
            With the office — you can keep editing while they look.
          </p>
        )}
      </div>

      {actionData && "ok" in actionData && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{(actionData as any).ok}</p>
      )}
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">{(actionData as any).error}</p>
      )}

      {edits.length > 0 && (
        <section className="rounded-card border border-border bg-card p-4">
          <p className="text-sm font-medium text-ink">Changes our office made</p>
          <ul className="mt-1.5 space-y-1 text-caption text-ink-soft">
            {edits.map((e: any) => (
              <li key={e.created_at} className="flex flex-wrap gap-x-2">
                <span className="font-mono text-muted">{fmtDate(e.created_at)}</span>
                <span>{Object.keys(e.changed).join(", ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-caption text-muted">
            Anything here look wrong? Tell us and we will put it back.
          </p>
        </section>
      )}

      <ExperienceForm
        values={offering}
        routes={routes}
        guideId={guideId}
        submitLabel="Save changes"
        busy={nav.state !== "idle"}
      />

      {["live", "paused"].includes(offering.status) && (
        <form method="post" className="border-t border-line pt-4">
          <input type="hidden" name="intent" value={offering.status === "live" ? "pause" : "unpause"} />
          <button className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            {offering.status === "live"
              ? "Pause it — hide from the site for now"
              : "Put it back live"}
          </button>
        </form>
      )}
    </div>
  );
}
