import { Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/g.experiences.new";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { ExperienceForm } from "~/components/ExperienceForm";
import { parseExperienceForm, uniqueOfferingSlug } from "~/lib/offerings.server";

/**
 * A guide lists a new experience. It is born `pending`: the office checks it
 * once — the price adds up, the route is real, the photo is his — and flips
 * it live. Nothing a guide types here can appear on the public site without
 * that one look.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { data: routes } = await admin.from("routes").select("id, name").order("name");
  return data({ routes: routes ?? [], guideId: user.id }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { patch, error } = parseExperienceForm(await request.formData());
  if (!patch) return data({ error }, { status: 400, headers });

  const slug = await uniqueOfferingSlug(admin, patch.title);
  const { error: dbErr } = await admin.from("offerings").insert({
    ...patch,
    slug,
    guide_id: user.id,
    status: "pending",
  });
  if (dbErr) return data({ error: "That did not save. Try again." }, { status: 400, headers });

  // The office finds out through the queue it already watches.
  await admin.from("guide_change_requests").insert({
    guide_id: user.id,
    note: `New experience to review: ${patch.title}`,
  });
  return redirect("/g/experiences", { headers });
}

export default function NewExperience({ loaderData, actionData }: Route.ComponentProps) {
  const { routes, guideId } = loaderData as any;
  const nav = useNavigation();
  return (
    <div className="space-y-5">
      <div>
        <Link to="/g/experiences" className="text-sm text-primary hover:underline">
          ← Your experiences
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">Add an experience</h1>
        <p className="mt-1 max-w-[46ch] text-sm text-ink-soft">
          Fill it in, send it, and the office checks it once. Then it is live
          on your page and people can book it.
        </p>
      </div>
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">{(actionData as any).error}</p>
      )}
      <ExperienceForm
        routes={routes}
        guideId={guideId}
        submitLabel="Send to the office"
        busy={nav.state !== "idle"}
      />
    </div>
  );
}
