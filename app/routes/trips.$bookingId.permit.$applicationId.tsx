import type { Route } from "./+types/trips.$bookingId.permit.$applicationId";
import { redirect } from "react-router";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { signedPermitScanUrl } from "~/lib/documents.server";

/**
 * The trekker's own permit, as a short-lived link.
 *
 * Mirrors the passport route next door: the permit must belong to a booking
 * this trekker owns, the link expires, and the URL is never rendered or
 * logged. A permit carries a name and a passport number, so it is treated like
 * the other private documents rather than like a public file.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin } = await requireUser(request, env, "trekker");

  const { data: app } = await admin
    .from("permit_applications")
    .select("id, scan_path, booking:bookings(trekker_id)")
    .eq("id", params.applicationId)
    .eq("booking_id", params.bookingId)
    .maybeSingle();
  if (!app || (app as any).booking?.trekker_id !== user.id) {
    throw new Response("Not found", { status: 404 });
  }

  const url = await signedPermitScanUrl(admin, params.applicationId);
  if (!url) throw new Response("Unavailable", { status: 404 });
  return redirect(url);
}
