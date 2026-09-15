import type { RouterContextProvider } from "react-router";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { one } from "~/lib/ops.server";
import { guideRatings } from "~/lib/ratings.server";
import { absoluteUrl } from "~/lib/seo";
import { offeringPath } from "~/components/public/cards";

type Kind = "trek" | "experience";

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
  const [{ data: photos }, { data: permits }, { data: avail }, { data: reviews }, { data: routeRow }] =
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
      // The route's day stops draw the trek on its cover (docs/07).
      o.route_id
        ? client.from("routes").select("day_stops, hero_photo_url, max_altitude_m").eq("id", o.route_id).maybeSingle()
        : Promise.resolve({ data: null as null | { day_stops: unknown; hero_photo_url: string | null; max_altitude_m: number | null } }),
    ]);

  const ratings = await guideRatings(client, [o.guide_id]);
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
      (avail ?? []).map((a: { day: string }) => a.day),
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
    permitPp,
    routeStops: (((routeRow as any)?.day_stops ?? []) as Array<{ day: number; place: string; altitude_m: number }>).filter(
      (st) => Number(st?.altitude_m) > 0,
    ),
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
