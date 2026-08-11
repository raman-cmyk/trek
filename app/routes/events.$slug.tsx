import { Form, Link, data, redirect } from "react-router";
import type { Route } from "./+types/events.$slug";
import { pageMeta, absoluteUrl, jsonLd, breadcrumbLd } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { SmartImage } from "~/components/SmartImage";
import { useLightbox } from "~/components/public/Lightbox";
import { useMoney } from "~/lib/currency-context";
import { eventDates, placesLeft } from "~/lib/events";

export function meta({ loaderData: d }: Route.MetaArgs) {
  const e = (d as any)?.event;
  if (!e) return [{ title: "Trip not found" }];
  const origin = new URL((d as any).canonical).origin;
  return [
    ...pageMeta({
      title: `${e.title} — a group trip on Trek`,
      description:
        e.summary ??
        `${eventDates(e.start_date, e.end_date)}. Organised by ${e.organiser_name}, capped at ${e.max_people} people.`,
      canonical: (d as any).canonical,
      image: e.cover_photo_url ?? undefined,
      type: "article",
    }),
    jsonLd({
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.title,
      startDate: e.start_date,
      endDate: e.end_date,
      description: e.summary ?? e.pitch,
      image: e.cover_photo_url ? [e.cover_photo_url] : undefined,
      maximumAttendeeCapacity: e.max_people,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: e.region ? `${e.region}, Nepal` : "Nepal" },
      organizer: { "@type": "Organization", name: "Trek", url: origin },
    }),
    jsonLd(
      breadcrumbLd([
        { name: "Group trips", url: `${origin}/events` },
        { name: e.title, url: (d as any).canonical },
      ]),
    ),
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const { data: event } = await client
    .from("public_events")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!event) throw new Response("Not found", { status: 404 });

  const { user } = await getSessionUser(request, env);
  let mine: any = null;
  if (user) {
    const admin = createAdminClient(env);
    const { data } = await admin
      .from("event_signups")
      .select("party_size, status")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .maybeSingle();
    mine = data ?? null;
  }

  return {
    event,
    mine,
    signedIn: !!user,
    canonical: absoluteUrl(env.SITE_URL, `/events/${params.slug}`),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const next = `/events/${params.slug}`;
  if (!user) return redirect(`/login?next=${encodeURIComponent(next)}`, { headers });

  const admin = createAdminClient(env);
  const { data: event } = await admin
    .from("events")
    .select("id, max_people, status")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!event || event.status !== "live") {
    return data({ error: "This trip is not open." }, { status: 400, headers });
  }

  const form = await request.formData();
  if (String(form.get("intent")) === "withdraw") {
    await admin
      .from("event_signups")
      .update({ status: "withdrawn" })
      .eq("event_id", event.id)
      .eq("user_id", user.id);
    return data({ ok: "Taken your name off." }, { headers });
  }

  const party = Math.min(12, Math.max(1, Number(form.get("party_size")) || 1));

  // Capacity is checked here, not in the browser: two people can tap Join on
  // the last place at the same moment and the disabled button will not know.
  const { data: taken } = await admin
    .from("event_signups")
    .select("party_size, user_id, status")
    .eq("event_id", event.id)
    .in("status", ["interested", "confirmed"]);
  const already = (taken ?? []).find((t) => t.user_id === user.id);
  const others = (taken ?? [])
    .filter((t) => t.user_id !== user.id)
    .reduce((n, t) => n + t.party_size, 0);
  if (others + party > event.max_people) {
    return data(
      { error: `Only ${Math.max(0, event.max_people - others)} places left.` },
      { status: 400, headers },
    );
  }

  const row = {
    event_id: event.id,
    user_id: user.id,
    party_size: party,
    note: String(form.get("note") ?? "").trim() || null,
    status: "interested" as const,
  };
  const { error } = already
    ? await admin.from("event_signups").update(row).eq("event_id", event.id).eq("user_id", user.id)
    : await admin.from("event_signups").insert(row);
  if (error) return data({ error: error.message }, { status: 400, headers });
  return data({ ok: "You are on the list. The organiser will be in touch." }, { headers });
}

