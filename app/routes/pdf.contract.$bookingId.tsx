import type { Route } from "./+types/pdf.contract.$bookingId";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { contractPdf, pdfResponse } from "~/lib/pdf.server";

// GET /pdf/contract/:bookingId — the signed Company↔Guide contract as a PDF.
// Readable by the booking's guide or ops (not the trekker).
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user } = await getSessionUser(request, env);
  if (!user) throw new Response("Sign in", { status: 401 });
  const admin = createAdminClient(env);

  const { data: b } = await admin
    .from("bookings")
    .select("id, guide_id")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });

  const profile = await getProfile(env, user.id);
  const allowed = b.guide_id === user.id || profile?.role === "ops";
  if (!allowed) throw new Response("Forbidden", { status: 403 });

  const { data: c } = await admin
    .from("contracts")
    .select("title, body_rendered")
    .eq("booking_id", b.id)
    .maybeSingle();
  if (!c) throw new Response("No contract for this booking", { status: 404 });

  const bytes = await contractPdf(c.title, c.body_rendered);
  return pdfResponse(bytes, `contract-${b.id.slice(0, 8)}.pdf`);
}
