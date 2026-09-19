import type { RouterContextProvider } from "react-router";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { one } from "~/lib/ops.server";
import { guideRatings } from "~/lib/ratings.server";
import { absoluteUrl } from "~/lib/seo";
import { offeringPath } from "~/components/public/cards";
import { TAKEN_STATUSES, horizonEnd, openDaysIn } from "~/lib/open-days";

type Kind = "trek" | "experience";

/** What a card on the two foot rails draws — nothing more (docs/07 §8). */
const OFFERING_CARD_COLS =
  "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, max_party, min_party, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents, guide_years_experience, route_slug, route_name";

export async function loadOfferingDetail(
  context: Readonly<RouterContextProvider>,
  slug: string,
  expect: Kind,
  request?: Request,
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
  const [{ data: photos }, { data: permits }, { data: busyDays }, { data: reviews }, { data: routeRow }] =
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
      // The days this guide is NOT free for. Absence means open (open-days.ts):
      // nothing in the app ever writes an "open" row, so asking for them
      // returned an empty list for every guide who joined through the real
      // form — and an empty list is why this page rendered "No open dates
      // right now" instead of the request form for a verified guide with a
      // live trip.
      client
        .from("availability")
        .select("day")
        .eq("guide_id", o.guide_id)
        .in("status", TAKEN_STATUSES as unknown as string[])
        .gte("day", today)
        .lte("day", horizonEnd(today))
        .order("day")
        .limit(400),
      client
        .from("public_reviews")
        .select("id, overall, body, published_at, author_name, author_country")
        .eq("offering_slug", slug)
        .order("published_at", { ascending: false }),
      // The route's day stops draw the trek on its cover (docs/07).
      o.route_id
        ? client.from("routes").select("day_stops, hero_photo_url, max_altitude_m").eq("id", o.route_id).maybeSingle()
        : Promise.resolve({ data: null as null | { day_stops: unknown; hero_photo_url: string | null; max_altitude_m: number | null } }),
    ]);

  // The tier of fact the page was missing, and the two rails at its foot.
  //
  // docs/MERGE-HANDOVER.md §5: measured against the pages a trekker in Berlin
  // compares us with, this page answered none of "what will my guide speak",
  // "who is this guide", "what else do they run", "who else runs this route".
  // The last two matter most: the page used to be a dead end, and a dead end
  // on the one screen where somebody is deciding is an expensive thing.
  const [
    { data: guideLangs },
    { data: guideRow },
    { data: alsoByGuide },
    { data: alsoOnRoute },
  ] = await Promise.all([
    client.from("guide_languages").select("language").eq("guide_id", o.guide_id),
    client
      .from("public_guides")
      .select("years_experience, treks_completed_platform, median_response_mins")
      .eq("user_id", o.guide_id)
      .maybeSingle(),
    client
      .from("public_offerings")
      .select(OFFERING_CARD_COLS)
      .eq("guide_id", o.guide_id)
      .neq("id", o.id)
      .limit(6),
    o.route_id
      ? client
          .from("public_offerings")
          .select(OFFERING_CARD_COLS)
          .eq("route_id", o.route_id)
          .neq("guide_id", o.guide_id)
          .limit(6)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const ratings = await guideRatings(client, [o.guide_id]);
  // One query for every guide on the two rails, so their cards carry a rating
  // for the same reason the browse grid does.
  const railGuideIds = [
    ...new Set([...(alsoByGuide ?? []), ...(alsoOnRoute ?? [])].map((r: any) => r.guide_id)),
  ];
  const railRatings = railGuideIds.length ? await guideRatings(client, railGuideIds) : {};
  const permitPp = (permits ?? []).reduce(
    (s: number, p: { cost_usd_cents: number }) => s + p.cost_usd_cents,
    0,
  );

  // Anything this visitor has already asked of this guide, for this trip.
  //
  // Read last, from the session rather than the public client, and only when
  // somebody is signed in — so the anonymous page stays exactly as cacheable
  // as it was. Without this the "Request sent" notice lives only as long as
  // the tab: refresh, and the page offers to send a request that was sent an
  // hour ago.
  const standing = request ? await standingAskFor(env, request, o.id) : null;

  return {
    standing,
    o,
    photos: (photos ?? []) as Array<{
      url: string;
      alt_text: string;
      credit_name: string | null;
    }>,
    // Bookable start days: a lead time of 3 days, and for multi-day treks the
    // guide must be open for EVERY day of the trek from that start (audit 6.3 —
    // a 14-day EBC could previously be requested for tomorrow on a 1-day gap).
    availableDays: bookableStartDays(
      openDaysIn(
        { from: today, to: horizonEnd(today) },
        (busyDays ?? []).map((a: { day: string }) => a.day),
        today,
      ),
      isTrek ? o.days : 1,
      today,
    ),
    reviews: (reviews ?? []) as Array<{
      id: string;
      overall: number;
      body: string | null;
      published_at: string | null;
      author_name: string;
      author_country: string | null;
    }>,
    rating: ratings[o.guide_id] ?? null,
    railRatings,
    alsoByGuide: (alsoByGuide ?? []) as any[],
    alsoOnRoute: (alsoOnRoute ?? []) as any[],
    // Empty means "whatever this guide speaks", which is the normal case —
    // only a trip deliberately led in a subset stores its own (0088).
    guideLanguages: ((guideLangs ?? []) as Array<{ language: string }>).map((g) => g.language),
    guideStats: (guideRow ?? null) as null | {
      years_experience: number | null;
      treks_completed_platform: number | null;
      median_response_mins: number | null;
    },
    permitPp,
    routeStops: (((routeRow as any)?.day_stops ?? []) as Array<{ day: number; place: string; altitude_m: number }>).filter(
      (st) => Number(st?.altitude_m) > 0,
    ),
    // Every stop, unfiltered. routeStops above drops the altitude-less ones
    // because TrailScene draws a height profile and cannot plot them — but a
    // day-by-day still has to list the day you spend in Kathmandu.
    routeDayStops: ((routeRow as any)?.day_stops ?? []) as Array<{
      day: number;
      place: string;
      altitude_m: number | null;
    }>,
    routeHero: ((routeRow as any)?.hero_photo_url ?? null) as string | null,
    routeMaxAltitude: ((routeRow as any)?.max_altitude_m ?? null) as number | null,
    canonical: absoluteUrl(env.SITE_URL, offeringPath(o)),
    ogImage: o.cover_photo_url ?? undefined,
  };
}

export type OfferingDetailData = Awaited<ReturnType<typeof loadOfferingDetail>>;


/** Start days with enough lead time AND `span` consecutive open days. */
function bookableStartDays(openDays: string[], span: number, todayIso: string): string[] {
  const LEAD_DAYS = 3;
  const lead = new Date(todayIso + "T00:00:00Z");
  lead.setUTCDate(lead.getUTCDate() + LEAD_DAYS);
  const minStart = lead.toISOString().slice(0, 10);
  const open = new Set(openDays);
  return openDays.filter((d) => {
    if (d < minStart) return false;
    if (span <= 1) return true;
    const cur = new Date(d + "T00:00:00Z");
    for (let i = 1; i < span; i++) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      if (!open.has(cur.toISOString().slice(0, 10))) return false;
    }
    return true;
  });
}


