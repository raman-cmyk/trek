import type { Route } from "./+types/api.cron.$job";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getStripe } from "~/lib/stripe.server";
import { runEnquiryExpirySweep, runBalanceSweep, runMissedCheckinSweep } from "~/lib/booking.server";
import { runDocumentRetentionSweep } from "~/lib/documents.server";
import { releaseStaleReviews } from "~/lib/reviews.server";

/**
 * Cron sweeps (docs/02 §Edge functions). Invoked by the worker's scheduled()
 * handler (Cloudflare Cron Triggers) with `x-cron-secret`. Fails closed:
 * without a configured CRON_SECRET nothing runs — set it in .dev.vars locally.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  // Fail CLOSED: these endpoints delete documents and charge cards. No secret
  // configured means no access — never open.
  if (!env.CRON_SECRET || request.headers.get("x-cron-secret") !== env.CRON_SECRET) {
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
      result = await runBalanceSweep(admin, getStripe(env), today, env);
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