export default function EventPage({ loaderData, actionData }: Route.ComponentProps) {
  const { event: e, mine, signedIn } = loaderData as any;
  const { m } = useMoney();
  const left = placesLeft(e.max_people, e.taken);
  const photos = (e.photos ?? []) as Array<{ url: string; alt?: string }>;
  const lightbox = useLightbox(photos);

  return (
    <main className="pb-16">
      <div className="relative">
        <SmartImage
          src={e.cover_photo_url ?? ""}
          alt={e.title}
          width={1800}
          height={900}
          eager
          cover
          className="h-[38vh] w-full sm:h-[52vh]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-4xl px-4 pb-6">
            <p className="label text-white/75">Group trip</p>
            <h1 className="mt-1 max-w-[20ch] font-display text-3xl leading-[1.05] text-white sm:text-5xl">
              {e.title}
            </h1>
            <p className="mt-3 font-mono text-caption text-white/85 sm:text-sm">
              {eventDates(e.start_date, e.end_date)}
              {e.region ? ` · ${e.region}` : ""} · max {e.max_people}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {e.summary && (
            <p className="max-w-[62ch] whitespace-pre-line text-body-l text-ink">{e.summary}</p>
          )}
          {e.pitch && (
            <p className="mt-4 max-w-[62ch] whitespace-pre-line text-ink">{e.pitch}</p>
          )}

          {photos.length > 0 && (
            <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {photos.map((p, i) => (
                <li key={p.url + i}>
                  <button
                    type="button"
                    onClick={() => lightbox.open(i)}
                    className="block w-full overflow-hidden rounded-sm"
                    aria-label="Open photo"
                  >
                    <SmartImage
                      src={p.url}
                      alt={p.alt ?? ""}
                      width={600}
                      height={450}
                      cover
                      className="aspect-[4/3] w-full"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(e.included || e.excluded) && (
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {e.included && (
                <div>
                  <h2 className="font-display text-xl text-ink">What is included</h2>
                  <p className="mt-2 whitespace-pre-line text-ink">{e.included}</p>
                </div>
              )}
              {e.excluded && (
                <div>
                  <h2 className="font-display text-xl text-ink">What is not</h2>
                  <p className="mt-2 whitespace-pre-line text-ink">{e.excluded}</p>
                </div>
              )}
            </div>
          )}

          {e.meeting_point && (
            <p className="mt-8 text-ink">
              <span className="label block text-muted">Where it starts</span>
              {e.meeting_point}
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-md border border-line bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-muted">
                {left === 0 ? (
                  "Full"
                ) : (
                  <>
                    <span className="font-mono text-ink">{left}</span> of{" "}
                    <span className="font-mono">{e.max_people}</span> places left
                  </>
                )}
              </p>
              {e.price_usd_cents != null && (
                <p className="text-sm text-muted">
                  <span className="font-mono text-lg text-ink">{m(e.price_usd_cents)}</span>
                  /person
                </p>
              )}
            </div>

            {(actionData as any)?.ok && (
              <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {(actionData as any).ok}
              </p>
            )}
            {(actionData as any)?.error && (
              <p className="mt-3 rounded bg-ember/10 px-3 py-2 text-sm text-ember">
                {(actionData as any).error}
              </p>
            )}

            {!signedIn ? (
              <Link
                to={`/login?next=${encodeURIComponent(`/events/${e.slug}`)}`}
                className="mt-4 block rounded bg-pine px-4 py-2.5 text-center text-sm font-medium text-paper hover:bg-moss"
              >
                Sign in to join
              </Link>
            ) : mine?.status === "interested" || mine?.status === "confirmed" ? (
              <Form method="post" className="mt-4">
                <p className="text-sm text-ink">
                  You are on the list for{" "}
                  <span className="font-mono">{mine.party_size}</span>.
                </p>
                <button
                  name="intent"
                  value="withdraw"
                  className="mt-2 text-caption text-muted hover:text-ember"
                >
                  Take my name off
                </button>
              </Form>
            ) : left === 0 ? (
              <p className="mt-4 text-sm text-muted">
                This one is full. The organiser may add places — message them.
              </p>
            ) : (
              <Form method="post" className="mt-4 space-y-2">
                <label className="block text-sm text-ink-soft">
                  How many of you
                  <input
                    type="number"
                    name="party_size"
                    min={1}
                    max={Math.min(12, left)}
                    defaultValue={1}
                    className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink"
                  />
                </label>
                <input
                  name="note"
                  placeholder="Anything they should know?"
                  className="w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink"
                />
                <button className="w-full rounded bg-pine px-4 py-2.5 text-sm font-medium text-paper hover:bg-moss">
                  Put my name down
                </button>
                <p className="text-caption text-muted">
                  Free, and not a booking. The organiser confirms before anyone pays.
                </p>
              </Form>
            )}
          </div>

          <div className="rounded-md border border-line bg-card p-4">
            <p className="label text-muted">Organised by</p>
            <div className="mt-2 flex items-center gap-3">
              <SmartImage
                src={e.organiser_avatar_url ?? ""}
                alt={e.organiser_name}
                width={48}
                height={48}
                className="h-10 w-10 rounded-full"
              />
              <p className="font-medium text-ink">{e.organiser_name}</p>
            </div>
            {e.guide_slug && (
              <>
                <p className="label mt-4 text-muted">Led by</p>
                <Link
                  to={`/guides/${e.guide_slug}`}
                  className="mt-2 flex items-center gap-3 hover:text-moss"
                >
                  <SmartImage
                    src={e.guide_avatar_url ?? ""}
                    alt={e.guide_name}
                    width={48}
                    height={48}
                    className="h-10 w-10 rounded-full"
                  />
                  <span className="font-medium text-ink">{e.guide_name}</span>
                </Link>
              </>
            )}
            {e.route_slug && (
              <Link
                to={`/routes/${e.route_slug}`}
                className="mt-4 inline-block text-sm text-moss underline underline-offset-4"
              >
                {e.route_name} route →
              </Link>
            )}
          </div>
        </aside>
      </div>
      {lightbox.node}
    </main>
  );
}
