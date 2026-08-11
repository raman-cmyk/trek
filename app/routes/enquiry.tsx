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

  // Server-side validation (audit: previously zero — garbage enquiries from
  // stale/crafted POSTs). Date must exist and be in the future; party must fit
  // the offering's real bounds; the offering must belong to the guide.
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate <= today) {
    return data({ error: "Pick a date in the future." }, { status: 400, headers });
  }
  const { data: off } = await admin
    .from("offerings")
    .select("id, title, guide_id, min_party, max_party")
    .eq("id", offeringId)
    .maybeSingle();
  if (!off || off.guide_id !== guideId) {
    return data({ error: "That trip isn't available." }, { status: 400, headers });
  }
  const minP = off.min_party ?? 1;
  const maxP = off.max_party ?? 12;
  if (!Number.isFinite(partySize) || partySize < minP || partySize > maxP) {
    return data(
      { error: `Group size must be between ${minP} and ${maxP} for this trip.` },
      { status: 400, headers },
    );
  }

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
  if (error || !enq) return data({ error: "Could not send your request." }, { status: 400, headers });

  // The guide hears about it immediately (SMS — many guides have no email).
  const { notifyNewEnquiry } = await import("~/lib/notifications.server");
  await notifyNewEnquiry(env, admin, {
    guideId,
    offeringTitle: off.title,
    startDate,
    partySize,
  });
  return data({ ok: true, enquiryId: enq.id }, { headers });
}
