import type { Route } from "./+types/api.review-ask";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { tripToReview, type FinishedTrip } from "~/lib/review-prompt";

/**
 * Which finished trip this trekker still owes a review for, if any.
 *
 * A resource route rather than a field on the layout loader, and that is the
 * whole point of it. `_public.tsx` builds its `account` object on **every page
 * load for every signed-in person**, and the comment there already says so —
 * two more queries in that block to serve a prompt almost nobody sees is a tax
 * on the entire site. The popup asks for this itself, after mounting, and only
 * once it has checked it was not already waved away. Everyone else pays
 * nothing.
 *
 * Returns `{ trip: null }` rather than an error for anyone who should not see
 * a prompt — a guide, the office, a signed-out visitor. The popup does not
 * need to know why, and a 403 would put a red line in a console for a
 * non-event.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const none = Response.json({ trip: null });

  const { user, headers } = await getSessionUser(request, env);
  if (!user) return none;

  const admin = createAdminClient(env);
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  // Guides review their trekkers from their own dashboard; this is the other
  // side of that form.
  if (profile?.role !== "trekker") return none;

  const [{ data: done }, { data: written }] = await Promise.all([
    admin
      .from("bookings")
      .select("id, end_date, offering:offerings(title), guide:guides!bookings_guide_id_fkey(users(full_name))")
      .eq("trekker_id", user.id)
      .eq("status", "completed")
      .order("end_date", { ascending: false })
      .limit(10),
    admin
      .from("reviews")
      .select("booking_id")
      .eq("author_id", user.id)
      .eq("direction", "trekker_to_guide"),
  ]);

  const already = new Set((written ?? []).map((r: { booking_id: string }) => r.booking_id));
  const trips: FinishedTrip[] = (done ?? [])
    .filter((b: any) => !already.has(b.id))
    .map((b: any) => ({
      bookingId: b.id,
      title: b.offering?.title ?? "your trip",
      guideFirstName: (b.guide?.users?.full_name ?? "Your guide").split(" ")[0],
      endDate: b.end_date ?? null,
    }));

  // Dismissals live in the browser, so the client sends back what it has
  // already been asked about.
  const dismissed = new URL(request.url).searchParams.getAll("skip");
  const today = new Date().toISOString().slice(0, 10);
  return Response.json({ trip: tripToReview(trips, dismissed, today) }, { headers });
}
