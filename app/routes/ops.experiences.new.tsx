import { Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/ops.experiences.new";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { ExperienceForm } from "~/components/ExperienceForm";
import { parseExperienceForm, saveOfferingPhotos, uniqueOfferingSlug } from "~/lib/offerings.server";

/**
 * The office lists a trip for a guide.
 *
 * Half the guides on this platform will never fill in a five-step form on a
 * phone — they will ring the office and describe the trek they have run for
 * eleven years. Until now there was nowhere for that call to go: /ops
 * /experiences could edit any experience but create none, so the only way an
 * offering could come into existence was a guide typing it himself. A guide
 * waiting on verification could not even do that (no tab bar), which is how
 * "I can't create a day hike" happens to somebody with a verified account and
 * an ops login.
 *
 * It is born a draft. Publishing stays where it already was — the editor's
 * own Live button — so there is one publish path, not two.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const [{ data: guides }, { data: routes }] = await Promise.all([
    admin
      .from("guides")
      .select("user_id, status, users(full_name)")
      .in("status", ["verified", "in_review", "applied"])
      .order("status"),
    admin
      .from("routes")
      .select("id, name, status, typical_days, max_altitude_m, day_stops, permits(name, cost_usd_cents)")
      .order("name"),
  ]);
  return data(
    {
      guides: (guides ?? []).map((g: any) => ({
        user_id: g.user_id,
        full_name: g.users?.full_name ?? "Unnamed guide",
        status: g.status,
      })),
      routes: routes ?? [],
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const guideId = String(form.get("guide_id") ?? "").trim();
  if (!guideId) {
    return data({ error: "Pick which guide this belongs to." }, { status: 400, headers });
  }
  // Photos are not demanded here the way they are of a guide: the office is
  // often typing from a phone call and the pictures follow by email.
  const { patch, photos, error } = parseExperienceForm(form);
  if (!patch) return data({ error }, { status: 400, headers });

  const slug = await uniqueOfferingSlug(admin, patch.title);
  const { data: created, error: dbErr } = await admin
    .from("offerings")
    .insert({ ...patch, slug, guide_id: guideId, status: "draft" })
    .select("id")
    .single();
  if (dbErr || !created) {
    return data(
      { error: dbErr?.message ?? "That did not save. Try again." },
      { status: 400, headers },
    );
  }
  await saveOfferingPhotos(admin, created.id, photos ?? []);
  // Straight to the editor, which is where publishing lives.
  return redirect(`/ops/experiences/${created.id}`, { headers });
}

export default function OpsNewExperience({ loaderData, actionData }: Route.ComponentProps) {
  const { guides, routes } = loaderData as any;
  const nav = useNavigation();
  return (
    <div className="space-y-5">
      <div>
        <Link to="/ops/experiences" className="text-sm text-primary hover:underline">
          ← Experiences
        </Link>
        <h1 className="mt-1 font-display text-2xl">List a trip for a guide</h1>
        <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">
          The same form the guide fills in. It saves as a draft — open it
          afterwards and press Live when you are happy with it.
        </p>
      </div>
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}
      <ExperienceForm
        routes={routes}
        guideId=""
        guides={guides}
        submitLabel="Save as draft"
        busy={nav.state !== "idle"}
      />
    </div>
  );
}
