import type { Route } from "./+types/api.route";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { parseRouteForm, saveRoutePermits, uniqueRouteSlug } from "~/lib/routes.server";

/**
 * Add a route without leaving the listing you are in the middle of writing.
 *
 * "My route isn't listed" used to be a link to another page. A guide halfway
 * through a listing — kind, route, days, five priced lines, photographs —
 * had to leave it, fill in a second form, and come back. The draft survives in
 * localStorage, but the interruption is the cost, and on a phone it is the
 * point at which people stop.
 *
 * Same parse, same slug rules, same office queue as /g/routes/new; this is the
 * one-request version of it, so the form can drop the new route into its own
 * dropdown and carry on.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");

  const form = await request.formData();
  const { patch, permits, error } = parseRouteForm(form);
  if (!patch) return Response.json({ error }, { status: 400, headers });

  const slug = await uniqueRouteSlug(admin, patch.name);
  const { data: created, error: dbErr } = await admin
    .from("routes")
    .insert({
      ...patch,
      slug,
      // Pending, exactly as the full form does. A guide cannot publish a route
      // for everybody else by typing one here.
      status: "pending",
      created_by_guide_id: user.id,
      requires_licensed_guide: true,
    })
    .select("id, name, slug, typical_days, max_altitude_m, region, status")
    .single();

  if (dbErr || !created) {
    return Response.json(
      { error: dbErr?.message ?? "That route didn't save. Try again." },
      { status: 400, headers },
    );
  }

  await saveRoutePermits(admin, created.id, permits ?? []);
  // The route exists either way; a failure to notify the office is worth
  // saying out loud rather than losing the route over.
  const { error: noteErr } = await admin.from("guide_change_requests").insert({
    guide_id: user.id,
    note: `New route to review: ${patch.name} (${patch.region})`,
  });

  return Response.json(
    {
      route: created,
      warning: noteErr ? "Saved, but the office was not told. Mention it to them." : null,
    },
    { headers },
  );
}
