import { redirect } from "react-router";
import type { Route } from "./+types/enquiry.resume";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { submitEnquiry } from "~/lib/enquiry.server";
import { clearedCookie, readParked } from "~/lib/pending-enquiry.server";

/**
 * Send the request they made before signing in.
 *
 * The login page redirects here, so this runs on a GET the moment a session
 * exists. It is deliberately a dead end — it always redirects — because the
 * only thing a reader should see is the outcome.
 *
 * The parked request is revalidated by submitEnquiry, not trusted: a trip that
 * changed its party limits while they were signing up fails here with the same
 * message a fresh POST would give.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, profile, headers } = await requireUser(request, env, "trekker");

  const parked = await readParked(env, request);
  const out = new Headers(headers);
  // Cleared whatever happens: a request that failed to replay must not be
  // waiting the next time they sign in.
  out.append("Set-Cookie", clearedCookie());

  if (!parked) {
    // Nothing waiting — they came here directly, or it expired.
    out.set("Location", "/trips");
    return new Response(null, { status: 302, headers: out });
  }

  const result = await submitEnquiry(env, createAdminClient(env), user.id, {
    offeringId: parked.offeringId,
    guideId: parked.guideId,
    startDate: parked.startDate,
    partySize: parked.partySize,
    message: parked.message,
    arrivalDate: parked.arrivalDate,
    selectedOptions: parked.selectedOptions,
  });

  if (!result.ok) {
    // The reason, and the way back to the trip they were looking at, rather
    // than a dead end that says "something went wrong".
    const q = new URLSearchParams({ sent: "0", why: result.error, back: parked.returnTo });
    out.set("Location", `/trips?${q}`);
    return new Response(null, { status: 302, headers: out });
  }

  out.set("Location", "/trips?sent=1");
  return new Response(null, { status: 302, headers: out });
}

// Never rendered: the loader always redirects.
export default function EnquiryResume() {
  return null;
}
