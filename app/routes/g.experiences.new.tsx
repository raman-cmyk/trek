import { Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/g.experiences.new";
import { getEnv } from "~/lib/supabase.server";
import { guideGate, outstandingChecks } from "~/lib/guide-gate.server";
import { requireUser } from "~/lib/auth.server";
import { ExperienceForm } from "~/components/ExperienceForm";
import {
  parseExperienceForm,
  daysFromRoute,
  saveOfferingPhotos,
  uniqueOfferingSlug,
} from "~/lib/offerings.server";

/**
 * A guide lists a new experience. It is born `pending`: the office checks it
 * once — the price adds up, the route is real, the photo is his — and flips
 * it live. Nothing a guide types here can appear on the public site without
 * that one look.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");

  // Shut until the papers are checked. Somebody who has done nothing but fill
  // in a form was being handed a listing builder, which reads as "you are in".
  const gate = await guideGate(admin, user.id);
  if (!gate.canList) {
    return data(
      { gate, waitingOn: await outstandingChecks(admin, user.id), routes: [], guideId: user.id },
      { headers },
    );
  }

  const { data: routes } = await admin
      .from("routes")
      .select("id, name, status, typical_days, max_altitude_m, day_stops, permits(name, cost_usd_cents)")
      .or(`status.eq.live,created_by_guide_id.eq.${user.id}`)
      .order("name");
  return data({ gate, waitingOn: [] as string[], routes: routes ?? [], guideId: user.id }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  // Checked again here, not only in the loader: a form kept open across a
  // suspension would otherwise still post.
  const gate = await guideGate(admin, user.id);
  if (!gate.canList) {
    return data(
      { error: "Your account is not verified yet, so listings cannot be saved." },
      { status: 403, headers },
    );
  }
  const { patch, photos, error } = parseExperienceForm(await request.formData(), {
    minPhotos: 3,
  });
  if (!patch) return data({ error }, { status: 400, headers });
  // A trek is exactly as long as its route (offerings.server.ts).
  patch.days = await daysFromRoute(admin, patch.route_id ?? null, patch.days);

  const slug = await uniqueOfferingSlug(admin, patch.title);
  const { data: created, error: dbErr } = await admin
    .from("offerings")
    .insert({ ...patch, slug, guide_id: user.id, status: "pending" })
    .select("id")
    .single();
  if (dbErr || !created) {
    return data({ error: "That did not save. Try again." }, { status: 400, headers });
  }
  const pics = await saveOfferingPhotos(admin, created.id, photos ?? []);
  if (!pics.ok) return data({ error: pics.error }, { status: 500, headers });

  // The office finds out through the queue it already watches.
  await admin.from("guide_change_requests").insert({
    guide_id: user.id,
    note: `New experience to review: ${patch.title}`,
  });
  return redirect("/g/experiences", { headers });
}

export default function NewExperience({ loaderData, actionData }: Route.ComponentProps) {
  const { routes, guideId, gate, waitingOn } = loaderData as any;
  const nav = useNavigation();

  // A locked page with no reason is how a good guide decides we are not
  // serious. Say what is outstanding, and who is holding it.
  if (!gate?.canList) {
    return (
      <div className="space-y-4">
        <Link to="/g/experiences" className="text-sm text-primary hover:underline">
          ← Your experiences
        </Link>
        <div className="rounded-card border border-border bg-card p-5">
          <h1 className="font-display text-2xl text-ink">
            {gate?.standing === "stopped"
              ? "Your account is on hold"
              : "We are checking your papers"}
          </h1>
          {gate?.standing === "stopped" ? (
            <p className="mt-2 text-sm text-ink-soft">
              You cannot add or change listings while that stands. Message the
              office and we will tell you where it is.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-soft">
                Listings open as soon as a person in Kathmandu has been through
                your file. It is one look, by a human, and it is what lets us
                promise a trekker in Berlin that you are real.
              </p>
              {waitingOn?.length > 0 && (
                <>
                  <p className="mt-3 text-sm font-medium text-ink">
                    Still with us:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">
                    {waitingOn.map((w: string) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-3 text-sm text-ink-soft">
                Nothing is lost in the meantime — finish your profile and your
                photo, and the day you are verified you can list in minutes.
              </p>
            </>
          )}
          <Link
            to="/g"
            className="mt-4 inline-block rounded-button bg-pine px-3 py-1.5 text-sm font-medium text-paper hover:bg-moss"
          >
            Back to your dashboard
          </Link>
        </div>
      </div>
    );
  }

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
