import { useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/guides.$slug";
import { pageMeta, personLd, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings } from "~/lib/ratings.server";
import { useMoney } from "~/lib/currency-context";
import { tierChecks } from "~/lib/tiers";
import { AvailabilityCalendar } from "~/components/public/AvailabilityCalendar";
import { OfferingCard, type PublicOffering } from "~/components/public/cards";
import { JournalCard } from "~/components/public/JournalCard";
import { OnlyWithMe, ReviewBlock, ResponseChip, Stars, TierBadge } from "~/components/public/bits";
import { VoiceIntro } from "~/components/public/VoiceIntro";
import { SmartImage } from "~/components/SmartImage";
import { JOURNAL_COLS, journalMonth, type PublicJournal } from "~/lib/journals";
import { fmtDate } from "~/lib/format";
import { cn } from "~/lib/cn";
import { useLightbox } from "~/components/public/Lightbox";

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Guide not found" }];
  const g = data.guide;
  return [
    ...pageMeta({
      title: `${g.full_name} — trekking guide${g.home_district ? `, ${g.home_district}` : ""}`,
      description:
        g.only_with_me ??
        g.hook_line ??
        `Book ${g.full_name}, a verified trekking guide in Nepal.`,
      canonical: data.canonical,
      image: g.avatar_url ?? undefined,
      type: "profile",
    }),
    jsonLd(
      personLd({
        name: g.full_name,
        url: data.canonical,
        image: g.avatar_url,
        district: g.home_district,
        bio: g.bio,
        rating: data.rating,
      }),
    ),
    jsonLd(
      breadcrumbLd([
        { name: "Guides", url: new URL(data.canonical).origin + "/guides" },
        { name: g.full_name, url: data.canonical },
      ]),
    ),
  ];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const { data: guide } = await client
    .from("public_guides")
    .select("*")
    .eq("slug", params.slug)
    .single();
  if (!guide) throw new Response("Guide not found", { status: 404 });

  const today = new Date();
  const monthAnchor = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const todayIso = today.toISOString().slice(0, 10);

  const [
    { data: photos },
    { data: langs },
    { data: offerings },
    { data: avail },
    { data: reviews },
    { data: receipts },
    { data: journals },
  ] = await Promise.all([
    client
      .from("guide_photos")
      .select("url, alt_text, kind")
      .eq("guide_id", guide.user_id)
      .order("sort"),
    client.from("guide_languages").select("language, proficiency").eq("guide_id", guide.user_id),
    client
      .from("public_offerings")
      .select(
        "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, max_party, cover_photo_url, route_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents, route_slug, route_name",
      )
      .eq("guide_id", guide.user_id),
    client
      .from("availability")
      .select("day")
      .eq("guide_id", guide.user_id)
      .eq("status", "open")
      .gte("day", todayIso)
      .order("day"),
    client
      .from("public_reviews")
      .select("id, overall, body, published_at, author_name, author_country")
      .eq("guide_id", guide.user_id)
      .order("published_at", { ascending: false }),
    client
      .from("public_guide_verifications")
      .select("check_type, verified_at, expires_at")
      .eq("guide_id", guide.user_id)
      .order("verified_at"),
    // THE WALL.
    client
      .from("public_journals")
      .select(JOURNAL_COLS)
      .eq("guide_id", guide.user_id)
      .order("start_date", { ascending: false }),
  ]);

  const js = (journals ?? []) as PublicJournal[];

  // The gallery: this guide's own photographs, then every frame from the treks
  // they have written up. The journal ones carry which trek they came from, so
  // a picture in the viewer is never an anonymous stock-looking image — it is
  // "Day 9, Manaslu in late October", with somewhere to go.
  const { data: journalEntries } = js.length
    ? await client
        .from("public_journal_entries")
        .select("journal_id, day_no, title, photos")
        .in(
          "journal_id",
          js.map((j) => j.id),
        )
        .order("day_no")
    : { data: [] as any[] };

  const journalBySlug = new Map(js.map((j) => [j.id, j]));
  const seenUrl = new Set<string>();
  const gallery: Array<{
    url: string;
    alt?: string;
    caption?: string;
    day?: number;
    href?: string;
  }> = [];

  for (const p of (photos ?? []) as any[]) {
    if (p.kind === "headshot" || !p.url || seenUrl.has(p.url)) continue;
    seenUrl.add(p.url);
    gallery.push({ url: p.url, alt: p.alt_text ?? "", caption: p.alt_text ?? undefined });
  }
  for (const e of (journalEntries ?? []) as any[]) {
    const j = journalBySlug.get(e.journal_id);
    for (const m of (e.photos ?? []) as any[]) {
      // Video needs a poster to sit in a grid of stills; skip it here rather
      // than render a black square. The journal page plays it properly.
      if (!m?.url || m.kind === "video" || seenUrl.has(m.url)) continue;
      seenUrl.add(m.url);
      gallery.push({
        url: m.url,
        alt: m.alt ?? e.title ?? "",
        caption: j ? `${e.title} — ${j.title}` : e.title,
        day: e.day_no,
        href: j ? `/journals/${j.slug}#day-${e.day_no}` : undefined,
      });
    }
  }

  // Routes he actually runs, with how many times he has led each — counted
  // from journals (real trips) and topped up from what he currently offers.
  const routeCounts = new Map<string, { slug: string; name: string; count: number }>();
  for (const j of js) {
    if (!j.route_slug || !j.route_name) continue;
    const cur = routeCounts.get(j.route_slug);
    if (cur) cur.count += 1;
    else routeCounts.set(j.route_slug, { slug: j.route_slug, name: j.route_name, count: 1 });
  }
  const { data: offeredRoutes } = await client
    .from("public_offerings")
    .select("route_id, routes:routes(slug, name)")
    .eq("guide_id", guide.user_id)
    .not("route_id", "is", null);
  for (const o of (offeredRoutes ?? []) as any[]) {
    const r = o.routes;
    if (r?.slug && !routeCounts.has(r.slug)) {
      routeCounts.set(r.slug, { slug: r.slug, name: r.name, count: 0 });
    }
  }

  // Repeat clients — the quietest, hardest-to-fake number on the page. Needs
  // the admin client because bookings are not public.
  let repeatClients = 0;
  try {
    const admin = createAdminClient(env);
    const { data: bk } = await admin
      .from("bookings")
      .select("trekker_id")
      .eq("guide_id", guide.user_id)
      .in("status", ["completed", "active", "confirmed"]);
    const seen = new Map<string, number>();
    for (const b of bk ?? []) seen.set(b.trekker_id, (seen.get(b.trekker_id) ?? 0) + 1);
    repeatClients = [...seen.values()].filter((n) => n > 1).length;
  } catch {
    repeatClients = 0;
  }

  const ratings = await guideRatings(client, [guide.user_id]);

  // Does this guide put porters on the hill? If so the pledge shows, full
  // stop — it used to be tied to tier, which is why it appeared on some
  // profiles and not others for no reason a trekker could see.
  const usesPorters = (offerings ?? []).some(
    (o: any) => (o.price_breakdown?.porters_usd_cents ?? 0) > 0,
  );

  const maxAltitude = js.reduce((n, j) => Math.max(n, j.max_altitude_m ?? 0), 0);

  return {
    guide,
    photos: (photos ?? []) as Array<{ url: string; alt_text: string; kind: string }>,
    languages: (langs ?? []) as Array<{ language: string; proficiency: string }>,
    offerings: (offerings ?? []) as PublicOffering[],
    journals: js,
    gallery,
    routeChips: [...routeCounts.values()].sort((a, b) => b.count - a.count),
    openDays: (avail ?? []).map((a: { day: string }) => a.day),
    reviews: reviews ?? [],
    receipts: receipts ?? [],
    rating: ratings[guide.user_id] ?? null,
    repeatClients,
    usesPorters,
    maxAltitude,
    monthAnchor,
    canonical: absoluteUrl(env.SITE_URL, `/guides/${params.slug}`),
  };
}

