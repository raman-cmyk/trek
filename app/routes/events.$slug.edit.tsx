import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/events.$slug.edit";
import { pageMeta } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { MediaPicker } from "~/components/MediaPicker";
import { parseMedia } from "~/lib/journals.server";
import {
  STATUS_COPY,
  missingForLive,
  organiserCanEdit,
  validateProposal,
  type EventStatus,
} from "~/lib/events";
import { cn } from "~/lib/cn";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return pageMeta({
    title: `${(d as any)?.event?.title ?? "Your trip"} — Trek`,
    description: "Your group trip.",
    canonical: "",
    noindex: true,
  });
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const next = `/events/${params.slug}/edit`;
  if (!user) throw redirect(`/login?next=${encodeURIComponent(next)}`, { headers });

  const admin = createAdminClient(env);
  const { data: event } = await admin
    .from("events")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!event) throw new Response("Not found", { status: 404 });
  if (event.organiser_id !== user.id) throw new Response("Not yours", { status: 403 });

  const client = createPublicClient(env);
  const [{ data: routes }, { data: signups }] = await Promise.all([
    client.from("routes").select("id, name, region").order("name"),
    admin
      .from("event_signups")
      .select("party_size, note, status, users(full_name)")
      .eq("event_id", event.id)
      .order("created_at"),
  ]);

  return data({ event, routes: routes ?? [], signups: signups ?? [] }, { headers });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const next = `/events/${params.slug}/edit`;
  if (!user) return redirect(`/login?next=${encodeURIComponent(next)}`, { headers });

  const admin = createAdminClient(env);
  const { data: event } = await admin
    .from("events")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!event) throw new Response("Not found", { status: 404 });
  if (event.organiser_id !== user.id) throw new Response("Not yours", { status: 403 });
  if (!organiserCanEdit(event.status as EventStatus)) {
    return data(
      { error: "This one is live now. Message the office to change anything." },
      { status: 400, headers },
    );
  }

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");

  if (intent === "submit_for_review") {
    const missing = missingForLive(event);
    if (missing.length) {
      return data(
        { error: `Still needs ${missing.join(", ")}.` },
        { status: 400, headers },
      );
    }
    await admin.from("events").update({ status: "review" }).eq("id", event.id);
    return data({ ok: "Sent. We will check it and put it live." }, { headers });
  }

  const str = (k: string) => String(form.get(k) ?? "").trim() || null;
  const patch: Record<string, unknown> = {
    title: String(form.get("title") ?? "").trim(),
    pitch: str("pitch"),
    max_people: Math.min(40, Math.max(2, Number(form.get("max_people")) || event.max_people)),
    start_date: str("start_date"),
    end_date: str("end_date"),
    summary: str("summary"),
    included: str("included"),
    excluded: str("excluded"),
    meeting_point: str("meeting_point"),
    route_id: str("route_id"),
    contact_phone: str("contact_phone"),
    updated_at: new Date().toISOString(),
  };

  const priceRaw = String(form.get("price") ?? "").trim();
  patch.price_usd_cents = priceRaw === "" ? null : Math.max(0, Math.round(Number(priceRaw) * 100));

  const media = parseMedia(form);
  patch.photos = media;
  // The cover is the first photo unless one was chosen — one fewer decision.
  patch.cover_photo_url = str("cover_photo_url") ?? media[0]?.url ?? null;

  const bad = validateProposal({ ...event, ...patch } as any);
  if (bad) return data({ error: bad }, { status: 400, headers });

  const { error } = await admin.from("events").update(patch).eq("id", event.id);
  if (error) return data({ error: error.message }, { status: 400, headers });
  return data({ ok: "Saved." }, { headers });
}

