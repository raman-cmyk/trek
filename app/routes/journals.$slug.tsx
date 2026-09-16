import { Fragment } from "react";
import { Form, Link, data, useFetcher } from "react-router";
import type { Route } from "./+types/journals.$slug";
import { pageMeta, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { createAdminClient } from "~/lib/supabase.server";
import { Comments, type PublicComment } from "~/components/public/Comments";
import { MediaGrid } from "~/components/public/MediaGrid";
import { useLightbox } from "~/components/public/Lightbox";
import { SmartImage } from "~/components/SmartImage";
import { JournalCard } from "~/components/public/JournalCard";
import { ElevationStrip } from "~/components/public/ElevationStrip";
import { TierBadge } from "~/components/public/bits";
import { RouteMap } from "~/components/public/RouteMap";
import {
  JOURNAL_COLS,
  allMedia,
  elevationPoints,
  journalStatLine,
  sortTags,
  type JournalEntry,
  type JournalPhoto,
  type JournalTag,
  type PublicJournal,
} from "~/lib/journals";
import { cn } from "~/lib/cn";
import { JourneyIndex } from "~/components/public/JourneyIndex";
import {
  chaptersOf,
  dayShape,
  midCtaAfterDay,
  peakIndex,
  type Chapter,
  type DayShape,
} from "~/lib/journal-reading";
import { TrailScene } from "~/components/design/TrailScene";
import { ProfileWithPhotos } from "~/components/design/ProfileWithPhotos";
import { profileOf } from "~/lib/route-cards";
import { isVideo } from "~/lib/journals";

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Journal not found" }];
  const j = data.journal as PublicJournal;
  const origin = new URL(data.canonical).origin;
  return [
    ...pageMeta({
      title: `${j.title} — a trek journal by ${j.guide_name}`,
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
      publisher: { "@type": "Organization", name: "Guides of Nepal", url: origin },
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

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  // Who is reading — the comment box is a sign-in prompt for everyone else.
  const { user } = await getSessionUser(request, env);

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

  const { data: comments } = await client
    .from("public_journal_comments")
    .select(
      "id, parent_id, body, created_at, author_id, author_name, author_avatar_url, author_is_guide, author_guide_slug",
    )
    .eq("journal_id", j.id)
    .order("created_at");

  // Whether this reader has already liked it, so the button says the truth on
  // the first paint rather than after a round trip.
  const { data: myLike } = user
    ? await createAdminClient(env)
        .from("journal_likes")
        .select("user_id")
        .eq("journal_id", j.id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

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
    comments: (comments ?? []) as PublicComment[],
    liked: !!myLike,
    signedIn: !!user,
    canonical: absoluteUrl(env.SITE_URL, `/journals/${params.slug}`),
  };
}

/**
 * Posting a comment. A plain form POST to this page, so it works with
 * JavaScript off; the insert goes through the admin client after the identity
 * check because the anon client cannot see a user's own row before RLS.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (intent !== "comment" && intent !== "like") {
    return data({ error: "Unknown action." }, { status: 400 });
  }

  const { user, headers } = await getSessionUser(request, env);
  if (!user) {
    return data(
      {
        error:
          intent === "like"
            ? "Sign in to say you liked it — it takes a minute and it is free."
            : "Sign in to comment — it takes a minute and it is free.",
      },
      { status: 401, headers },
    );
  }

  // A like is one row per person, so tapping twice takes it back rather than
  // counting twice.
  if (intent === "like") {
    const admin = createAdminClient(env);
    const { data: j } = await admin
      .from("journals")
      .select("id")
      .eq("slug", params.slug)
      .eq("status", "published")
      .maybeSingle();
    if (!j) return data({ error: "This journal is not live." }, { status: 404, headers });

    if (String(form.get("liked")) === "1") {
      await admin.from("journal_likes").delete().eq("journal_id", j.id).eq("user_id", user.id);
    } else {
      await admin
        .from("journal_likes")
        .upsert({ journal_id: j.id, user_id: user.id }, { onConflict: "journal_id,user_id" });
    }
    return data({ ok: true }, { headers });
  }

  const body = String(form.get("body") ?? "").trim();
  if (!body) return data({ error: "Write something first." }, { status: 400, headers });
  if (body.length > 2000) {
    return data({ error: "That is longer than a comment box allows." }, { status: 400, headers });
  }

  const admin = createAdminClient(env);
  const { data: journal } = await admin
    .from("journals")
    .select("id")
    .eq("slug", params.slug)
    .eq("status", "published")
    .maybeSingle();
  if (!journal) return data({ error: "This journal is not live." }, { status: 404, headers });

  const parentRaw = form.get("parent_id");
  // Only one level of nesting is rendered, so a reply to a reply attaches to
  // its parent's parent rather than disappearing into a branch nothing draws.
  let parentId: string | null = parentRaw ? String(parentRaw) : null;
  if (parentId) {
    const { data: parent } = await admin
      .from("journal_comments")
      .select("id, parent_id, journal_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.journal_id !== journal.id) parentId = null;
    else if (parent.parent_id) parentId = parent.parent_id;
  }

  const { error } = await admin.from("journal_comments").insert({
    journal_id: journal.id,
    parent_id: parentId,
    author_id: user.id,
    body,
  });
  if (error) return data({ error: error.message }, { status: 400, headers });
  return data({ ok: true }, { headers });
}

/**
 * One width for the whole page.
 *
 * The page used to be built out of three: a `max-w-4xl` cover, a `max-w-4xl`
 * guide strip, a `max-w-6xl` article and a `max-w-4xl` closing panel. Nothing
 * lined up with anything — the title started 128px to the right of day one,
 * the elevation graphic started 96px to its left — and the whole thing read
 * as content shoved against the left of a page it did not fit. One shell,
 * used by every band, and the left edge is the same from the title to the
 * footer.
 */
const SHELL = "mx-auto w-full max-w-[64rem] px-4";

export default function Journal({ loaderData, actionData }: Route.ComponentProps) {
  const { journal: j, entries, tags, route, more, offering, comments, liked, signedIn } =
    loaderData as any;
  const first = j.guide_name.split(" ")[0];
  const points = elevationPoints(entries);

  // One gallery for the whole trek. Each day block knows where its own frames
  // start in that list, so opening day 9's second photo and pressing → walks
  // you into day 10 rather than dead-ending at the block boundary.
  const gallery = allMedia(entries);
  const lightbox = useLightbox(gallery);
  const offsets: number[] = [];
  let running = 0;
  for (const e of entries as JournalEntry[]) {
    offsets.push(running);
    running += e.photos?.length ?? 0;
  }
  const photoCount = gallery.length;
  // The route's stops draw the hero; the journal's own days draw the profile
  // its photographs pin to.
  const routeStops = ((route?.day_stops ?? []) as Array<{ day: number; place: string; altitude_m: number }>).filter((st) => Number(st?.altitude_m) > 0);
  const dayProfile = profileOf(
    (entries as JournalEntry[])
      .filter((e) => e.altitude_m != null)
      .map((e) => ({ day: e.day_no, place: e.title, altitude_m: e.altitude_m as number })),
  );
  const pinned = (entries as JournalEntry[])
    .map((e) => {
      const first = (e.photos ?? []).find((ph: any) => ph?.url && !isVideo(ph));
      return first ? { day: e.day_no, url: first.url as string, alt: (first as any).alt ?? e.title, caption: e.title } : null;
    })
    .filter(Boolean) as Array<{ day: number; url: string; alt: string; caption: string }>;
  // A post is one moment, not a trek: no day numerals, no elevation profile.
  const isPost = j.kind === "post";

  // The shape of the walk decides the shape of the page (see journal-reading):
  // where it breaks into chapters, which days get a picture you can see into,
  // and how far down a reader has to be before we offer them the trip.
  const chapters = isPost ? [] : chaptersOf(entries as JournalEntry[]);
  const peak = isPost ? -1 : peakIndex(entries as JournalEntry[]);
  const midCtaAfter = isPost ? null : midCtaAfterDay(entries as JournalEntry[], chapters);
  const chapterAt = new Map<number, Chapter>();
  for (const c of chapters) chapterAt.set(c.firstIndex, c);
  // With chapters there is a level above the days, so the days step down to
  // h3 rather than leaving the page with fifteen peer headings.
  const dayHeading = chapters.length ? "h3" : "h2";

  const tripHref = offering
    ? `/${offering.kind === "trek" ? "treks" : "experiences"}/${offering.slug}`
    : j.route_slug
      ? `/routes/${j.route_slug}`
      : null;

  return (
    <main className="pb-16">
      {/* 1 — Cover. Everything in the caption now sits inside the picture,
          over its own gradient. It used to hang below the photograph's bottom
          edge in white type on cream paper: the dates, the weather note and
          every tag were invisible on the live site. */}
      <header className="relative">
        {/* The trek drawn on its cover (docs/07): the route's real day stops
            as a dotted line, so the story opens on the shape of the walk. */}
        <TrailScene
          photo={j.cover_photo_url}
          alt={j.title}
          stops={routeStops}
          pins={3}
          eager
          dim={false}
          height="h-[76vh] min-h-[26rem] sm:h-[72vh] sm:min-h-[32rem]"
          className="rounded-none"
        >
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 via-ink/60 to-transparent pb-8 pt-32 sm:pb-14">
            <div className={SHELL}>
              <p className="label text-white/70">
                {j.route_region ? `${j.route_region} · Nepal` : "Nepal"}
              </p>
              <h1 className="mt-2 max-w-[22ch] font-display text-3xl leading-[1.05] text-white sm:text-5xl">
                {j.title}
              </h1>
              <p className="mt-4 font-mono text-caption text-white/85 sm:text-sm">
                {journalStatLine(j)}
              </p>
              {j.weather_note && (
                <p className="mt-1.5 max-w-[56ch] text-sm text-white/75">{j.weather_note}</p>
              )}
              {/* Route link next to the stats, not buried at the bottom — it
                  is the second most useful link on the page. */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
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
                    className="rounded-pill border border-white/40 px-2.5 py-1 text-caption text-white/90 hover:bg-white/10"
                  >
                    {t.value}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </TrailScene>
      </header>

      {/* 2 — Guide strip. Sticky: this is a story, but it is also the page
          where someone decides to book the man who wrote it — so the trip
          itself is in here, at the top, rather than only eleven thousand
          pixels down. */}
      <div className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className={cn(SHELL, "flex items-center gap-3 py-2.5")}>
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
          <Form method="post" action="/conversations" className="hidden shrink-0 sm:block">
            <input type="hidden" name="guide_id" value={j.guide_id} />
            <input type="hidden" name="next" value={`/journals/${j.slug}`} />
            <button className="rounded border border-moss px-3 py-2 text-sm font-medium text-moss hover:bg-mist">
              Message
            </button>
          </Form>
          {tripHref && (
            <Link
              to={tripHref}
              prefetch="intent"
              className="shrink-0 rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
            >
              Plan this trek
            </Link>
          )}
        </div>
      </div>

      {/* 3 — The album. A reading measure on the left, and on the right the
          column that was empty from day three down: the days as a menu, the
          route, the climb, the guide. */}
      <div className={cn(SHELL, "mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_16rem]")}>
        <div className="min-w-0">
        {entries.map((e: JournalEntry, i: number) => {
          const chapter = chapterAt.get(i);
          return (
            <Fragment key={e.id}>
              {chapter && <ChapterBreak chapter={chapter} firstOnPage={i === 0} />}
              <DayBlock
                entry={e}
                showDayNumber={!isPost}
                heading={dayHeading}
                isPeak={i === peak}
                opensChapter={!!chapter}
                shape={isPost ? "standard" : dayShape(e, { isPeak: i === peak, opensChapter: !!chapter })}
                onOpen={(k) => lightbox.open(offsets[i] + k)}
              />
              {midCtaAfter === e.day_no && (
                <PlanStrip
                  guideFirstName={first}
                  routeName={j.route_name}
                  tripHref={tripHref}
                  offeringTitle={offering?.title ?? null}
                  offeringDays={offering?.days ?? null}
                />
              )}
            </Fragment>
          );
        })}

        {photoCount > 1 && (
          <button
            type="button"
            onClick={() => lightbox.open(0)}
            className="mt-12 w-full rounded-md border border-line bg-card py-3 text-sm font-medium text-ink transition-colors hover:border-sage hover:bg-mist"
          >
            View all <span className="font-mono">{photoCount}</span> photos as a gallery
          </button>
        )}

        {/* 5 — Elevation, from what the guide actually recorded. A heading
            rather than an eyebrow, and inside a frame: as a bare graphic
            floating between two paragraphs it read as a stray widget. */}
        {!isPost && points.length >= 3 && (
          <section className="mt-16 border-t border-line pt-10">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">How high, and when</h2>
            <p className="mt-2 max-w-[56ch] text-sm text-muted">
              The climb as {first} recorded it, with his photographs where he took them.
            </p>
            {/* The guide's own photographs pinned to the climb where they
                were taken (docs/07, reference 3). Falls back to the plain
                strip when the days have no pictures. */}
            <div className="mt-6 rounded-md border border-line bg-card p-4 sm:p-6">
              {dayProfile && pinned.length >= 2 ? (
                <ProfileWithPhotos profile={dayProfile} photos={pinned} label={`${j.title}: the climb, day by day`} />
              ) : (
                <ElevationStrip points={points} />
              )}
            </div>
          </section>
        )}

        {/* 6 — The last word. His, then the family's: two quotations that had
            no heading between them and the page above. */}
        {(j.guide_note || j.client_note) && (
          <section className="mt-16 border-t border-line pt-10">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">The last word</h2>
            {j.guide_note && (
              <div className="mt-6 border-l-[3px] border-chartreuse pl-5 sm:pl-7">
                <p className="whitespace-pre-line font-display text-xl leading-relaxed text-ink sm:text-2xl">
                  {j.guide_note}
                </p>
                <p className="mt-3 text-caption text-muted">
                  — {j.guide_name}, who led this trek
                </p>
              </div>
            )}
            {j.client_note && (
              <figure className="mt-8 rounded-md bg-mist p-6">
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
          </section>
        )}

        <Comments
          comments={comments}
          signedIn={signedIn}
          guideFirstName={first}
          loginNext={`/journals/${j.slug}#comments`}
          error={(actionData as any)?.error ?? null}
        />
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            {/* The ask a long page cannot do without: a way to reach day nine
                that is not the scroll wheel. */}
            {!isPost && (
              <JourneyIndex days={entries as JournalEntry[]} chapters={chapters} />
            )}

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
              {/* Which claim this page is making. A trek we arranged and a
                  trek we did not are both true; only one of them is ours to
                  vouch for, and a reader should not have to assume. */}
              {j.pre_platform && (
                <p className="mt-3 rounded bg-mist px-2.5 py-1.5 text-caption text-ink-soft">
                  {j.guide_name} led this trek on their own — it was not booked
                  through Guides of Nepal.
                </p>
              )}
              <p className="mt-3 font-mono text-caption text-muted">
                {photoCount} photos
                {!isPost && ` · ${entries.length} days written up`}
                {comments.length > 0 &&
                  ` · ${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
              </p>

              {/* The cheap gesture. Comments ask you to have something to say;
                  most readers never will, and a guide who wrote this up at
                  eleven at night still wants to know it was read. */}
              <LikeButton
                liked={liked}
                count={j.like_count ?? 0}
                signedIn={signedIn}
                slug={j.slug}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky book bar — available the whole way down, not only at the end. */}
      <div className="sticky bottom-0 z-20 mt-12 border-t border-line bg-card/95 backdrop-blur">
        <div className={cn(SHELL, "flex items-center gap-3 py-2.5")}>
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

      {/* 8 — Book the same trail with the same man. Two columns: the offer
          used to sit in the left half of a full-bleed dark band with the
          other half empty, which is what made the foot of the page read as
          an unfinished container. */}
      <section className="mt-16 bg-pine py-14 text-paper">
        <div className={cn(SHELL, "grid items-start gap-10 md:grid-cols-[1.15fr_1fr]")}>
          <div>
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

          {/* The right half, which used to be empty: the man, and what this
              story is evidence of. */}
          <div className="rounded-md bg-paper/5 p-5 ring-1 ring-paper/15">
            <Link to={`/guides/${j.guide_slug}`} className="flex items-center gap-3">
              <SmartImage
                src={j.guide_avatar_url ?? ""}
                alt={j.guide_name}
                width={64}
                height={64}
                className="h-14 w-14 rounded-full"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-paper">{j.guide_name}</span>
                <span className="block font-mono text-caption text-sage">
                  {j.guide_district}
                </span>
              </span>
            </Link>
            <dl className="mt-5 space-y-2 text-sm">
              {!isPost && (
                <Fact
                  n={entries.length}
                  label={`${entries.length === 1 ? "day" : "days"} of this trek, written up by him`}
                />
              )}
              <Fact n={photoCount} label={`${photoCount === 1 ? "photograph" : "photographs"} he took on it`} />
              {route?.max_altitude_m ? (
                <Fact n={route.max_altitude_m.toLocaleString("en-US")} label="metres at the top of it" />
              ) : null}
            </dl>
          </div>
        </div>
      </section>

      {more.length > 0 && (
        <section className={cn(SHELL, "mt-16")}>
          <h2 className="mb-4 font-display text-2xl text-ink sm:text-3xl">More from the trail</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {more.map((o: PublicJournal) => (
              <JournalCard key={o.id} journal={o} showGuide={o.guide_id !== j.guide_id} />
            ))}
          </div>
        </section>
      )}
      {lightbox.node}
    </main>
  );
}

/** One figure and what it counts, for the dark panel at the foot. */
function Fact({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-mono text-paper">{n}</dt>
      <dd className="text-sage">{label}</dd>
    </div>
  );
}

/**
 * A chapter break.
 *
 * Fifteen days in a row all look the same however well each one is set,
 * because there is nothing above them saying where you are. These are the
 * four moments the altitudes actually mark — the walk in, going higher, the
 * high days, the way down — and a reader arriving at one knows the page has
 * turned rather than that another day has gone by.
 */
function ChapterBreak({ chapter, firstOnPage }: { chapter: Chapter; firstOnPage: boolean }) {
  return (
    <div
      id={`chapter-${chapter.key}`}
      className={cn(
        "scroll-mt-24 border-t-2 border-pine/15 pt-5",
        firstOnPage ? "mt-0" : "mt-20",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl text-pine sm:text-[2.125rem] sm:leading-[1.1]">
          {chapter.title}
        </h2>
        <p className="font-mono text-caption uppercase tracking-[0.08em] text-muted">
          {chapter.from === chapter.to
            ? `Day ${chapter.from}`
            : `Days ${chapter.from}–${chapter.to}`}
        </p>
      </div>
    </div>
  );
}

/**
 * The offer, half way down.
 *
 * A reader who has got through the climb has told us more than one who landed
 * on the cover, and the only place to act on it used to be the foot of a
 * page most of them never reach.
 */
function PlanStrip({
  guideFirstName,
  routeName,
  tripHref,
  offeringTitle,
  offeringDays,
}: {
  guideFirstName: string;
  routeName: string | null;
  tripHref: string | null;
  offeringTitle: string | null;
  offeringDays: number | null;
}) {
  if (!tripHref) return null;
  return (
    <aside className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-md border border-sage/60 bg-mist px-5 py-5">
      <div className="min-w-[14rem] flex-1">
        <p className="label text-moss">Still reading</p>
        <p className="mt-1.5 font-display text-lg leading-snug text-ink">
          {guideFirstName} walks {routeName ?? "this route"} with people every season.
        </p>
      </div>
      <Link
        to={tripHref}
        prefetch="intent"
        className="shrink-0 rounded bg-pine px-5 py-3 text-sm font-medium text-paper hover:bg-moss"
      >
        {offeringTitle && offeringDays
          ? `Plan this trek — ${offeringDays} days →`
          : "Plan this trek →"}
      </Link>
    </aside>
  );
}

/**
 * One day.
 *
 * The numeral used to hang in a 4.5rem left margin as a big pale figure,
 * which pushed every day 6rem to the right of the title, the elevation
 * graphic and the closing note — the page's ragged left edge came from here.
 * So the day and its altitude are an eyebrow above the title now, flush with
 * everything else, and the rhythm the numeral was carrying comes from the
 * chapter breaks and from which days get a picture worth stopping at.
 *
 * Three shapes, decided in `journal-reading` from the trek's own altitudes:
 *
 *   feature   the hard day, the highest day, a chapter's first day — a frame
 *             with depth, and on a wide screen wider than the prose
 *   split     a short note with its one photograph beside it
 *   standard  words, then the frames underneath
 */
function DayBlock({
  entry,
  showDayNumber,
  heading,
  isPeak,
  opensChapter,
  shape,
  onOpen,
}: {
  entry: JournalEntry;
  showDayNumber: boolean;
  heading: "h2" | "h3";
  isPeak: boolean;
  /** The chapter heading is directly above, so this day sits closer to it. */
  opensChapter: boolean;
  shape: DayShape;
  onOpen: (indexInBlock: number) => void;
}) {
  const media = (entry.photos ?? []) as JournalPhoto[];
  const H = heading;

  const where = [
    showDayNumber ? `Day ${entry.day_no}` : null,
    entry.altitude_m != null ? `${entry.altitude_m.toLocaleString("en-US")} m` : null,
  ].filter(Boolean);

  const head = (
    <header>
      {entry.is_hard_day && <p className="mb-1 label text-ember">The hard day</p>}
      {isPeak && !entry.is_hard_day && <p className="mb-1 label text-moss">The top of the trek</p>}
      <H className="font-display text-[1.375rem] leading-[1.2] text-ink sm:text-[1.75rem]">
        {entry.title}
      </H>
      {where.length > 0 && (
        <p className="mt-1.5 font-mono text-caption text-muted">{where.join(" · ")}</p>
      )}
    </header>
  );

  const body = entry.body ? (
    <p className="mt-4 whitespace-pre-line text-[1.0625rem] leading-[1.75] text-ink">
      {entry.body}
    </p>
  ) : null;

  return (
    <section
      className={cn(
        "scroll-mt-24",
        opensChapter ? "mt-8" : "mt-14 first:mt-0",
        entry.is_hard_day && "border-l-2 border-ember/50 pl-4 sm:-ml-5 sm:pl-5",
      )}
      id={`day-${entry.day_no}`}
    >
      {shape === "split" ? (
        // The one two-column day: a short note does not need the full
        // measure, and the photograph beside it breaks the column of
        // text-then-picture that the page is otherwise made of.
        <div className="lg:grid lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-7">
          <div className="min-w-0">
            {head}
            {body}
          </div>
          <MediaGrid media={media} alt={entry.title} onOpen={onOpen} className="lg:mt-0" />
        </div>
      ) : (
        <>
          {head}
          {body}
          <MediaGrid
            media={media}
            alt={entry.title}
            onOpen={onOpen}
            feature={shape === "feature"}
          />
        </>
      )}
    </section>
  );
}

/**
 * "I liked this", in one tap.
 *
 * A fetcher rather than a navigation: liking something you are halfway down
 * should not move the page. The count moves optimistically because the answer
 * is never in doubt — the row either goes in or comes out — and a number that
 * waits for a round trip on a 3G connection reads as a button that did not
 * work.
 */
function LikeButton({
  liked,
  count,
  signedIn,
  slug,
}: {
  liked: boolean;
  count: number;
  signedIn: boolean;
  slug: string;
}) {
  const fetcher = useFetcher<{ error?: string }>();
  const pending = fetcher.formData?.get("liked");
  const on = pending == null ? liked : pending !== "1";
  const shown = count + (on === liked ? 0 : on ? 1 : -1);

  if (!signedIn) {
    return (
      <p className="mt-3 text-caption text-muted">
        <Link
          to={`/login?next=${encodeURIComponent(`/journals/${slug}`)}`}
          className="text-moss underline underline-offset-4"
        >
          Sign in
        </Link>{" "}
        to like this or leave a comment.
        {count > 0 && ` ${count} ${count === 1 ? "person likes" : "people like"} it.`}
      </p>
    );
  }

  return (
    <fetcher.Form method="post" className="mt-3">
      <input type="hidden" name="intent" value="like" />
      <input type="hidden" name="liked" value={on ? "1" : "0"} />
      <button
        className={cn(
          "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-caption transition-colors",
          on
            ? "border-moss bg-mist font-medium text-moss"
            : "border-line text-ink-soft hover:border-sage hover:text-ink",
        )}
        aria-pressed={on}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
          <path d="M10 16.5S3.5 12.6 3.5 8.4A3.4 3.4 0 0110 6.3a3.4 3.4 0 016.5 2.1c0 4.2-6.5 8.1-6.5 8.1z" strokeLinejoin="round" />
        </svg>
        {on ? "Liked" : "Like"}
        {shown > 0 && <span className="font-mono">{shown}</span>}
      </button>
    </fetcher.Form>
  );
}
