import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/events.new";
import { pageMeta } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { eventSlug, validateProposal } from "~/lib/events";
import { slugTail } from "~/lib/groups";

export function meta() {
  return pageMeta({
    title: "Organise a trip — Trek",
    description:
      "Have a group and an idea? Tell us what you want to run. We handle the permits, find the guide, and put it on the site.",
    canonical: "",
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) throw redirect("/login?next=/events/new", { headers });
  const client = createPublicClient(env);
  const { data: routes } = await client
    .from("routes")
    .select("id, name, region")
    .order("name");
  return { routes: routes ?? [] };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) return redirect("/login?next=/events/new", { headers });

  const form = await request.formData();
  const str = (k: string) => String(form.get(k) ?? "").trim() || null;
  const proposal = {
    title: String(form.get("title") ?? "").trim(),
    pitch: str("pitch"),
    max_people: Number(form.get("max_people")) || 0,
    start_date: str("start_date"),
    end_date: str("end_date"),
  };
  const bad = validateProposal(proposal);
  if (bad) return data({ error: bad }, { status: 400, headers });

  const today = new Date().toISOString().slice(0, 10);
  if (proposal.start_date && proposal.start_date <= today) {
    return data({ error: "Pick a start date in the future." }, { status: 400, headers });
  }

  const admin = createAdminClient(env);
  const routeId = str("route_id");
  let region = str("region");
  if (routeId) {
    const { data: r } = await admin.from("routes").select("region").eq("id", routeId).maybeSingle();
    region = r?.region ?? region;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = eventSlug(proposal.title, slugTail(crypto.getRandomValues(new Uint8Array(8))));
    const { data: created, error } = await admin
      .from("events")
      .insert({
        ...proposal,
        slug,
        organiser_id: user.id,
        contact_phone: str("contact_phone"),
        route_id: routeId,
        region,
        // Straight to the office: a "save as draft" step here just means
        // proposals that sit unsent forever.
        status: "submitted",
      })
      .select("slug")
      .single();
    if (error?.code === "23505") continue;
    if (error) return data({ error: error.message }, { status: 400, headers });
    return redirect(`/events/${created.slug}/edit`, { headers });
  }
  return data({ error: "Could not send it. Try a different name." }, { status: 400, headers });
}

export default function NewEvent({ loaderData, actionData }: Route.ComponentProps) {
  const { routes } = loaderData as any;
  const nav = useNavigation();
  const field =
    "mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss";
  const label = "block text-sm text-ink-soft";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/events" className="text-sm text-moss hover:underline">
        ← Group trips
      </Link>
      <h1 className="mt-2 font-display text-4xl leading-[1.05] text-ink">
        Tell us what you want to run.
      </h1>
      <p className="mt-4 max-w-[56ch] text-body-l text-ink">
        You bring the group and the idea. We check it, sort the permits, find
        the right guide, and put it on the site so other people can join. You do
        not need to be a guide — most organisers are not.
      </p>

      {(actionData as any)?.error && (
        <p className="mt-5 rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      {/* Only what the office needs to say yes or no. Everything else comes
          after — asking for an itinerary before we have agreed to run it is
          how you get abandoned forms. */}
      <Form method="post" className="mt-7 space-y-5">
        <label className={label}>
          What is it called
          <input
            name="title"
            required
            maxLength={120}
            placeholder="Gokyo for photographers, November"
            className={field}
          />
        </label>

        <label className={label}>
          What is it, and who is it for?
          <textarea
            name="pitch"
            required
            rows={5}
            placeholder="Eight of us, slow days so there is time to shoot the lakes at dawn. Mixed ability — two have never been above 3,000 m."
            className={field}
          />
          <span className="mt-1 block text-caption text-muted">
            A few sentences. This is all we read to decide.
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Where — if you know
            <select name="route_id" className={field} defaultValue="">
              <option value="">— not decided —</option>
              {routes.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.region}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            How many people, at most
            <input
              type="number"
              name="max_people"
              min={2}
              max={40}
              defaultValue={8}
              required
              className={field}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Roughly from
            <input type="date" name="start_date" className={field} />
          </label>
          <label className={label}>
            Until
            <input type="date" name="end_date" className={field} />
          </label>
        </div>

        <label className={label}>
          A phone number we can reach you on
          <input name="contact_phone" placeholder="+977…" className={field} />
        </label>

        <button
          disabled={nav.state !== "idle"}
          className="rounded bg-pine px-5 py-3 font-medium text-paper hover:bg-moss disabled:opacity-60"
        >
          {nav.state !== "idle" ? "Sending…" : "Send it to the office"}
        </button>
        <p className="text-caption text-muted">
          Nothing goes public yet. We read it, come back to you, and only then
          do you fill in the rest.
        </p>
      </Form>
    </main>
  );
}
