import { useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/guides.$slug";
import { pageMeta, personLd, breadcrumbLd, faqLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings } from "~/lib/ratings.server";
import { getProfile, getSessionUser } from "~/lib/auth.server";
import { QuestionWall } from "~/components/public/QuestionWall";
import { validateQuestion, type PublicQuestion } from "~/lib/questions";
import { notifyGuideOfQuestion } from "~/lib/notifications.server";
import { useMoney } from "~/lib/currency-context";
import { tierChecks } from "~/lib/tiers";
import { AvailabilityCalendar } from "~/components/public/AvailabilityCalendar";
import { OfferingCard, offeringFromUsdCents, type PublicOffering } from "~/components/public/cards";
import { RatingSummary } from "~/components/public/RatingSummary";
import { OnlyWithMe, ReviewBlock, ResponseChip, Stars, TierBadge } from "~/components/public/bits";
import { VoiceIntro } from "~/components/public/VoiceIntro";
import { SmartImage } from "~/components/SmartImage";
import { JOURNAL_COLS, journalMonth, journalStatLine, type PublicJournal } from "~/lib/journals";
import { fmtDate } from "~/lib/format";
import { cn } from "~/lib/cn";
import { pronounsFor } from "~/lib/pronouns";
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
        languages: (data.languages ?? []).map((l: any) => l.language),
        routes: (data.routeChips ?? []).map((r: any) => r.name),
        dayRateUsd: g.day_rate_usd_cents ? g.day_rate_usd_cents / 100 : null,
        // The regions this guide actually works, from the routes they run.
        areas: [
          ...new Set(
            (data.routeChips ?? [])
              .map((r: any) => r.region)
              .filter(Boolean),
          ),
        ] as string[],
        // Individual reviews alongside the aggregate — Google shows a review
        // snippet only when both are present.
        reviews: (data.reviews ?? []).map((r: any) => ({
          author: r.author_name,
          rating: r.overall,
          body: r.body,
          date: r.published_at,
        })),
      }),
    ),
    jsonLd(
      breadcrumbLd([
        { name: "Guides", url: new URL(data.canonical).origin + "/guides" },
        { name: g.full_name, url: data.canonical },
      ]),
    ),
    // The ask-me-anything wall as FAQPage. This is the point of the wall as
    // much as the reading is: a real question, answered in a named guide's
    // own words, is the shape an assistant quotes when somebody asks it the
    // same thing. Duplicate questions are dropped — the same question twice
    // is a structured-data error.
    ...(data.questions?.length
      ? [
          jsonLd(
            faqLd(
              dedupeQuestions(data.questions).map((q: PublicQuestion) => ({
                q: q.body,
                a: q.answer,
              })),
            ),
          ),
        ]
      : []),
  ];
}

