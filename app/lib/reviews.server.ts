import type { SupabaseClient } from "@supabase/supabase-js";
import { reviewsToRelease } from "~/lib/reviews";

/** Submit a review (hidden), then release any that are now due for the booking. */
export async function submitReview(
  admin: SupabaseClient,
  args: {
    bookingId: string;
    authorId: string;
    subjectId: string;
    direction: "trekker_to_guide" | "guide_to_trekker";
    overall: number;
    subRatings: Record<string, number>;
    body: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from("reviews").insert({
    booking_id: args.bookingId,
    author_id: args.authorId,
    subject_id: args.subjectId,
    direction: args.direction,
    overall: args.overall,
    sub_ratings: args.subRatings,
    body: args.body,
  });
  if (error) return { ok: false, error: error.message };
  await releaseForBooking(admin, args.bookingId);
  return { ok: true };
}

/** Publish reviews for one booking if both sides are in (or one is stale). */
export async function releaseForBooking(admin: SupabaseClient, bookingId: string) {
  const { data: rows } = await admin
    .from("reviews")
    .select("id, direction, created_at, published_at")
    .eq("booking_id", bookingId);
  const now = new Date().toISOString();
  const due = reviewsToRelease(rows ?? [], now);
  for (const r of due as any[]) {
    await admin.from("reviews").update({ published_at: now }).eq("id", r.id);
  }
}

/** Cron: release lone reviews that have passed the 14-day blind window. */
export async function releaseStaleReviews(admin: SupabaseClient, nowIso: string) {
  const { data: unpublished } = await admin
    .from("reviews")
    .select("id, booking_id, direction, created_at, published_at")
    .is("published_at", null);
  const byBooking = new Map<string, any[]>();
  for (const r of unpublished ?? []) {
    (byBooking.get(r.booking_id) ?? byBooking.set(r.booking_id, []).get(r.booking_id))!.push(r);
  }
  let released = 0;
  for (const rows of byBooking.values()) {
    for (const r of reviewsToRelease(rows, nowIso) as any[]) {
      await admin.from("reviews").update({ published_at: nowIso }).eq("id", r.id);
      released++;
    }
  }
  return { released };
}

/** Attach a trekker photo to a review → offering_photos moderation queue. */
export async function addReviewPhoto(
  admin: SupabaseClient,
  args: { offeringId: string; url: string; creditName: string; alt: string },
) {
  await admin.from("offering_photos").insert({
    offering_id: args.offeringId,
    url: args.url,
    alt_text: args.alt,
    credit_name: args.creditName,
    source: "trekker",
    approved: false,
  });
}

/** Auto-generate a shareable recap when a booking completes (docs/01). */
export async function createRecap(admin: SupabaseClient, bookingId: string) {
  const { data: existing } = await admin
    .from("recaps")
    .select("slug")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) return existing.slug;

  const { data: b } = await admin
    .from("bookings")
    .select("id, start_date, end_date, offering:offerings(slug, route:routes(max_altitude_m))")
    .eq("id", bookingId)
    .single();
  if (!b) return null;

  const days =
    Math.max(1, Math.round((Date.parse(b.end_date) - Date.parse(b.start_date)) / 86_400_000) + 1);
  const slug = `${(b as any).offering?.slug ?? "trek"}-${bookingId.slice(0, 8)}`;

  const { data: photos } = await admin
    .from("offering_photos")
    .select("url")
    .eq("approved", true)
    .limit(6);

  await admin.from("recaps").insert({
    booking_id: bookingId,
    slug,
    photo_urls: (photos ?? []).map((p) => p.url),
    stats: {
      days,
      max_altitude_m: (b as any).offering?.route?.max_altitude_m ?? null,
    },
    visible: true,
  });
  return slug;
}
