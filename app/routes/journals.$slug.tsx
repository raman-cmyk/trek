import { Form, Link } from "react-router";
import type { Route } from "./+types/journals.$slug";
import { pageMeta, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { SmartImage } from "~/components/SmartImage";
import { JournalCard } from "~/components/public/JournalCard";
import { ElevationStrip } from "~/components/public/ElevationStrip";
import { TierBadge } from "~/components/public/bits";
import { RouteMap } from "~/components/public/RouteMap";
import {
  JOURNAL_COLS,
  elevationPoints,
  journalStatLine,
  layoutFor,
  sortTags,
  type JournalEntry,
  type JournalTag,
  type PhotoLayout,
  type PublicJournal,
} from "~/lib/journals";
import { cn } from "~/lib/cn";

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Journal not found" }];
  const j = data.journal as PublicJournal;
  const origin = new URL(data.canonical).origin;
  return [
    ...pageMeta({
      title: `${j.title} — a Trek journal by ${j.guide_name}`,
      description:
        (j.guide_note ?? "").slice(0, 155) ||
        `${j.days} days on ${j.route_name ?? "the trail"} in Nepal, told by the guide who led it.`,
      canonical: data.canonical,
      image: j.cover_photo_url ?? undefined,
      type: "article",
    }),
    // Article JSON-LD: journals are the freshness engine for route pages, so
    // they need to be legible to search as dated, authored writing.
    jsonLd({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: j.title,
      datePublished: j.published_at,
      image: j.cover_photo_url ? [j.cover_photo_url] : undefined,
      author: {
        "@type": "Person",
        name: j.guide_name,
        url: `${origin}/guides/${j.guide_slug}`,
      },
      publisher: { "@type": "Organization", name: "Trek", url: origin },
      mainEntityOfPage: data.canonical,
      about: j.route_name
        ? { "@type": "Place", name: `${j.route_name}, Nepal`, url: `${origin}/routes/${j.route_slug}` }
        : undefined,
articleSection: j.route_region ?? undefined,
    }),
    jsonLd(
      breadcrumbLd([
        { name: "Trek stories", url: `${origin}/journals` },
        { name: j.title, url: data.canonical },
      ]),
    ),
  ];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const { data: journal } = await client
    .from("public_journals")
    .select(JOURNAL_COLS)
    .eq("slug", params.slug)
    .maybeSingle();
  if (!journal) throw new Response("Journal not found", { status: 404 });
  const j = journal as PublicJournal;

  const [{ data: entries }, { data: tags }, { data: routeRow }, { data: byGuide }, { data: sameRoute }, { data: offerings }] =
    await Promise.all([
      client
        .from("public_journal_entries")
        .select("id, day_no, title, body, altitude_m, is_hard_day, layout, photos")
        .eq("journal_id", j.id)
        .order("day_no"),
      client
        .from("public_journal_tags")
        .select("kind, value")
        .eq("journal_id", j.id),
      j.route_id
        ? client
            .from("routes")
            .select("slug, name, typical_days, max_altitude_m, day_stops")
            .eq("id", j.route_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      client
        .from("public_journals")
        .select(JOURNAL_COLS)
        .eq("guide_id", j.guide_id)
        .neq("id", j.id)
        .order("start_date", { ascending: false })
        .limit(3),
      j.route_id
        ? client
            .from("public_journals")
            .select(JOURNAL_COLS)
            .eq("route_id", j.route_id)
            .neq("guide_id", j.guide_id)
            .order("start_date", { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] as PublicJournal[] }),
      // The trip you can actually book off the back of this story.
      client
        .from("public_offerings")
        .select("slug, kind, title, days")
        .eq("guide_id", j.guide_id)
        .eq("route_id", j.route_id ?? "00000000-0000-0000-0000-000000000000")
        .limit(1),
    ]);

  // This guide's other journals first; top up with the same route by others.
  const more = [...((byGuide ?? []) as PublicJournal[])];
  for (const o of (sameRoute ?? []) as PublicJournal[]) {
    if (more.length >= 3) break;
    more.push(o);
  }

  return {
    journal: j,
    entries: (entries ?? []) as JournalEntry[],
    tags: (tags ?? []) as { kind: any; value: string }[],
    route: routeRow ?? null,
    more,
    offering: (offerings ?? [])[0] ?? null,
    canonical: absoluteUrl(env.SITE_URL, `/journals/${params.slug}`),
  };
}

