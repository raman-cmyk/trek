import { Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/g.routes.new";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { RouteBuilder } from "~/components/RouteBuilder";
import { parseRouteForm, saveRoutePermits, uniqueRouteSlug } from "~/lib/routes.server";

/**
 * A guide adds a route we do not carry.
 *
 * It is born `pending`. The guide can put trips on it straight away — that is
 * the point, they are usually here because they have a trip to list — but the
 * database will not let one of those trips go live until the office has looked
 * at the route.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { headers } = await requireUser(request, env, "guide");
  return data({}, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { patch, permits, error } = parseRouteForm(await request.formData());
  if (!patch) return data({ error }, { status: 400, headers });

  const slug = await uniqueRouteSlug(admin, patch.name);
  const { data: created, error: dbErr } = await admin
    .from("routes")
    .insert({
      ...patch,
      slug,
      status: "pending",
      created_by_guide_id: user.id,
      requires_licensed_guide: true,
    })
    .select("id")
    .single();
  if (dbErr || !created) {
    return data({ error: "That did not save. Try again." }, { status: 400, headers });
  }
  await saveRoutePermits(admin, created.id, permits ?? []);

  // The office finds out through the queue it already watches.
  await admin.from("guide_change_requests").insert({
    guide_id: user.id,
    note: `New route to review: ${patch.name} (${patch.region})`,
  });
  return redirect("/g/experiences/new?route_added=1", { headers });
}

export default function NewRoute({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  return (
    <div className="space-y-5">
      <div>
        <Link to="/g/experiences" className="text-sm text-primary hover:underline">
          ← Your experiences
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">Add a route</h1>
        <p className="mt-1 max-w-[46ch] text-sm text-ink-soft">
          If you walk something we don&rsquo;t list, write it here. Once the
          office checks it, it becomes a page on the site with your name on it —
          and other guides can run it too.
        </p>
      </div>
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}
      <RouteBuilder busy={nav.state !== "idle"} />
    </div>
  );
}