export default function EditEvent({ loaderData, actionData }: Route.ComponentProps) {
  const { event, routes, signups } = loaderData as any;
  const nav = useNavigation();
  const status = event.status as EventStatus;
  const copy = STATUS_COPY[status];
  const missing = missingForLive(event);
  const editable = organiserCanEdit(status);
  const field =
    "mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss";
  const label = "block text-sm text-ink-soft";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/events" className="text-sm text-moss hover:underline">
        ← Group trips
      </Link>
      <h1 className="mt-2 font-display text-3xl text-ink">{event.title}</h1>

      {/* Where it is in the process, in plain words, at the top — a status
          buried under a form is a status nobody reads. */}
      <div
        className={cn(
          "mt-4 rounded-md border p-4",
          status === "live"
            ? "border-moss bg-mist"
            : status === "declined"
              ? "border-ember/40 bg-ember/5"
              : "border-line bg-card",
        )}
      >
        <p className="font-medium text-ink">{copy.label}</p>
        {copy.note && <p className="mt-0.5 text-sm text-muted">{copy.note}</p>}
        {status === "declined" && event.decline_reason && (
          <p className="mt-2 text-sm text-ink">{event.decline_reason}</p>
        )}
        {status === "accepted" && missing.length > 0 && (
          <p className="mt-2 text-sm text-ink">
            Still needs <span className="font-medium">{missing.join(", ")}</span>.
          </p>
        )}
        {status === "live" && (
          <Link
            to={`/events/${event.slug}`}
            className="mt-2 inline-block text-sm text-moss underline underline-offset-4"
          >
            See it live →
          </Link>
        )}
      </div>

      {(actionData as any)?.ok && (
        <p className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {(actionData as any).ok}
        </p>
      )}
      {(actionData as any)?.error && (
        <p className="mt-4 rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      {signups.length > 0 && (
        <section className="mt-6 rounded-md border border-line bg-card p-4">
          <h2 className="font-medium text-ink">
            Who has put their name down (
            <span className="font-mono">
              {signups.reduce((n: number, s: any) => n + s.party_size, 0)}
            </span>
            )
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {signups.map((s: any, i: number) => (
              <li key={i}>
                {s.users?.full_name?.split(" ")[0] ?? "Someone"}
                {s.party_size > 1 && ` +${s.party_size - 1}`}
                {s.note && <span className="text-muted"> — {s.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editable && (
        <Form method="post" className="mt-8 space-y-5">
          <label className={label}>
            Name
            <input name="title" defaultValue={event.title} required className={field} />
          </label>

          <label className={label}>
            What is it, and who is it for?
            <textarea name="pitch" rows={4} defaultValue={event.pitch ?? ""} className={field} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              From
              <input type="date" name="start_date" defaultValue={event.start_date ?? ""} className={field} />
            </label>
            <label className={label}>
              Until
              <input type="date" name="end_date" defaultValue={event.end_date ?? ""} className={field} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Most people
              <input
                type="number"
                name="max_people"
                min={2}
                max={40}
                defaultValue={event.max_people}
                className={field}
              />
            </label>
            <label className={label}>
              Price per person (USD)
              <input
                type="number"
                name="price"
                min={0}
                step="1"
                defaultValue={
                  event.price_usd_cents == null ? "" : event.price_usd_cents / 100
                }
                className={field}
              />
            </label>
          </div>

          <label className={label}>
            Which route
            <select name="route_id" defaultValue={event.route_id ?? ""} className={field}>
              <option value="">— not decided —</option>
              {routes.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.region}
                </option>
              ))}
            </select>
          </label>

          <label className={label}>
            The description people read
            <textarea
              name="summary"
              rows={4}
              defaultValue={event.summary ?? ""}
              placeholder="Ten days at a slow pace, two nights at Gokyo so there is a dawn to shoot even if one is clouded out."
              className={field}
            />
          </label>

          <label className={label}>
            Where it starts
            <input
              name="meeting_point"
              defaultValue={event.meeting_point ?? ""}
              placeholder="Kathmandu, the morning of the 2nd"
              className={field}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              What is included
              <textarea name="included" rows={3} defaultValue={event.included ?? ""} className={field} />
            </label>
            <label className={label}>
              What is not
              <textarea name="excluded" rows={3} defaultValue={event.excluded ?? ""} className={field} />
            </label>
          </div>

          <div>
            <p className={label}>Photos — the first one becomes the cover</p>
            <div className="mt-1.5">
              <MediaPicker name="media" initial={event.photos ?? []} />
            </div>
            <input type="hidden" name="cover_photo_url" value={event.cover_photo_url ?? ""} />
          </div>

          <label className={label}>
            A phone number we can reach you on
            <input name="contact_phone" defaultValue={event.contact_phone ?? ""} className={field} />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              disabled={nav.state !== "idle"}
              className="rounded bg-pine px-5 py-3 font-medium text-paper hover:bg-moss disabled:opacity-60"
            >
              Save
            </button>
            {status === "accepted" && (
              <button
                name="intent"
                value="submit_for_review"
                disabled={nav.state !== "idle" || missing.length > 0}
                title={missing.length ? `Still needs ${missing.join(", ")}` : undefined}
                className="rounded border border-moss px-5 py-3 font-medium text-moss hover:bg-mist disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send it to go live
              </button>
            )}
          </div>
        </Form>
      )}
    </main>
  );
}
