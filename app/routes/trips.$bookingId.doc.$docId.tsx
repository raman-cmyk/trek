import type { Route } from "./+types/trips.$bookingId.doc.$docId";
import { redirect } from "react-router";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { signedDocumentUrl } from "~/lib/documents.server";

// Redirects to a short-lived signed URL for the trekker's own document, logging
// the access. Never renders or logs the URL itself.
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin } = await requireUser(request, env, "trekker");
  // Authorise: the document must belong to a booking this trekker owns.
  const { data: doc } = await admin
    .from("booking_documents")
    .select("id, booking:bookings(trekker_id)")
    .eq("id", params.docId)
    .eq("booking_id", params.bookingId)
    .maybeSingle();
  if (!doc || (doc as any).booking?.trekker_id !== user.id) {
    throw new Response("Not found", { status: 404 });
  }
  const url = await signedDocumentUrl(admin, params.docId, user.id);
  if (!url) throw new Response("Unavailable", { status: 404 });
  return redirect(url);
}
