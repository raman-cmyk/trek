import type { SupabaseClient } from "@supabase/supabase-js";
import { ENQUIRY_TTL_HOURS } from "~/lib/config";
import { arrivalError, parseArrival } from "~/lib/arrival";
import { fmtDate } from "~/lib/format";
import type { PendingEnquiry } from "~/lib/pending-enquiry";

/**
 * Creating a request to book, in one place.
 *
 * There are two ways in now — a POST from the trip page, and a replay after
 * the sign-in that POST needed — and they must be the same code. A replayed
 * request is not more trusted than a fresh one: it runs this validation too,
 * so a trip that sold out or a party size that no longer fits is caught on the
 * way back rather than written to the database.
 */
export type EnquiryFields = Omit<PendingEnquiry, "at" | "returnTo">;

export type SubmitResult =
  | { ok: true; enquiryId: string; offeringTitle: string }
  | { ok: false; error: string; status: number };

export async function submitEnquiry(
  env: Env,
  admin: SupabaseClient,
  trekkerId: string,
  f: EnquiryFields,
): Promise<SubmitResult> {
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate) || f.startDate <= today) {
    return { ok: false, error: "Pick a date in the future.", status: 400 };
  }

  const { data: off } = await admin
    .from("offerings")
    .select("id, title, guide_id, min_party, max_party")
    .eq("id", f.offeringId)
    .maybeSingle();
  if (!off || off.guide_id !== f.guideId) {
    return { ok: false, error: "That trip isn't available.", status: 400 };
  }

  const minP = off.min_party ?? 1;
  const maxP = off.max_party ?? 12;
  if (!Number.isFinite(f.partySize) || f.partySize < minP || f.partySize > maxP) {
    return {
      ok: false,
      error: `Group size must be between ${minP} and ${maxP} for this trip.`,
      status: 400,
    };
  }

  // When they land in Kathmandu. Optional, but checked when given: a date
  // after the start is a typo somebody would otherwise find at the airport.
  const arrival = parseArrival(f.arrivalDate, f.startDate);
  if (arrival.problem) {
    return {
      ok: false,
      error: arrivalError(arrival.problem, f.startDate, fmtDate),
      status: 400,
    };
  }

  const { data: enq, error } = await admin
    .from("enquiries")
    .insert({
      trekker_id: trekkerId,
      guide_id: f.guideId,
      offering_id: f.offeringId,
      start_date: f.startDate,
      party_size: f.partySize,
      arrival_date: arrival.date,
      message: f.message,
      selected_options: f.selectedOptions,
      status: "open",
      expires_at: new Date(Date.now() + ENQUIRY_TTL_HOURS * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !enq) {
    return { ok: false, error: "Could not send your request.", status: 400 };
  }

  // The guide hears about it immediately — SMS, and the bell, because many
  // guides have no email and the SMS token is not always configured.
  const { notifyNewEnquiry } = await import("~/lib/notifications.server");
  await notifyNewEnquiry(env, admin, {
    guideId: f.guideId,
    offeringTitle: off.title,
    startDate: f.startDate,
    partySize: f.partySize,
  });

  return { ok: true, enquiryId: enq.id, offeringTitle: off.title };
}
