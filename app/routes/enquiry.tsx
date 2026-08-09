import { data, redirect } from "react-router";
import type { Route } from "./+types/enquiry";
import { getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { ENQUIRY_TTL_HOURS } from "~/lib/config";

// Action-only route: a trekker sends an enquiry from an offering page.
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const form = await request.formData();
  const offeringId = String(form.get("offering_id"));
  const guideId = String(form.get("guide_id"));
  const startDate = String(form.get("start_date"));
  const partySize = Number(form.get("party_size") ?? 1);
  const message = String(form.get("message") ?? "").trim() || null;

  if (!user) {
    // Send them to sign in, then back to the offering.
    const next = String(form.get("return_to") ?? "/");
    throw redirect(`/login?next=${encodeURIComponent(next)}`, { headers });
  }
  // Only trekkers send enquiries.
  const profile = await getProfile(env, user.id);
  if (profile?.role && profile.role !== "trekker") {
    return data({ error: "Only trekker accounts can book." }, { status: 403 });
  }

  const { createAdminClient } = await import("~/lib/supabase.server");
  const admin = createAdminClient(env);
  const { data: enq, error } = await admin
    .from("enquiries")
    .insert({
      trekker_id: user.id,
      guide_id: guideId,
      offering_id: offeringId,
      start_date: startDate,
      party_size: partySize,
      message,
      status: "open",
      expires_at: new Date(Date.now() + ENQUIRY_TTL_HOURS * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !enq) return data({ error: "Could not send your request." }, { status: 400 });
  return data({ ok: true, enquiryId: enq.id }, { headers });
}
