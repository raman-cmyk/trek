import type { Route } from "./+types/api.cron.$job";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getStripe } from "~/lib/stripe.server";
import { runEnquiryExpirySweep, runBalanceSweep, runMissedCheckinSweep } from "~/lib/booking.server";
import { runDocumentRetentionSweep } from "~/lib/documents.server";
import { releaseStaleReviews } from "~/lib/reviews.server";

/**
 * Cron sweeps (docs/02 §Edge functions). Wire these to Cloudflare Cron Triggers
 * (or Supabase pg_cron) in production, sending `x-cron-secret`. Locally, when
 * CRON_SECRET is unset, they run without the header for testing.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  if (env.CRON_SECRET && request.headers.get("x-cron-secret") !== env.CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const admin = createAdminClient(env);
  const today = new Date().toISOString().slice(0, 10);

  let result: unknown;
  switch (params.job) {
    case "enquiry-expiry":
      result = await runEnquiryExpirySweep(admin);
      break;
    case "balance-sweep":
      result = await runBalanceSweep(admin, getStripe(env), today);
      break;
    case "document-retention":
      result = await runDocumentRetentionSweep(admin, today);
      break;
    case "review-release":
      result = await releaseStaleReviews(admin, new Date().toISOString());
      break;
    case "missed-checkin": {
      const { data: ops } = await admin.from("users").select("id").eq("role", "ops").limit(1).maybeSingle();
      result = ops
        ? await runMissedCheckinSweep(admin, today, ops.id)
        : { alerts: 0, note: "no ops user" };
      break;
    }
    default:
      return new Response("unknown job", { status: 404 });
  }
  return new Response(JSON.stringify({ job: params.job, ...(result as object) }), {
    headers: { "Content-Type": "application/json" },
  });
}
