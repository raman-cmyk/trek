import type { Route } from "./+types/pdf.tims.$bookingId";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { timsCardPdf, pdfResponse } from "~/lib/pdf.server";

// GET /pdf/tims/:bookingId — the blue TIMS card as a PDF.
// Readable by the booking's trekker, its guide, or ops.
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user } = await getSessionUser(request, env);
  if (!user) throw new Response("Sign in", { status: 401 });
  const admin = createAdminClient(env);

  const { data: b } = await admin
    .from("bookings")
    .select("id, trekker_id, guide_id")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });

  const profile = await getProfile(env, user.id);
  const allowed = b.trekker_id === user.id || b.guide_id === user.id || profile?.role === "ops";
  if (!allowed) throw new Response("Forbidden", { status: 403 });

  const { data: t } = await admin
    .from("tims_cards")
    .select(
      "card_no, trekker_name, nationality, guide_name, guide_licence_no, route_name, region, entry_point, start_date, end_date, party_size, issued_at, status",
    )
    .eq("booking_id", b.id)
    .maybeSingle();
  if (!t) throw new Response("No TIMS card issued yet", { status: 404 });

  const bytes = await timsCardPdf(t as any);
  return pdfResponse(bytes, `TIMS-${t.card_no}.pdf`);
}
