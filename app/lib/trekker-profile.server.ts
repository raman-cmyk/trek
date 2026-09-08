import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompletedTrek, TrekkerReview } from "~/lib/trekker-profile";

/**
 * Loading a trekker's profile, and deciding who may.
 *
 * Not a public page, and this is the function that keeps it that way. A guide
 * may read the profile of somebody who has asked them to take a trip or has
 * been on one with them; ops may read any; you may read your own. Nobody else
 * — a page naming a person's country, their trek history and their dates is a
 * safety problem before it is a feature, most of all for the women trekking
 * alone this platform sets out to serve.
 */
export async function mayReadTrekker(
  admin: SupabaseClient,
  viewerId: string,
  viewerRole: string | null,
  trekkerId: string,
): Promise<boolean> {
  if (viewerId === trekkerId) return true;
  if (viewerRole === "ops") return true;
  if (viewerRole !== "guide") return false;

  // A request is enough. The decision a guide makes on this page is whether
  // to accept one, so waiting for a booking would put the page behind the
  // moment it exists for.
  const [{ count: asked }, { count: booked }] = await Promise.all([
    admin
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", viewerId)
      .eq("trekker_id", trekkerId),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", viewerId)
      .eq("trekker_id", trekkerId),
  ]);
  if ((asked ?? 0) > 0 || (booked ?? 0) > 0) return true;

  // A group the guide is leading counts too: the organiser asked through the
  // group, and the others are people the guide is being asked to walk with.
  const { count: grouped } = await admin
    .from("trip_group_members")
    .select("id, group:trip_groups!inner(guide_id)", { count: "exact", head: true })
    .eq("user_id", trekkerId)
    .eq("group.guide_id", viewerId);
  return (grouped ?? 0) > 0;
}

export async function loadTrekkerProfile(admin: SupabaseClient, trekkerId: string) {
  const { data: person } = await admin
    .from("users")
    .select("id, full_name, avatar_url, country_code, about_me, trek_experience, created_at, role")
    .eq("id", trekkerId)
    .maybeSingle();
  if (!person || person.role !== "trekker") return null;

  const [{ data: bookings }, { data: reviews }] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, start_date, end_date, party_size, status, offering:offerings(title, days, route:routes(name, region)), guide:guides(slug, users(full_name))",
      )
      .eq("trekker_id", trekkerId)
      .eq("status", "completed")
      .order("start_date", { ascending: false }),
    admin
      .from("reviews")
      .select(
        "id, overall, body, sub_ratings, published_at, created_at, author_id, booking:bookings(start_date, offering:offerings(title))",
      )
      .eq("subject_id", trekkerId)
      .eq("direction", "guide_to_trekker")
      .order("created_at", { ascending: false }),
  ]);

  // The guides who wrote them, named — a rating from nobody is worth nothing.
  const authorIds = [...new Set((reviews ?? []).map((r: any) => r.author_id))];
  const { data: authors } = authorIds.length
    ? await admin
        .from("guides")
        .select("user_id, slug, users(full_name)")
        .in("user_id", authorIds)
    : { data: [] as any[] };
  const authorById = new Map((authors ?? []).map((a: any) => [a.user_id, a]));

  const treks: CompletedTrek[] = (bookings ?? []).map((b: any) => ({
    bookingId: b.id,
    title: b.offering?.title ?? "A trek",
    routeName: b.offering?.route?.name ?? null,
    region: b.offering?.route?.region ?? null,
    days: b.offering?.days ?? nightsBetween(b.start_date, b.end_date),
    startDate: b.start_date,
    guideName: b.guide?.users?.full_name ?? null,
    guideSlug: b.guide?.slug ?? null,
    partySize: b.party_size,
  }));

  const written: TrekkerReview[] = (reviews ?? []).map((r: any) => ({
    id: r.id,
    overall: r.overall,
    body: r.body,
    sub_ratings: r.sub_ratings ?? null,
    published_at: r.published_at,
    author_name: authorById.get(r.author_id)?.users?.full_name ?? null,
    author_slug: authorById.get(r.author_id)?.slug ?? null,
    trip_title: r.booking?.offering?.title ?? null,
    trip_date: r.booking?.start_date ?? null,
  }));

  return { person, treks, reviews: written };
}

function nightsBetween(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}
