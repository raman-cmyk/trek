import { Link } from "react-router";
import type { Route } from "./+types/events._index";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { SmartImage } from "~/components/SmartImage";
import { useMoney } from "~/lib/currency-context";
import { eventDates, placesLeft } from "~/lib/events";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return pageMeta({
    title: "Group trips anyone can join — Trek",
    description:
      "Trips organised by people, not agencies: a photographer's week in Gokyo, a walking group in Langtang. Fixed dates, a capped group, a verified guide.",
    canonical: (d as any)?.canonical ?? "",
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=300" };
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const today = new Date().toISOString().slice(0, 10);
  const { data: events } = await client
    .from("public_events")
    .select("*")
    .or(`end_date.gte.${today},end_date.is.null`)
    .order("start_date", { ascending: true });
  return { events: events ?? [], canonical: absoluteUrl(env.SITE_URL, "/events") };
}

export default function Events({ loaderData }: Route.ComponentProps) {
  const { events } = loaderData as any;
  const { mr } = useMoney();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-muted">Go with a group</p>
          <h1 className="mt-2 max-w-[22ch] font-display text-4xl leading-[1.05] text-ink sm:text-5xl">
            Trips somebody put together.
          </h1>
          <p className="mt-4 max-w-[56ch] text-body-l text-ink">
            Not agency departures. A photographer taking eight people to Gokyo,
            a walking club in Langtang, a group of friends with two spare
            places. Fixed dates, a capped group, and a guide we verified.
          </p>
        </div>
        <Link
          to="/events/new"
          className="rounded bg-pine px-5 py-3 font-medium text-paper hover:bg-moss"
        >
          Organise one
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="mt-10 rounded-md border border-line bg-card p-8">
          <p className="font-display text-xl text-ink">No trips open just now.</p>
          <p className="mt-2 max-w-[54ch] text-muted">
            These come from people, so they appear when somebody organises one.
            If you have a group and a rough idea of when, we will handle the
            permits, find the guide, and put it on the site for you.
          </p>
          <Link
            to="/events/new"
            className="mt-4 inline-block rounded bg-pine px-4 py-2.5 text-sm font-medium text-paper hover:bg-moss"
          >
            Organise one →
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e: any) => {
            const left = placesLeft(e.max_people, e.taken);
            return (
              <li key={e.id}>
                <Link
                  to={`/events/${e.slug}`}
                  prefetch="intent"
                  className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-card transition-colors hover:border-sage"
                >
                  <SmartImage
                    src={e.cover_photo_url ?? ""}
                    alt={e.title}
                    width={600}
                    height={400}
                    className="aspect-[3/2] w-full"
                  />
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-mono text-caption text-muted">
                      {eventDates(e.start_date, e.end_date)}
                      {e.region ? ` · ${e.region}` : ""}
                    </p>
                    <p className="mt-1 font-display text-xl leading-snug text-ink">{e.title}</p>
                    {e.summary && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted">{e.summary}</p>
                    )}
                    <div className="mt-auto flex items-baseline justify-between gap-3 pt-4">
                      <span className="text-sm text-muted">
                        {left === 0 ? (
                          "Full"
                        ) : (
                          <>
                            <span className="font-mono text-ink">{left}</span> of{" "}
                            <span className="font-mono">{e.max_people}</span> left
                          </>
                        )}
                      </span>
                      {e.price_usd_cents != null && (
                        <span className="text-sm text-muted">
                          <span className="font-mono font-medium text-ink">
                            {mr(e.price_usd_cents)}
                          </span>
                          /person
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-caption text-muted">
                      Organised by {e.organiser_name}
                      {e.guide_name ? ` · led by ${e.guide_name}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
