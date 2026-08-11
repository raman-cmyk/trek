import { Form, Link } from "react-router";
import type { Route } from "./+types/journals.$slug";
import { pageMeta, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { SmartImage } from "~/components/SmartImage";
import { JournalCard } from "~/components/public/JournalCard";
import { ElevationStrip } from "~/components/public/ElevationStrip";
import { TierBadge } from "~/components/public/bits";
import {
  JOURNAL_COLS,
  elevationPoints,
  journalStatLine,
  layoutFor,
  type JournalEntry,
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

  const [{ data: entries }, { data: byGuide }, { data: sameRoute }, { data: offerings }] =
    await Promise.all([
      client
        .from("public_journal_entries")
        .select("id, day_no, title, body, altitude_m, is_hard_day, layout, photos")
        .eq("journal_id", j.id)
        .order("day_no"),
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
    more,
    offering: (offerings ?? [])[0] ?? null,
    canonical: absoluteUrl(env.SITE_URL, `/journals/${params.slug}`),
  };
}

export default function Journal({ loaderData }: Route.ComponentProps) {
  const { journal: j, entries, more, offering } = loaderData as {
    journal: PublicJournal;
    entries: JournalEntry[];
    more: PublicJournal[];
    offering: { slug: string; kind: string; title: string; days: number } | null;
  };
  const first = j.guide_name.split(" ")[0];
  const points = elevationPoints(entries);

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

      {/* 3 — The day blocks. */}
      <div className="mx-auto max-w-4xl px-4">
        {entries.map((e, i) => (
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
            {more.map((o) => (
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
function DayBlock({
  entry,
  layout,
}: {
  entry: JournalEntry;
  layout: "full" | "two" | "portrait";
}) {
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
        <h2 className="mt-2 font-display text-2xl leading-snug text-ink sm:mt-0">
          {entry.title}
        </h2>
        {entry.altitude_m != null && (
          <p className="mt-1 font-mono text-caption text-muted">
            {entry.altitude_m.toLocaleString("en-US")} m
          </p>
        )}
        {entry.body && (
          <p className="mt-3 max-w-[62ch] whitespace-pre-line leading-relaxed text-ink">
            {entry.body}
          </p>
        )}

        {photos.length > 0 && (
          <div
            className={cn(
              "mt-5",
              layout === "two" && "grid grid-cols-2 gap-2 sm:gap-3",
              layout === "portrait" && "flex justify-end",
            )}
          >
            {photos.map((p, i) => (
              <SmartImage
                key={p.url + i}
                src={p.url}
                alt={p.alt ?? entry.title}
                width={layout === "portrait" ? 520 : 900}
                height={layout === "portrait" ? 700 : 600}
                className={cn(
                  "w-full rounded-sm",
                  layout === "full" && "aspect-[3/2]",
                  layout === "two" && "aspect-square",
                  layout === "portrait" && "aspect-[3/4] max-w-sm",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