const CHECK_LABELS: Record<string, string> = {
  licence: "Trekking licence verified",
  id_match: "Government ID matched",
  phone: "Phone verified",
  reference_1: "Reference called",
  reference_2: "Second reference called",
  first_aid: "Wilderness first-aid current",
  payout_account: "Payout account verified",
  police_clearance: "Police clearance",
  altitude_training: "Altitude training",
};

export default function GuideProfile({ loaderData }: Route.ComponentProps) {
  const {
    guide,
    photos,
    gallery,
    languages,
    offerings,
    journals,
    routeChips,
    openDays,
    reviews,
    receipts,
    rating,
    repeatClients,
    usesPorters,
    maxAltitude,
    monthAnchor,
  } = loaderData as any;
  const { m, mr } = useMoney();
  const first = guide.full_name.split(" ")[0];
  const portrait =
    photos.find((p: any) => p.kind === "headshot")?.url ?? guide.avatar_url ?? "";
  const checks = tierChecks(guide.tier);

  return (
    <main className="pb-28">
      {/* ── 1. HEADER ─────────────────────────────────────────────────────
          Two columns, no floating price card, no empty right rail. The only
          primary button is Message: talking is free and it is what we want
          to happen. Price lives in the stat band and the sticky bar. */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,300px)_1fr] sm:gap-8">
          <SmartImage
            src={portrait}
            alt={`${guide.full_name}, trekking guide in ${guide.home_district ?? "Nepal"}`}
            width={600}
            height={750}
            eager
            className="aspect-[4/5] w-full rounded-md"
          />

          <header className="flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl text-ink sm:text-4xl">{guide.full_name}</h1>
              <TierBadge tier={guide.tier} />
            </div>
            <p className="mt-1 text-ink-soft">{guide.home_district}, Nepal</p>

            {guide.only_with_me && (
              <div className="pt-4">
                <OnlyWithMe line={guide.only_with_me} firstName={first} size="profile" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-4">
              {rating && <Stars value={rating.value} count={rating.count} />}
              <ResponseChip mins={guide.median_response_mins} />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-4">
              <Form method="post" action="/conversations">
                <input type="hidden" name="guide_id" value={guide.user_id} />
                <input type="hidden" name="next" value={`/guides/${guide.slug}`} />
                <button className="rounded bg-moss px-6 py-3 font-medium text-white hover:bg-pine">
                  Message {first} — free
                </button>
              </Form>
              {/* Some people arrive having already picked their guide and will
                  walk whatever he recommends. Let them start the group here,
                  before they know which trek. */}
              <Link
                to={`/groups/new?guide=${guide.user_id}`}
                prefetch="intent"
                className="rounded border border-line px-5 py-3 text-sm font-medium text-ink hover:border-sage hover:bg-mist"
              >
                Go with {first} as a group
              </Link>
            </div>
          </header>
        </div>

        {/* Stat band — mono, real, and the counts jump to the section that
            proves them. */}
        <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-4 border-y border-line py-4">
          <Stat n={guide.years_experience ?? "—"} label="years" />
          <Stat
            n={journals.length || guide.treks_completed_platform}
            label={journals.length ? "treks written up" : "treks on Trek"}
            href={journals.length ? "#journals" : undefined}
          />
          {routeChips.length > 0 && (
            <Stat n={routeChips.length} label="routes" href="#routes" />
          )}
          {maxAltitude > 0 && (
            <Stat n={`${maxAltitude.toLocaleString("en-US")} m`} label="highest" />
          )}
          {repeatClients > 0 && (
            <Stat n={repeatClients} label={repeatClients === 1 ? "repeat client" : "repeat clients"} />
          )}
          {guide.day_rate_usd_cents ? (
            <Stat n={`from ${mr(guide.day_rate_usd_cents)}`} label="per day" />
          ) : null}
        </dl>

        {guide.voice_intro_url && (
          <div className="mt-6">
            <VoiceIntro src={guide.voice_intro_url} name={guide.full_name} />
          </div>
        )}
      </div>

      {/* ── 2. THE JOURNAL WALL ───────────────────────────────────────────
          Directly under the header, because this is the argument. */}
      <section id="journals" className="mx-auto mt-12 max-w-6xl scroll-mt-6 px-4">
        <JournalWall journals={journals} guideName={guide.full_name} guideId={guide.user_id} slug={guide.slug} />
      </section>

      {/* ── 2b. The gallery ────────────────────────────────────────────── */}
      <GuideGallery photos={gallery} first={first} />

      <div className="mx-auto max-w-5xl px-4">
        {/* ── 3. Routes he runs ─────────────────────────────────────────── */}
        {routeChips.length > 0 && (
          <section id="routes" className="mt-14 scroll-mt-6">
            <h2 className="font-display text-2xl text-ink">Routes {first} runs</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {routeChips.map((r: any) => (
                <Link
                  key={r.slug}
                  to={`/routes/${r.slug}`}
                  prefetch="intent"
                  className="rounded-pill border border-line bg-card px-3.5 py-1.5 text-sm text-ink hover:border-sage"
                >
                  {r.name}
                  {r.count > 0 && (
                    <span className="ml-1.5 font-mono text-muted">×{r.count}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 4. Bookable trips ─────────────────────────────────────────── */}
        {offerings.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-4 font-display text-2xl text-ink">
              Book {first}
            </h2>
            <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-3">
              {offerings.map((o: PublicOffering) => (
                <OfferingCard key={o.id} offering={o} />
              ))}
            </div>
          </section>
        )}

        {/* ── The bio, demoted. The journals are the bio now. ───────────── */}
        {guide.bio && (
          <section className="mt-14">
            <h2 className="font-display text-2xl text-ink">In {first}'s words</h2>
            <Clamp text={guide.bio} />
            {languages.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                Speaks{" "}
                <span className="text-ink">
                  {languages.map((l: any) => l.language).join(", ")}
                </span>
              </p>
            )}
          </section>
        )}

        {/* ── 5. Reviews — count stated honestly either way ─────────────── */}
        <section className="mt-14">
          <h2 className="font-display text-2xl text-ink">
            {reviews.length > 0
              ? `${reviews.length} review${reviews.length === 1 ? "" : "s"}`
              : "Reviews"}
          </h2>
          {reviews.length > 0 ? (
            <div className="mt-4 space-y-5">
              {reviews.map((r: any) => (
                <ReviewBlock
                  key={r.id}
                  authorName={r.author_name}
                  country={r.author_country}
                  overall={r.overall}
                  body={r.body}
                  date={r.published_at}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 max-w-[54ch] text-muted">
              {guide.treks_completed_platform > 0
                ? `${guide.treks_completed_platform} treks led — reviews arrive as clients get home. We ask after every single trek, and we publish whatever comes back.`
                : `${first} is new to Trek. We ask for a review after every trek and publish whatever comes back — his first is still on the trail.`}
            </p>
          )}
        </section>

        {/* ── 6. Verification receipts, collapsed ───────────────────────── */}
        <section className="mt-10">
          <details className="group rounded-md border border-line bg-card p-4">
            <summary className="cursor-pointer font-medium text-ink">
              {receipts.length > 0
                ? `Verification receipts (${receipts.length})`
                : "What we checked"}
            </summary>
            <ul className="mt-3 space-y-1.5 text-sm">
              {receipts.length > 0
                ? receipts.map((r: any) => (
                    <li key={r.check_type} className="flex items-baseline justify-between gap-3">
                      <span className="flex gap-2">
                        <span className="text-accent">✓</span>
                        {CHECK_LABELS[r.check_type] ?? r.check_type.replace(/_/g, " ")}
                      </span>
                      <span className="whitespace-nowrap font-mono text-xs text-ink-soft">
                        {fmtDate(r.verified_at)}
                        {r.expires_at ? ` → ${fmtDate(r.expires_at)}` : ""}
                      </span>
                    </li>
                  ))
                : checks.map((c: string) => (
                    <li key={c} className="flex gap-2">
                      <span className="text-accent">✓</span>
                      {c}
                    </li>
                  ))}
            </ul>
            <Link to="/trust" className="mt-3 inline-block text-xs text-primary hover:underline">
              How Trek verifies guides →
            </Link>
          </details>
        </section>

        {/* ── 7. Porter pledge — every profile that uses porters ─────────── */}
        {usesPorters && (
          <Link
            to="/trust#porters"
            className="mt-4 flex items-start gap-3 rounded-md border border-accent/30 bg-accent/5 p-4 hover:bg-accent/10"
          >
            <PorterIcon />
            <p className="text-sm text-ink-soft">
              <span className="font-medium text-ink">Porter-welfare pledge</span> — {first}{" "}
              guarantees fair pay, weight limits, insurance and proper gear for every porter
              on his treks. What that means →
            </p>
          </Link>
        )}

        {/* ── 8. Availability ───────────────────────────────────────────── */}
        <section className="mt-14">
          <h2 className="mb-4 font-display text-2xl text-ink">Availability</h2>
          <AvailabilityCalendar openDays={openDays} monthsFrom={monthAnchor} />
        </section>
      </div>

      {/* Sticky bottom bar — replaces the right rail on every viewport. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          <p className="min-w-0 flex-1 text-sm">
            {guide.day_rate_usd_cents ? (
              <>
                <span className="text-muted">From</span>{" "}
                <span className="font-mono font-medium text-ink">
                  {m(guide.day_rate_usd_cents)}
                </span>
                <span className="text-muted">/day</span>
              </>
            ) : (
              <span className="font-medium text-ink">{guide.full_name}</span>
            )}
          </p>
          <Form method="post" action="/conversations" className="shrink-0">
            <input type="hidden" name="guide_id" value={guide.user_id} />
            <input type="hidden" name="next" value={`/guides/${guide.slug}`} />
            <button className="rounded border border-moss px-4 py-2 text-sm font-medium text-moss hover:bg-mist">
              Message
            </button>
          </Form>
          {offerings[0] && (
            <Link
              to={`/${offerings[0].kind === "trek" ? "treks" : "experiences"}/${offerings[0].slug}`}
              className="shrink-0 rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
            >
              See trips
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * The wall. First card is deliberately dominant; after that the shapes
 * alternate so no two neighbours match. Filter chips appear only once there
 * are enough journals for filtering to be a kindness rather than clutter.
 */
function JournalWall({
  journals,
  guideName,
  guideId,
  slug,
}: {
  journals: PublicJournal[];
  guideName: string;
  guideId: string;
  slug: string;
}) {
  const first = guideName.split(" ")[0];
  const [route, setRoute] = useState("");
  const [season, setSeason] = useState("");

  if (journals.length === 0) {
    // Absence turned into an invitation (brief §2.1).
    return (
      <div className="rounded-md border border-dashed border-line bg-card p-8 text-center">
        <h2 className="font-display text-2xl text-ink">
          The next journal isn&rsquo;t written yet.
        </h2>
        <p className="mx-auto mt-2 max-w-[46ch] text-muted">
          Book {first} this season and you&rsquo;ll be in it — every trek ends
          with photos and his own account of the days.
        </p>
        <Form method="post" action="/conversations" className="mt-4">
          <input type="hidden" name="guide_id" value={guideId} />
          <input type="hidden" name="next" value={`/guides/${slug}`} />
          <button className="rounded bg-moss px-5 py-2.5 text-sm font-medium text-white hover:bg-pine">
            Message {first} — free
          </button>
        </Form>
      </div>
    );
  }

  const routes = [...new Set(journals.map((j) => j.route_name).filter(Boolean))] as string[];
  const seasons = [...new Set(journals.map((j) => journalMonth(j.start_date).split(" ")[0]))];
  const shown = journals.filter(
    (j) =>
      (!route || j.route_name === route) &&
      (!season || journalMonth(j.start_date).startsWith(season)),
  );

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-3xl text-ink">
          <span className="font-mono">{journals.length}</span>{" "}
          {journals.length === 1 ? "trek, as it happened" : "treks, as they happened"}
        </h2>
        <Link
          to={`/journals?guide=${slug}`}
          prefetch="intent"
          className="text-sm font-medium text-moss hover:underline"
        >
          All of {first}'s journals →
        </Link>
      </div>

      {journals.length > 6 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip active={!route && !season} onClick={() => { setRoute(""); setSeason(""); }}>
            All
          </Chip>
          {routes.map((r) => (
            <Chip key={r} active={route === r} onClick={() => setRoute(route === r ? "" : r)}>
              {r}
            </Chip>
          ))}
          {seasons.map((s) => (
            <Chip key={s} active={season === s} onClick={() => setSeason(season === s ? "" : s)}>
              {s}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((j, i) => (
          <div key={j.id} className={i === 0 ? "sm:col-span-2 lg:row-span-2" : ""}>
            <JournalCard journal={j} size={i === 0 ? "lead" : "normal"} />
          </div>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="mt-6 text-muted">Nothing on that route in that season yet.</p>
      )}
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-pill px-3 py-1.5 text-sm transition-colors",
        active ? "bg-pine text-paper" : "border border-line bg-card text-ink hover:border-sage",
      )}
    >
      {children}
    </button>
  );
}

function Stat({
  n,
  label,
  href,
}: {
  n: React.ReactNode;
  label: string;
  href?: string;
}) {
  const body = (
    <>
      <dd className="font-mono text-xl text-ink">{n}</dd>
      <dt className="text-caption text-muted">{label}</dt>
    </>
  );
  return href ? (
    <a href={href} className="group block hover:text-moss">
      {body}
    </a>
  ) : (
    <div>{body}</div>
  );
}

/** Three lines, then "more" — no mid-word cuts, because it clamps by line. */
function Clamp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <p
        className={cn(
          "max-w-[62ch] whitespace-pre-line leading-relaxed text-ink",
          !open && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {text.length > 180 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 text-sm font-medium text-moss hover:underline"
        >
          {open ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

/** Line icon, not an emoji — emoji render as someone else's brand. */
function PorterIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mt-0.5 h-5 w-5 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      <path d="M9 14h6" />
    </svg>
  );
}


/**
 * Everything this guide has photographed.
 *
 * The guide_photos rows were being fetched and then used only to find a
 * headshot — the rest were loaded on every profile view and never rendered.
 * Together with every frame from their journals that is a real body of work
 * sitting unused, and it is the most direct answer a profile can give to "what
 * would it actually be like".
 *
 * A masonry-ish grid rather than a tidy row of squares: uniform tiles turn
 * photographs into thumbnails, and every fourth frame breaking wide is what
 * keeps it reading as somebody's pictures.
 */
function GuideGallery({
  photos,
  first,
}: {
  photos: Array<{ url: string; alt?: string; caption?: string; day?: number; href?: string }>;
  first: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const lightbox = useLightbox(photos.map((p) => ({ ...p, dayTitle: p.caption })));
  if (photos.length < 4) return null;

  const shown = showAll ? photos : photos.slice(0, 12);

  return (
    <section id="gallery" className="mx-auto mt-14 max-w-6xl scroll-mt-6 px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">{first}&rsquo;s photographs</h2>
        <p className="font-mono text-caption text-muted">
          {photos.length} from treks he led
        </p>
      </div>

      {/* grid-flow-dense: the wide and tall tiles do not tessellate on their
          own, and without back-filling the row leaves holes that read as
          missing photographs rather than as a layout. */}
      <ul className="mt-4 grid auto-rows-[9rem] grid-flow-dense grid-cols-2 gap-2 sm:auto-rows-[11rem] sm:grid-cols-4 sm:gap-3">
        {shown.map((p, i) => (
          <li
            key={p.url + i}
            // Every fourth frame takes two columns. Regular enough to be a
            // rhythm, irregular enough not to be a grid of thumbnails.
            className={cn(i % 7 === 0 && "col-span-2", i % 7 === 3 && "row-span-2")}
          >
            <button
              type="button"
              onClick={() => lightbox.open(i)}
              className="group block h-full w-full overflow-hidden rounded-sm bg-mist"
              aria-label={p.caption ? `Open: ${p.caption}` : "Open photo"}
            >
              <SmartImage
                src={p.url}
                alt={p.alt ?? ""}
                width={800}
                height={600}
                cover
                className="h-full w-full transition-transform duration-slow ease-out-soft group-hover:scale-[1.03]"
              />
            </button>
          </li>
        ))}
      </ul>

      {!showAll && photos.length > shown.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 w-full rounded-md border border-line bg-card py-3 text-sm font-medium text-ink hover:border-sage hover:bg-mist"
        >
          Show the other <span className="font-mono">{photos.length - shown.length}</span>
        </button>
      )}
      {lightbox.node}
    </section>
  );
}