export default function Journal({ loaderData }: Route.ComponentProps) {
  const { journal: j, entries, tags, route, more, offering } = loaderData as any;
  const first = j.guide_name.split(" ")[0];
  const points = elevationPoints(entries);
  const photoCount = entries.reduce(
    (n: number, e: JournalEntry) => n + (e.photos?.length ?? 0),
    0,
  );

  return (
    <main className="pb-16">
      {/* 1 — Cover. The title overlaps the bottom edge of the photograph
          instead of sitting politely under it (Not-AI doc §2: break the grid). */}
      <header className="relative">
        <SmartImage
          src={j.cover_photo_url ?? ""}
          alt={j.title}
          width={1800}
          height={1000}
          eager
          cover
          className="h-[46vh] w-full sm:h-[62vh]"
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 to-transparent" />
        <div className="mx-auto max-w-4xl px-4">
          <h1 className="relative -mt-16 max-w-[20ch] font-display text-3xl leading-[1.05] text-white [text-shadow:0_2px_20px_rgb(0_0_0/0.55)] sm:-mt-24 sm:text-5xl">
            {j.title}
          </h1>
          {/* Light type: this line sits on the photograph's dark foot, not on
              the page. It was ink-on-photo and unreadable. */}
          <p className="relative mt-3 font-mono text-caption text-white/85 sm:text-sm">
            {journalStatLine(j)}
          </p>
          {j.weather_note && (
            <p className="relative mt-1 text-sm text-white/70">{j.weather_note}</p>
          )}
          {/* Route link next to the stats, not buried at the bottom — it is
              the second most useful link on the page. */}
          <div className="relative mt-3 flex flex-wrap items-center gap-2">
            {j.route_slug && (
              <Link
                to={`/routes/${j.route_slug}`}
                prefetch="intent"
                className="rounded-pill bg-paper/95 px-3 py-1 text-sm font-medium text-ink hover:bg-white"
              >
                {j.route_name} →
              </Link>
            )}
            {sortTags(tags).map((t: JournalTag) => (
              <Link
                key={t.kind + t.value}
                to={`/journals?tag=${encodeURIComponent(t.value)}`}
                className="rounded-pill border border-white/30 px-2.5 py-1 text-caption text-white/85 hover:bg-white/10"
              >
                {t.value}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* 2 — Guide strip. Sticky: this is a story, but it is also the page
          where someone decides to book the man who wrote it. */}
      <div className="sticky top-0 z-20 mt-8 border-y border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
          <Link to={`/guides/${j.guide_slug}`} prefetch="intent" className="shrink-0">
            <SmartImage
              src={j.guide_avatar_url ?? ""}
              alt={j.guide_name}
              width={44}
              height={44}
              className="h-10 w-10 rounded-full"
            />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm">
              <Link
                to={`/guides/${j.guide_slug}`}
                prefetch="intent"
                className="font-medium text-ink hover:underline"
              >
                {j.guide_name}
              </Link>
              <TierBadge tier={j.guide_tier} />
            </p>
            {j.guide_only_with_me && (
              <p className="truncate font-display text-caption text-muted sm:text-sm">
                {j.guide_only_with_me}
              </p>
            )}
          </div>
          <Form method="post" action="/conversations" className="shrink-0">
            <input type="hidden" name="guide_id" value={j.guide_id} />
            <input type="hidden" name="next" value={`/journals/${j.slug}`} />
            <button className="rounded bg-moss px-4 py-2 text-sm font-medium text-white hover:bg-pine">
              Message
            </button>
          </Form>
        </div>
      </div>

      {/* 3 — The album. Editorial measure on the left, sticky rail on the
          right: the dead column is now the route map, the profile, and the
          guide, all of which you want while reading. */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
        {entries.map((e: JournalEntry, i: number) => (
          <DayBlock key={e.id} entry={e} layout={layoutFor(e, i)} />
        ))}

        {/* 5 — Elevation, from what the guide actually recorded. */}
        {points.length >= 3 && (
          <section className="mt-14 border-t border-line pt-8">
            <h2 className="label text-muted">How high, and when</h2>
            <ElevationStrip points={points} className="mt-3" />
          </section>
        )}

        {/* 6 — The closing note, set larger. His words. */}
        {j.guide_note && (
          <section className="mt-14 border-l-[3px] border-chartreuse pl-5 sm:pl-7">
            <p className="whitespace-pre-line font-display text-xl leading-relaxed text-ink sm:text-2xl">
              {j.guide_note}
            </p>
            <p className="mt-3 text-caption text-muted">
              — {j.guide_name}, who led this trek
            </p>
          </section>
        )}

        {/* 7 — The client's note, if they gave one and consented to the name. */}
        {j.client_note && (
          <figure className="mt-10 rounded-md bg-mist p-6">
            <blockquote className="text-lg leading-relaxed text-ink">
              “{j.client_note}”
            </blockquote>
            {j.client_note_author && (
              <figcaption className="mt-2 font-mono text-caption text-muted">
                — {j.client_note_author}
              </figcaption>
            )}
          </figure>
        )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            {route?.day_stops?.length ? (
              <div className="overflow-hidden rounded-md border border-line">
                <RouteMap
                  stops={route.day_stops}
                  className="h-48 w-full bg-mist"
                />
                <Link
                  to={`/routes/${route.slug}`}
                  className="block border-t border-line bg-card px-3 py-2 text-sm font-medium text-ink hover:text-moss"
                >
                  {route.name} →
                  <span className="block font-mono text-caption text-muted">
                    {route.typical_days} days · {route.max_altitude_m?.toLocaleString("en-US")} m
                  </span>
                </Link>
              </div>
            ) : null}

            {points.length >= 3 && (
              <div className="rounded-md border border-line bg-card p-3">
                <p className="label text-muted">This trek</p>
                <ElevationStrip points={points} className="mt-1" />
              </div>
            )}

            <div className="rounded-md border border-line bg-card p-4">
              <Link to={`/guides/${j.guide_slug}`} className="flex items-center gap-3">
                <SmartImage
                  src={j.guide_avatar_url ?? ""}
                  alt={j.guide_name}
                  width={56}
                  height={56}
                  className="h-12 w-12 rounded-full"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{j.guide_name}</span>
                  <span className="block font-mono text-caption text-muted">
                    {j.guide_district}
                  </span>
                </span>
              </Link>
              {j.guide_only_with_me && (
                <p className="mt-3 border-l-2 border-chartreuse pl-2.5 font-display text-sm leading-snug text-ink">
                  {j.guide_only_with_me}
                </p>
              )}
              <p className="mt-3 font-mono text-caption text-muted">
                {photoCount} photos · {entries.length} days written up
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky book bar — available the whole way down, not only at the end. */}
      <div className="sticky bottom-0 z-20 mt-12 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate text-sm text-muted">
            Trek {j.route_name ?? "this route"} with{" "}
            <span className="font-medium text-ink">{first}</span>
          </p>
          <Form method="post" action="/conversations" className="shrink-0">
            <input type="hidden" name="guide_id" value={j.guide_id} />
            <input type="hidden" name="next" value={`/journals/${j.slug}`} />
            <button className="rounded border border-moss px-3 py-2 text-sm font-medium text-moss hover:bg-mist">
              Message
            </button>
          </Form>
          {offering && (
            <Link
              to={`/${offering.kind === "trek" ? "treks" : "experiences"}/${offering.slug}`}
              className="shrink-0 rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
            >
              See the trip
            </Link>
          )}
        </div>
      </div>

      {/* 8 — Book the same trail with the same man. */}
      <section className="mt-16 bg-pine py-14 text-paper">
        <div className="mx-auto max-w-4xl px-4">
          <p className="label text-paper/60">Walk it yourself</p>
          <h2 className="mt-2 max-w-[20ch] font-display text-3xl sm:text-4xl">
            Trek {j.route_name ?? "this route"} with {first}.
          </h2>
          <div className="mt-6 flex flex-wrap gap-3">
            {offering && (
              <Link
                to={`/${offering.kind === "trek" ? "treks" : "experiences"}/${offering.slug}`}
                prefetch="intent"
                className="rounded bg-chartreuse px-5 py-3 font-medium text-pine hover:bg-white"
              >
                {offering.title} — {offering.days} days →
              </Link>
            )}
            <Form method="post" action="/conversations">
              <input type="hidden" name="guide_id" value={j.guide_id} />
              <input type="hidden" name="next" value={`/journals/${j.slug}`} />
              <button className="rounded border border-paper/40 px-5 py-3 font-medium text-paper hover:bg-paper/10">
                Message {first} — free
              </button>
            </Form>
          </div>
          {j.route_slug && (
            <Link
              to={`/routes/${j.route_slug}`}
              className="mt-5 inline-block text-sm text-paper/75 underline underline-offset-4 hover:text-paper"
            >
              Permits, costs and every guide on {j.route_name} →
            </Link>
          )}
        </div>
      </section>

      {more.length > 0 && (
        <section className="mx-auto mt-14 max-w-6xl px-4">
          <h2 className="mb-4 font-display text-2xl text-ink">More from the trail</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {more.map((o: PublicJournal) => (
              <JournalCard key={o.id} journal={o} showGuide={o.guide_id !== j.guide_id} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

/**
 * One day. The numeral lives in the left margin as a big mono figure; the
 * photo arrangement changes block to block so the page never settles into a
 * repeating grid.
 */
function DayBlock({ entry, layout }: { entry: JournalEntry; layout: PhotoLayout }) {
  const photos = entry.photos ?? [];
  return (
    <section
      className={cn(
        "mt-12 scroll-mt-20 sm:grid sm:grid-cols-[4.5rem_1fr] sm:gap-6",
        entry.is_hard_day && "sm:gap-6",
      )}
      id={`day-${entry.day_no}`}
    >
      <p className="font-mono text-4xl leading-none text-line sm:text-right sm:text-5xl">
        {entry.day_no}
      </p>

      <div className={cn(entry.is_hard_day && "border-l-2 border-ember/50 pl-4 sm:pl-5")}>
        {entry.is_hard_day && (
          <p className="mb-1 label text-ember">The hard day</p>
        )}

        {/* Portrait: the photo is floated so the day's text runs alongside it
            instead of leaving half the row empty. It comes first in the source
            so the float has text to wrap. */}
        {layout === "portrait" && photos[0] && (
          <SmartImage
            src={photos[0].url}
            alt={photos[0].alt ?? entry.title}
            width={520}
            height={700}
            className="mb-3 aspect-[3/4] w-40 rounded-sm sm:float-right sm:ml-6 sm:mb-2 sm:w-56"
          />
        )}

        <h2 className="mt-2 font-display text-2xl leading-snug text-ink sm:mt-0">
          {entry.title}
        </h2>
        {entry.altitude_m != null && (
          <p className="mt-1 font-mono text-caption text-muted">
            {entry.altitude_m.toLocaleString("en-US")} m
          </p>
        )}
        {entry.body && (
          <p
            className={cn(
              "mt-3 whitespace-pre-line leading-relaxed text-ink",
              // A float already narrows the column; a max-width on top of it
              // would leave a second gutter.
              layout !== "portrait" && "max-w-[62ch]",
            )}
          >
            {entry.body}
          </p>
        )}

        {layout === "portrait" ? (
          // Anything beyond the floated one goes in a normal row underneath.
          photos.length > 1 && (
            <div className="clear-both grid gap-2 pt-5 sm:gap-3" style={cols(photos.length - 1)}>
              {photos.slice(1).map((p, i) => (
                <SmartImage
                  key={p.url + i}
                  src={p.url}
                  alt={p.alt ?? entry.title}
                  width={640}
                  height={800}
                  className="aspect-[4/5] w-full rounded-sm"
                />
              ))}
            </div>
          )
        ) : layout === "three" ? (
          // One wide frame, then the rest sharing a row evenly — the column
          // count comes from the photo count, so a block never ends in a hole.
          <div className="mt-5 space-y-2 sm:space-y-3">
            <SmartImage
              src={photos[0].url}
              alt={photos[0].alt ?? entry.title}
              width={1200}
              height={675}
              className="aspect-[16/9] w-full rounded-sm"
            />
            {photos.length > 1 && (
              <div className="grid gap-2 sm:gap-3" style={cols(photos.length - 1)}>
                {photos.slice(1).map((p, i) => (
                  <SmartImage
                    key={p.url + i}
                    src={p.url}
                    alt={p.alt ?? entry.title}
                    width={640}
                    height={800}
                    className="aspect-[4/5] w-full rounded-sm"
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          photos.length > 0 && (
            <div className={cn("mt-5", layout === "two" && "grid grid-cols-2 gap-2 sm:gap-3")}>
              {photos.map((p, i) => (
                <SmartImage
                  key={p.url + i}
                  src={p.url}
                  alt={p.alt ?? entry.title}
                  width={1000}
                  height={layout === "pano" ? 420 : 660}
                  className={cn(
                    "w-full rounded-sm",
                    layout === "full" && "aspect-[3/2]",
                    layout === "pano" && "aspect-[21/9]",
                    layout === "two" && "aspect-square",
                  )}
                />
              ))}
            </div>
          )
        )}
      </div>
    </section>
  );
}

/** Equal columns for n photos, capped so a phone never gets four in a row. */
function cols(n: number): React.CSSProperties {
  return { gridTemplateColumns: `repeat(${Math.min(Math.max(n, 1), 3)}, minmax(0, 1fr))` };
}