/**
 * The trekker's own history with this exact trip: their latest request, and
 * whether it became a booking that is still alive.
 *
 * Never throws and never blocks the page. A visitor who cannot be identified,
 * or a query that fails, simply gets the page as an anonymous visitor would —
 * which is wrong in a small way, where refusing to render the trek at all
 * would be wrong in a large one.
 */
async function standingAskFor(env: Env, request: Request, offeringId: string) {
  try {
    const { user } = await getSessionUser(request, env);
    if (!user) return null;
    const admin = createAdminClient(env);

    const ask = await one<{ status: string; start_date: string; expires_at: string | null }>(
      admin
        .from("enquiries")
        .select("status, start_date, expires_at")
        .eq("trekker_id", user.id)
        .eq("offering_id", offeringId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "your request for this trip",
    );
    if (ask.error || !ask.row) return null;

    const booking = await one<{ status: string }>(
      admin
        .from("bookings")
        .select("status")
        .eq("trekker_id", user.id)
        .eq("offering_id", offeringId)
        .eq("start_date", ask.row.start_date)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "your booking for this trip",
    );

    return {
      status: ask.row.status,
      startDate: ask.row.start_date,
      expiresAt: ask.row.expires_at,
      bookingStatus: booking.row?.status ?? null,
    };
  } catch {
    return null;
  }
}
