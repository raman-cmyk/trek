import { data, redirect } from "react-router";
import type { Route } from "./+types/enquiry";
import { getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { ENQUIRY_TTL_HOURS } from "~/lib/config";
import { askOutcome, isUniqueViolation, LIVE_ASK_STATUSES } from "~/lib/ask-guard";

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
  // The optional lines they ticked on the offering page. Parsed defensively —
  // it arrives as JSON in a form field — and capped, because it is a list of
  // ids, not an essay.
  let selectedOptions: string[] = [];
  try {
    const raw = JSON.parse(String(form.get("selected_options") ?? "[]"));
    if (Array.isArray(raw)) {
      selectedOptions = raw
        .filter((v) => typeof v === "string")
        .map((v: string) => v.slice(0, 60))
        .slice(0, 20);
    }
  } catch {
    // A malformed list is not a reason to lose the enquiry.
  }

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

  // The same trip, the same date, asked twice. A trekker may absolutely have
  // several requests open with one guide — different trips, different dates —
  // but sending the identical one again is a double-tap or an impatient
  // refresh, and it should not put two rows in a guide's list.
  //
  // Both halves are checked. Looking only at live REQUESTS was the hole that
  // shipped on 2026-09-07: once the guide accepted, the identical ask walked
  // straight past it and made a second booking for a fortnight already
  // committed. A cancelled booking is not in the way of anything.
  const [{ data: twin }, { data: booked }] = await Promise.all([
    admin
      .from("enquiries")
      .select("id")
      .eq("trekker_id", user.id)
      .eq("guide_id", guideId)
      .eq("offering_id", offeringId)
      .eq("start_date", startDate)
      .in("status", [...LIVE_ASK_STATUSES])
      .maybeSingle(),
    admin
      .from("bookings")
      .select("id, status")
      .eq("trekker_id", user.id)
      .eq("offering_id", offeringId)
      .eq("start_date", startDate)
      .not("status", "like", "cancelled%")
      .maybeSingle(),
  ]);

  const outcome = askOutcome({
    liveEnquiryId: twin?.id ?? null,
    bookingStatus: booked?.status ?? null,
  });
  if (outcome === "already-booked") {
    return data({ ok: true, bookingId: booked!.id, booked: true }, { headers });
  }
  if (outcome === "already-asked") {
    return data({ ok: true, enquiryId: twin!.id, already: true }, { headers });
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
      selected_options: selectedOptions,
      status: "open",
      expires_at: new Date(Date.now() + ENQUIRY_TTL_HOURS * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !enq) {
    // 0072's index caught a double-tap: two requests in flight at once, both
    // finding nothing, both inserting. The loser is not an error — it is the
    // same "you already asked" the check above would have given a moment later.
    if (isUniqueViolation(error)) {
      const { data: won } = await admin
        .from("enquiries")
        .select("id")
        .eq("trekker_id", user.id)
        .eq("offering_id", offeringId)
        .eq("start_date", startDate)
        .in("status", [...LIVE_ASK_STATUSES])
        .maybeSingle();
      if (won) return data({ ok: true, enquiryId: won.id, already: true }, { headers });
    }
    return data({ error: "Could not send your request." }, { status: 400, headers });
  }

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