/** First answer wins; a FAQPage may not carry the same question twice. */
function dedupeQuestions(qs: PublicQuestion[]): PublicQuestion[] {
  const seen = new Set<string>();
  return qs.filter((q) => {
    const k = q.body.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
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
        "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, max_party, included, meeting_point, cover_photo_url, route_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents, route_slug, route_name",
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
      .select("id, overall, body, published_at, author_name, author_country, guide_reply")
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
  const routeCounts = new Map<
    string,
    { slug: string; name: string; region: string | null; count: number }
  >();
  for (const j of js) {
    if (!j.route_slug || !j.route_name) continue;
    const cur = routeCounts.get(j.route_slug);
    if (cur) cur.count += 1;
    else
      routeCounts.set(j.route_slug, {
        slug: j.route_slug,
        name: j.route_name,
        region: (j as any).route_region ?? null,
        count: 1,
      });
  }
  const { data: offeredRoutes } = await client
    .from("public_offerings")
    .select("route_id, routes:routes(slug, name, region)")
    .eq("guide_id", guide.user_id)
    .not("route_id", "is", null);
  for (const o of (offeredRoutes ?? []) as any[]) {
    const r = o.routes;
    if (r?.slug && !routeCounts.has(r.slug)) {
      routeCounts.set(r.slug, {
        slug: r.slug,
        name: r.name,
        region: r.region ?? null,
        count: 0,
      });
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

  // The ask-me-anything wall. Answered questions only — the view enforces it,
  // so nothing pending can leak onto a public page through this loader.
  const { data: questions } = await client
    .from("public_guide_questions")
    .select("*")
    .eq("guide_id", guide.user_id);

  // Who is reading. A guide looking at their own profile gets no ask box, and
  // a signed-in reader gets their name filled in.
  let reader: { name: string | null; isThisGuide: boolean } = {
    name: null,
    isThisGuide: false,
  };
  const { user } = await getSessionUser(request, env);
  if (user) {
    const profile = await getProfile(env, user.id);
    reader = {
      name: (profile?.full_name ?? "").split(" ")[0] || null,
      isThisGuide: user.id === guide.user_id,
    };
  }

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
    questions: (questions ?? []) as PublicQuestion[],
    reader,
    repeatClients,
    usesPorters,
    maxAltitude,
    monthAnchor,
    canonical: absoluteUrl(env.SITE_URL, `/guides/${params.slug}`),
  };
}

/**
 * Somebody asked the guide a question.
 *
 * Written with the service role rather than through the reader's own session:
 * a signed-out visitor must be able to ask (that is most of the traffic this
 * is for), and the row it writes is `pending`, which no public read can see.
 * The RLS insert policy still covers the signed-in path — this is the
 * additional door, not a replacement for it.
 *
 * Two cheap gates instead of a captcha: a honeypot field no human sees, and
 * one question per email per guide per hour.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  if (String(form.get("intent")) !== "ask") return { error: "Unknown action." };

  // A bot fills every field on the page. A person cannot see this one.
  if (String(form.get("website") ?? "").trim()) {
    return { ok: "Thanks — that is with the guide." };
  }

  const name = String(form.get("name") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const bad = validateQuestion({ name, body });
  if (bad) return { error: bad };
  if (!email.includes("@")) return { error: "Add an email so we can tell you the answer." };

  const admin = createAdminClient(env);
  const { data: guide } = await admin
    .from("guides")
    .select("user_id, status")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!guide || guide.status !== "verified") {
    return { error: "That guide is not taking questions." };
  }

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("guide_questions")
    .select("id", { count: "exact", head: true })
    .eq("guide_id", guide.user_id)
    .eq("asker_email", email)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= 1) {
    return {
      error: "You already asked this guide something in the last hour — give him a chance to answer that one first.",
    };
  }

  const { user } = await getSessionUser(request, env);
  const { error } = await admin.from("guide_questions").insert({
    guide_id: guide.user_id,
    asker_id: user?.id ?? null,
    asker_name: name,
    asker_email: email,
    body,
  });
  if (error) return { error: "That did not send. Try again." };

  await notifyGuideOfQuestion(env, admin, {
    guideId: guide.user_id,
    askerName: name,
    body,
  });
  return { ok: "Asked. It goes on this page once he answers." };
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
    questions,
    reader,
    repeatClients,
    usesPorters,
    maxAltitude,
    monthAnchor,
  } = loaderData as any;
  const { m, mr } = useMoney();
  const first = guide.full_name.split(" ")[0];
  const pn = pronounsFor(guide.gender);
  // Every photograph of the guide themselves, headshot first. Most guides
  // have uploaded exactly one so far; the card handles one and handles six.
  const portraits: Array<{ url: string; alt?: string }> = [];
  for (const p of photos as any[]) {
    if (p.kind !== "headshot" && p.kind !== "portrait") continue;
    if (!p.url || portraits.some((q) => q.url === p.url)) continue;
    portraits.push({ url: p.url, alt: p.alt_text ?? "" });
  }
  if (!portraits.length && guide.avatar_url) portraits.push({ url: guide.avatar_url });
  const checks = tierChecks(guide.tier);

  // What this guide actually has. The template scales to it: a guide with one
  // trek and no history gets a tight, single-focus page, not twelve headings
  // with apologies under most of them.
  const brandNew = journals.length === 0 && reviews.length === 0 && questions.length === 0;
  const treksLed = Math.max(guide.treks_completed_platform ?? 0, journals.length);
  // Receipts keyed by check, for the fact rows.
  const receiptBy: Record<string, any> = {};
  for (const r of receipts) receiptBy[r.check_type] = r;
  const quote = guide.only_with_me ?? guide.hook_line;

  // The rail's availability summary: the next stretch of ≥3 open days, and
  // how much of the next three months is open at all.
  const nextWindow = firstRun(openDays, 3);
  const in90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const openIn90 = openDays.filter((d: string) => d <= in90).length;

  const messageForm = (label: string, cls: string) => (
    <Form method="post" action="/conversations">
      <input type="hidden" name="guide_id" value={guide.user_id} />
      <input type="hidden" name="next" value={`/guides/${guide.slug}`} />
      <button className={cls}>{label}</button>
    </Form>
  );

  return (
    <main className="pb-28">
      {/* ── 1. HEADER — her words are the hero, her name is the byline ────
          The quote is the most persuasive thing on the page: it is one
          specific promise, in the guide's own voice, that no agency template
          could produce. So it gets the display size, and the name — which a
          reader can get from any of 48 profiles — steps down to a byline. */}
      <div className="mx-auto max-w-6xl px-4 pt-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <header>
            {quote ? (
              <>
                <p className="max-w-[24ch] font-display text-[28px] leading-[1.15] text-ink sm:text-4xl">
                  &ldquo;{quote}&rdquo;
                </p>
              </>
            ) : (
              <p className="max-w-[24ch] font-display text-[28px] leading-[1.15] text-ink sm:text-4xl">
                A licensed guide from {guide.home_district ?? "Nepal"}.
              </p>
            )}

            {/* ── The trust card: the Superhost moment. Portrait, name, and
                 the numbers that prove {first} is real — large, mono, in one
                 bordered card instead of scattered small beneath a header. */}
            <div className="mt-6 overflow-hidden rounded-md border border-line bg-card">
              {/* The portrait is the point of a guide-first marketplace, so it
                  is a photograph at photograph size rather than an avatar
                  beside a name. Portrait and identity sit side by side above
                  the wide breakpoint and stack under it. */}
              <div className="grid sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <GuidePortrait
                  photos={portraits}
                  first={first}
                  district={guide.home_district}
                />
                <div className="flex flex-col justify-center p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-3xl text-ink">{first}</h1>
                    <TierBadge tier={guide.tier} />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Trekking guide · {guide.home_district}, Nepal
                  </p>
                  {quote && (
                    <p className="mt-1 text-caption text-muted">
                      The line above is {pn.possessive} own, printed as written.
                    </p>
                  )}
                  {/* Two columns, not four: at four these numbers sat in a thin
                      strip and read as a stats bar. Two gives each one room to
                      be a fact. */}
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4">
                    {guide.years_experience ? (
                      <BigNum n={guide.years_experience} label="years guiding" />
                    ) : null}
                    {treksLed > 0 && (
                      <BigNum n={treksLed} label={treksLed === 1 ? "trek led" : "treks led"} />
                    )}
                    {rating && (
                      <BigNum n={rating.value.toFixed(1)} label={`rating (${rating.count})`} />
                    )}
                    {guide.median_response_mins != null && (
                      <BigNum
                        n={
                          guide.median_response_mins >= 60
                            ? `~${Math.round(guide.median_response_mins / 60)} hr`
                            : `~${guide.median_response_mins} min`
                        }
                        label="responds in"
                      />
                    )}
                  </dl>
                </div>
              </div>
            </div>

            {/* ── Fact rows: trust facts in the open, not behind a
                 disclosure. Languages out of the bio, verification out of
                 the accordion. */}
            <ul className="mt-5 space-y-2.5">
              {languages.length > 0 && (
                <FactRow icon="speech">
                  Speaks{" "}
                  <span className="text-ink">
                    {languages.map((l: any) => l.language).join(", ")}
                  </span>
                </FactRow>
              )}
              {guide.home_district && (
                <FactRow icon="pin">Lives in {guide.home_district}</FactRow>
              )}
              {receiptBy.id_match && (
                <FactRow icon="shield">
                  Identity verified {fmtDate(receiptBy.id_match.verified_at)}
                </FactRow>
              )}
              {receiptBy.licence && (
                <FactRow icon="card">
                  Trekking licence verified
                  {receiptBy.licence.expires_at
                    ? ` to ${fmtDate(receiptBy.licence.expires_at)}`
                    : ` ${fmtDate(receiptBy.licence.verified_at)}`}
                </FactRow>
              )}
              {receiptBy.first_aid && (
                <FactRow icon="aid">
                  Wilderness first aid current
                  {receiptBy.first_aid.expires_at
                    ? ` to ${fmtDate(receiptBy.first_aid.expires_at)}`
                    : ""}
                </FactRow>
              )}
            </ul>

            {/* ── Route stamps: where {first} has actually walked, with the
                 write-ups to prove each count. Our travel stamps. */}
            {routeChips.length > 0 && (
              <div className="mt-6">
                <p className="label text-muted">Routes {first} has walked</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {routeChips.map((r: any) => (
                    <Link
                      key={r.slug}
                      to={`/routes/${r.slug}`}
                      prefetch="intent"
                      className="group rounded-md border border-line bg-card px-3.5 py-2.5 transition-colors hover:border-sage hover:bg-mist/60"
                    >
                      <span className="flex items-center gap-2">
                        <StampPeak />
                        <span className="text-sm font-medium text-ink">{r.name}</span>
                        {r.count > 0 && (
                          <span className="font-mono text-sm text-moss">×{r.count}</span>
                        )}
                      </span>
                      {r.count > 0 && (
                        <span className="mt-0.5 block pl-6 text-caption text-muted">
                          {r.count === 1 ? "written up once" : `written up ${r.count} times`}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-6 lg:hidden">
              {messageForm(
                `Message ${first} — free`,
                "rounded bg-moss px-6 py-3 font-medium text-white hover:bg-pine",
              )}
              <Link
                to={`/groups/new?guide=${guide.user_id}`}
                prefetch="intent"
                className="rounded border border-line px-5 py-3 text-sm font-medium text-ink hover:border-sage hover:bg-mist"
              >
                Go as a group
              </Link>
            </div>

            {guide.voice_intro_url && (
              <div className="mt-6">
                <VoiceIntro src={guide.voice_intro_url} name={guide.full_name} />
              </div>
            )}
          </header>

          {/* ── The rail: everything a decision needs, following the scroll.
               This is what fills the right column the old page left dead. */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 rounded-md border border-line bg-card p-5">
              {guide.day_rate_usd_cents ? (
                <p>
                  <span className="font-mono text-2xl text-ink">{m(guide.day_rate_usd_cents)}</span>
                  <span className="text-sm text-muted"> per day, {pn.possessive} whole fee</span>
                </p>
              ) : (
                <p className="font-medium text-ink">{guide.full_name}</p>
              )}
              <div className="mt-4 space-y-3">
                {messageForm(
                  `Message ${first} — free`,
                  "w-full rounded bg-moss px-6 py-3 font-medium text-white hover:bg-pine",
                )}
                <Link
                  to={`/groups/new?guide=${guide.user_id}`}
                  prefetch="intent"
                  className="block rounded border border-line px-5 py-2.5 text-center text-sm font-medium text-ink hover:border-sage hover:bg-mist"
                >
                  Go with {first} as a group
                </Link>
              </div>
              <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
                {nextWindow && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Next free</dt>
                    <dd className="font-mono text-ink">{nextWindow}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Open days, next 3 months</dt>
                  <dd className="font-mono text-ink">{openIn90}</dd>
                </div>
                {repeatClients > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Clients who came back</dt>
                    <dd className="font-mono text-ink">{repeatClients}</dd>
                  </div>
                )}
              </dl>
              <a
                href="#availability"
                className="mt-3 inline-block text-sm text-moss underline underline-offset-4 hover:text-pine"
              >
                See the calendar ↓
              </a>
            </div>
          </aside>
        </div>
      </div>

      {/* ── 2. THE BODY — left column carries the story, rail follows ───── */}
      <div className="mx-auto max-w-6xl px-4">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="min-w-0">
            {/* ── Her words, at editorial scale. The second-best content on
                 the page after the quote — full width of the column, larger
                 type, no clamp hiding it. */}
            {guide.bio && (
              <section className={brandNew ? "mt-10" : "mt-12"}>
                <p className="label text-muted">In {first}&rsquo;s words</p>
                <p className="mt-3 max-w-[58ch] whitespace-pre-line text-[19px] leading-relaxed text-ink">
                  {guide.bio}
                </p>
              </section>
            )}

            {/* ── The trek(s). One trek gets one dominant card, not a third
                 of a row — a thin catalogue displayed wide reads as focus,
                 displayed sparse reads as absence. */}
            {/* One rail, whatever the count. Trips at half-width in a grid
                 truncated their own titles; a rail you thumb card-by-card is
                 how an app shows a set, and one card on a rail still reads
                 as focus rather than absence. */}
            {offerings.length > 0 && (
              <section className="mt-14">
                <SectionHead
                  title={`Book ${first}`}
                  meta={`${offerings.length} ${offerings.length === 1 ? "trip" : "trips"} he runs`}
                />
                {offerings.length === 1 ? (
                  <div className="mt-4">
                    <FeatureTrip o={offerings[0]} />
                  </div>
                ) : (
                  <OfferingGrid offerings={offerings} />
                )}
              </section>
            )}

            {/* ── Journals — only when there are journals. The old page put a
                 full-width empty block here apologising for their absence. */}
            {journals.length > 0 && (
              <section id="journals" className="mt-12 scroll-mt-6">
                <JournalWall
                  journals={journals}
                  guideName={guide.full_name}
                  guideId={guide.user_id}
                  slug={guide.slug}
                />
              </section>
            )}

            <GuideGallery photos={gallery} first={first} />

            {/* ── Reviews — only when there are reviews. ─────────────────── */}
            {reviews.length > 0 && (
              <section className="mt-14">
                <SectionHead
                  title={`What trekkers said about ${first}`}
                  meta={`${reviews.length} review${reviews.length === 1 ? "" : "s"}`}
                />
                <RatingSummary reviews={reviews} />
                <div className="mt-6 space-y-5">
                  {reviews.map((r: any) => (
                    <ReviewBlock
                      key={r.id}
                      authorName={r.author_name}
                      country={r.author_country}
                      overall={r.overall}
                      body={r.body}
                      date={r.published_at}
                      reply={r.guide_reply}
                      replyName={first}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Ask me anything — the wall renders only with content; empty
                 it is a one-line affordance (see QuestionWall). */}
            {questions.length > 0 && (
              <div className="mt-12">
                <QuestionWall
                  guideName={guide.full_name}
                  guideFirstName={first}
                  questions={questions}
                  canAsk={!reader.isThisGuide}
                  askerName={reader.name}
                />
              </div>
            )}

            {/* ── One honest line instead of three hollow sections. A new
                 guide's page used to apologise three separate times — no
                 journals, no reviews, no questions — at full section size.
                 Being early is one fact; it is said once, small. */}
            {brandNew && (
              <section className="mt-12 rounded-md border border-line bg-card p-5">
                <p className="text-[15px] text-ink">
                  {first} is new to bookings on Trek — {pn.possessive} licence and
                  references are checked, {pn.possessive} first review is still on
                  the trail. Be {pn.possessive} first trek, first review, or first
                  question.
                </p>
                <div className="mt-3">
                  <QuestionWall
                    guideName={guide.full_name}
                    guideFirstName={first}
                    questions={questions}
                    canAsk={!reader.isThisGuide}
                    askerName={reader.name}
                  />
                </div>
              </section>
            )}

            {/* ── The quiet strip: real, load-bearing, and small. ────────── */}
            <section className="mt-12 space-y-4">
              <details className="group rounded-md border border-line bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium text-ink">
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

              {usesPorters && (
                <Link
                  to="/trust#porters"
                  className="flex items-start gap-3 rounded-md border border-line bg-card p-4 hover:bg-mist/60"
                >
                  <PorterIcon />
                  <p className="text-sm text-ink-soft">
                    <span className="font-medium text-ink">Porter-welfare pledge</span> — {first}{" "}
                    guarantees fair pay, weight limits, insurance and proper gear for every
                    porter on {pn.possessive} treks. What that means →
                  </p>
                </Link>
              )}
            </section>

            {/* ── Availability, the full calendar. The rail summarises it. ── */}
            <section id="availability" className="mt-12 scroll-mt-6">
              <p className="label text-muted">Availability</p>
              <div className="mt-3">
                <AvailabilityCalendar openDays={openDays} monthsFrom={monthAnchor} />
              </div>
            </section>
          </div>

          {/* The rail's column continues so the sticky card above tracks the
              whole body height. */}
          <div aria-hidden className="hidden lg:block" />
        </div>
      </div>

      {/* Sticky bottom bar — the rail's job, on viewports with no rail. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur lg:hidden">
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

/** "12–18 Oct" — the first stretch of at least `run` consecutive open days. */
function firstRun(openDays: string[], run: number): string | null {
  const days = [...openDays].sort();
  let streak: string[] = [];
  for (const d of days) {
    if (streak.length) {
      const prev = new Date(streak[streak.length - 1] + "T00:00:00Z");
      prev.setUTCDate(prev.getUTCDate() + 1);
      if (prev.toISOString().slice(0, 10) !== d) streak = [];
    }
    streak.push(d);
    if (streak.length >= run) {
      const a = new Date(streak[0] + "T00:00:00Z");
      const b = new Date(streak[streak.length - 1] + "T00:00:00Z");
      const mon = (x: Date) => x.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
      return a.getUTCMonth() === b.getUTCMonth()
        ? `${a.getUTCDate()}–${b.getUTCDate()} ${mon(a)}`
        : `${a.getUTCDate()} ${mon(a)} – ${b.getUTCDate()} ${mon(b)}`;
    }
  }
  return null;
}

/**
 * One trek, shown wide. A single offering in a three-column grid reads as
 * two empty slots; the same offering at full width reads as the thing this
 * guide does.
 */
/**
 * One heading treatment for the whole page: the title at display size with a
 * small line of fact set on its baseline at the right. Every section used its
 * own size and its own alignment before, which is what made the page read as
 * a stack of unrelated blocks.
 */
/**
 * The guide, at photograph size.
 *
 * An 80px avatar beside a name is how a comment thread shows a person. This
 * page asks a stranger in Berlin to hand money to this specific human, so the
 * photograph is the argument and gets the room. Extra frames, where a guide
 * has uploaded them, sit under it as thumbnails and swap the main image;
 * clicking the main image opens the full viewer.
 */
function GuidePortrait({
  photos,
  first,
  district,
}: {
  photos: Array<{ url: string; alt?: string }>;
  first: string;
  district: string | null;
}) {
  const [i, setI] = useState(0);
  const lightbox = useLightbox(photos.map((p) => ({ ...p, dayTitle: p.alt })));
  if (!photos.length) return null;
  const current = photos[Math.min(i, photos.length - 1)];
  const alt = current.alt || `${first}, trekking guide in ${district ?? "Nepal"}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => lightbox.open(Math.min(i, photos.length - 1))}
        className="group block w-full cursor-zoom-in"
        aria-label={`See ${first}'s photograph larger`}
      >
        <SmartImage
          src={current.url}
          alt={alt}
          width={520}
          height={640}
          eager
          cover
          // 4:3 on a phone, where a 4:5 frame pushed the name and the numbers
          // off the first screen; the intrinsic portrait ratio takes over
          // beside them on wider viewports.
          className="aspect-[4/3] w-full sm:aspect-auto sm:h-full sm:min-h-[280px]"
        />
      </button>

      {photos.length > 1 && (
        <div className="absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-ink/55 to-transparent p-2">
          {photos.map((p, n) => (
            <button
              key={p.url}
              type="button"
              onClick={() => setI(n)}
              aria-label={`Photograph ${n + 1} of ${photos.length}`}
              aria-current={n === i}
              className={cn(
                "size-10 overflow-hidden rounded-sm ring-2 transition",
                n === i ? "ring-paper" : "ring-transparent hover:ring-paper/60",
              )}
            >
              <SmartImage src={p.url} alt="" width={80} height={80} cover className="h-full w-full" />
            </button>
          ))}
        </div>
      )}
      {lightbox.node}
    </div>
  );
}

function SectionHead({
  title,
  meta,
  action,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="font-display text-3xl text-ink">{title}</h2>
      {action ?? (meta ? <p className="font-mono text-caption text-muted">{meta}</p> : null)}
    </div>
  );
}

/**
 * The trips, laid out the way the homepage lays them out — a card grid that
 * takes any number of them, with the tail behind a button.
 *
 * A comparison table was the wrong instinct here: it holds three trips and
 * falls apart at six, and a guide's trips are not tiers of one product to be
 * read across a row. Cards scale, and they are already the shape a reader
 * has learned everywhere else on the site.
 */
function OfferingGrid({ offerings }: { offerings: PublicOffering[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? offerings : offerings.slice(0, 6);
  return (
    <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((o) => (
          <OfferingCard key={o.id} offering={o} />
        ))}
      </div>
      {!showAll && offerings.length > shown.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-5 w-full rounded-md border border-line bg-card py-3 text-sm font-medium text-ink transition-colors duration-instant hover:border-sage hover:bg-mist"
        >
          Show the other <span className="font-mono">{offerings.length - shown.length}</span>
        </button>
      )}
    </>
  );
}

function FeatureTrip({ o }: { o: PublicOffering }) {
  // mr, not m: a "from" price rounds, the way it does on every card and in
  // the compare table. Exact cents here read as a quote, which it is not.
  const { mr } = useMoney();
  const from = offeringFromUsdCents(o);
  const href = `/${o.kind === "trek" ? "treks" : "experiences"}/${o.slug}`;
  return (
    <Link
      to={href}
      prefetch="intent"
      className="group grid overflow-hidden rounded-md border border-line bg-card transition-transform duration-quick ease-out-soft hover:-translate-y-0.5 sm:grid-cols-[minmax(0,42%)_1fr]"
    >
      <SmartImage
        src={o.cover_photo_url ?? ""}
        alt={o.title}
        width={900}
        height={640}
        cover
        className="aspect-[3/2] w-full sm:h-full"
      />
      <div className="flex flex-col justify-center p-5">
        <p className="font-display text-2xl leading-snug text-ink">{o.title}</p>
        {o.summary && (
          <p className="mt-2 line-clamp-3 text-[15px] text-ink-soft">{o.summary}</p>
        )}
        {/* A trek priced by breakdown carries no price_usd_cents, so reading
            that column directly printed the days and silently dropped the
            price. Same helper the cards and the compare table use. */}
        <p className="mt-3 font-mono text-sm text-ink">
          {o.days} days
          {from ? ` · from ${mr(from)} per person` : ""}
        </p>
        <p className="mt-3 text-sm text-moss underline underline-offset-4 group-hover:text-pine">
          The whole trip, day by day →
        </p>
      </div>
    </Link>
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

      {/* A blog index, not a card wall: these are dated pieces of writing
          about particular trips, and the shape a reader already knows for
          that is a list of entries you click into. It also survives one
          journal, which a grid did not — a single card in a three-column
          grid reads as a gap where two more should be. */}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {shown.map((j) => (
          <li key={j.id}>
            <Link
              to={`/journals/${j.slug}`}
              prefetch="intent"
              className="group grid gap-4 py-5 sm:grid-cols-[200px_minmax(0,1fr)]"
            >
              <SmartImage
                src={j.cover_photo_url ?? ""}
                alt={j.title}
                width={400}
                height={280}
                cover
                className="aspect-[3/2] w-full rounded-md"
              />
              <div className="min-w-0">
                <p className="font-mono text-caption text-muted">
                  {journalStatLine(j)}
                </p>
                <h3 className="mt-1 font-display text-xl leading-snug text-ink group-hover:text-moss">
                  {j.title}
                </h3>
                {j.guide_note && (
                  <p className="mt-1.5 line-clamp-2 text-[15px] text-ink-soft">
                    {j.guide_note}
                  </p>
                )}
                <p className="mt-2 flex items-center gap-3 text-sm text-moss">
                  <span className="underline-offset-4 group-hover:underline">
                    Read the days
                  </span>
                  {(j.comment_count ?? 0) > 0 && (
                    <span className="font-mono text-caption text-muted">
                      {j.comment_count} comment{j.comment_count === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
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
        <h2 className="font-display text-3xl text-ink">{first}&rsquo;s photographs</h2>
        <p className="font-mono text-caption text-muted">
          {photos.length} from treks he led
        </p>
      </div>

      {/* One tile size, one rhythm. The masonry that ran here mixed wide and
          tall spans and back-filled the gaps, which meant the order of the
          photographs shuffled and any row that could not tessellate left a
          hole. An even grid is what "organised" looks like, and the frames
          are large enough that nothing reads as a thumbnail. */}
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {shown.map((p, i) => (
          <li key={p.url + i}>
            <button
              type="button"
              onClick={() => lightbox.open(i)}
              className="group block w-full overflow-hidden rounded-sm bg-mist"
              aria-label={p.caption ? `Open: ${p.caption}` : "Open photo"}
            >
              <SmartImage
                src={p.url}
                alt={p.alt ?? ""}
                width={800}
                height={600}
                cover
                className="aspect-[4/3] w-full transition-transform duration-slow ease-out-soft group-hover:scale-[1.03]"
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

/** A trust-card number: large, mono, with its label underneath. */
function BigNum({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <dd className="m-0 font-mono text-2xl leading-none text-ink sm:text-3xl">
        {typeof n === "number" ? n.toLocaleString("en-US") : n}
      </dd>
      <dt className="mt-1 text-caption text-muted">{label}</dt>
    </div>
  );
}

/** One visible trust fact. Icon set is deliberately tiny and line-drawn. */
function FactRow({ icon, children }: { icon: "speech" | "pin" | "shield" | "card" | "aid"; children: React.ReactNode }) {
  const paths: Record<string, React.ReactNode> = {
    speech: <path d="M3 4h12v8H8l-3 3v-3H3z" />,
    pin: (
      <>
        <path d="M9 16s5-5.1 5-8.5A5 5 0 0 0 4 7.5C4 10.9 9 16 9 16z" />
        <circle cx="9" cy="7.5" r="1.6" />
      </>
    ),
    shield: (
      <>
        <path d="M9 2l6 2v5c0 4-2.7 6.3-6 7.5C5.7 15.3 3 13 3 9V4z" />
        <path d="M6.4 9l1.8 1.8L12 7" />
      </>
    ),
    card: (
      <>
        <rect x="2.5" y="4.5" width="13" height="9" rx="1" />
        <path d="M2.5 7.5h13" />
      </>
    ),
    aid: (
      <>
        <rect x="3" y="5" width="12" height="9" rx="1.5" />
        <path d="M9 7.5v4M7 9.5h4M7 5V3.5h4V5" />
      </>
    ),
  };
  return (
    <li className="flex items-start gap-2.5 text-sm text-ink-soft">
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-moss"
      >
        {paths[icon]}
      </svg>
      <span>{children}</span>
    </li>
  );
}

/** The stamp mark on a walked route. */
function StampPeak() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-moss">
      <path d="M1.5 13L6 5l3 5 2-3 3.5 6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
