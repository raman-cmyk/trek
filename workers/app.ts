import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// Every sweep the app defines — the daily cron hits each one in order.
const CRON_JOBS = [
  "enquiry-expiry",
  "balance-sweep",
  "document-retention",
  "review-release",
  "missed-checkin",
];

export default {
  fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },

  // Cloudflare Cron Trigger → self-fetch each cron route with the secret.
  // Without this handler the sweeps are dead code: no instalment charges, no
  // balance sweep, no document retention, no review release (audit B4).
  async scheduled(_event, env, ctx) {
    const secret = (env as { CRON_SECRET?: string }).CRON_SECRET;
    if (!secret) return; // fail closed, same as the route
    const run = async () => {
      for (const job of CRON_JOBS) {
        try {
          const req = new Request(`https://cron.internal/api/cron/${job}`, {
            method: "POST",
            headers: { "x-cron-secret": secret },
          });
          const context = new RouterContextProvider();
          context.set(cloudflareContext, { env, ctx });
          await requestHandler(req, context);
        } catch {
          // one failed sweep must not stop the rest
        }
      }
    };
    ctx.waitUntil(run());
  },
} satisfies ExportedHandler<Env>;
