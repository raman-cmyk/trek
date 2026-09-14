import type { RouterContextProvider } from "react-router";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings, offeringRatings } from "~/lib/ratings.server";
import { absoluteUrl } from "~/lib/seo";
import { offeringPath } from "~/components/public/cards";
import { availabilitySummary, bookableStartDays } from "~/lib/availability";

type Kind = "trek" | "experience";

/** What an OfferingCard needs, and nothing more. */
const CARD_COLS =
  "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, max_party, min_party, transport, activity_level, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents, route_slug, route_name";

export async function loadOfferingDetail(
  context: Readonly<RouterContextProvider>,
  slug: string,
  expect: Kind,
) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const { data: o } = await client
    .from("public_offerings")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!o) throw new Response("Not found", { status: 404 });

  const isTrek = o.kind === "trek";
  // Enforce canonical URL space: treks under /treks, everything else /experiences.
  if ((expect === "trek") !== isTrek) {
    throw new Response("Not found", { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: photos }, { data: permits }, { data: avail }, { data: reviews }] =
    await Promise.all([
      client
        .from("offering_photos")
        .select("url, alt_text, credit_name")
        .eq("offering_id", o.id)
        .eq("approved", true)
        .order("sort"),
      isTrek && o.route_id
        ? client.from("permits").select("cost_usd_cents").eq("route_id", o.route_id)
        : Promise.resolve({ data: [] as { cost_usd_cents: number }[] }),
      client
        .from("availability")
        .select("day")
        .eq("guide_id", o.guide_id)
        .eq("status", "open")
        .gte("day", today)
        .order("day")
        .limit(400),
      client
        .from("public_reviews")
        .select("id, overall, body, published_at, author_name, author_country")
        .eq("offering_slug", slug)
        .order("published_at", { ascending: false }),
    ]);

  const openDays = (avail ?? []).map((a: { day: string }) => a.day);
  const span = isTrek ? o.days : 1;
  const startDays = bookableStartDays(openDays, span, today);

  // What a trekker will hear on the day: the trip's own list when it has one,
  // otherwise whatever this guide speaks.
  const { data: langRows } = await client
    .from("guide_languages")
    .select("language, proficiency")
    .eq("guide_id", o.guide_id);

  // Two rails at the foot of the page, which every page we are compared with
  // has and ours did not: the rest of this guide's work, and the same kind of
  // trip from somebody else. Without them the page is a dead end for a reader
  // who likes the guide but not this trip.
  const [{ data: moreByGuide }, { data: similar }] = await Promise.all([
    client
      .from("public_offerings")
      .select(CARD_COLS)
      .eq("guide_id", o.guide_id)
      .neq("id", o.id)
      .limit(6),
    o.route_id
      ? client
          .from("public_offerings")
          .select(CARD_COLS)
          .eq("route_id", o.route_id)
          .neq("guide_id", o.guide_id)
          .limit(6)
      : client
          .from("public_offerings")
          .select(CARD_COLS)
          .eq("kind", o.kind)
          .neq("id", o.id)
          .neq("guide_id", o.guide_id)
          .limit(6),
  ]);

  const ratings = await guideRatings(client, [o.guide_id]);
  const railRatings = await offeringRatings(client, [
    ...(moreByGuide ?? []).map((x: { id: string }) => x.id),
    ...(similar ?? []).map((x: { id: string }) => x.id),
  ]);
  const permitPp = (permits ?? []).reduce(
    (s: number, p: { cost_usd_cents: number }) => s + p.cost_usd_cents,
    0,
  );

  return {
    o,
    photos: (photos ?? []) as Array<{
      url: string;
      alt_text: string;
      credit_name: string | null;
    }>,
    // Bookable start days: a lead time of 3 days, and for multi-day treks the
    // guide must be open for EVERY day of the trek from that start (audit 6.3 —
    // a 14-day EBC could previously be requested for tomorrow on a 1-day gap).
    availableDays: startDays,
    // The guide's free days, unfiltered. The page shows both, because "the
    // guide is free" and "this trip can start" are different questions and
    // the difference is the thing a reader cannot otherwise work out.
    openDays,
    availability: availabilitySummary({ openDays, bookableDays: startDays, today }),
    span,
    today,
    monthAnchor: `${today.slice(0, 7)}-01`,
    reviews: (reviews ?? []) as Array<{
      id: string;
      overall: number;
      body: string | null;
      published_at: string | null;
      author_name: string;
      author_country: string | null;
    }>,
    rating: ratings[o.guide_id] ?? null,
    guideLanguages: (langRows ?? [])
      .filter((l: { proficiency: string }) => l.proficiency !== "basic")
      .map((l: { language: string }) => l.language),
    moreByGuide: (moreByGuide ?? []) as any[],
    similar: (similar ?? []) as any[],
    railRatings,
    permitPp,
    canonical: absoluteUrl(env.SITE_URL, offeringPath(o)),
    ogImage: o.cover_photo_url ?? undefined,
  };
}

export type OfferingDetailData = Awaited<ReturnType<typeof loadOfferingDetail>>;
