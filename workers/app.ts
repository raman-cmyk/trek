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

/**
 * Cache public pages in the Worker itself.
 *
 * The routes set `Cache-Control: public, …`, but on workers.dev there is no
 * CDN cache in front of the Worker, so that header only ever reached the
 * visitor's own browser and every fresh visitor re-rendered the page. The
 * homepage runs six-plus queries and emits ~287KB, which is how it came to
 * exceed its CPU budget and return Error 1102.
 *
 * Two conditions, both required, so this can never serve a personalised page
 * to the wrong person:
 *   - the request is a plain GET carrying no session cookie, and
 *   - the response came back marked `public` (routes mark a signed-in
 *     document `private, no-store` via publicCacheHeaders).
 */
function isCacheableRequest(request: Request): boolean {
  if (request.method !== "GET") return false;
  const cookie = request.headers.get("cookie") ?? "";
  // Supabase session cookies are sb-<ref>-auth-token; anything auth-shaped
  // means this visitor has a header of their own and must not be served a
  // stored copy.
  if (/(^|;\s*)sb-[^=]*auth-token/i.test(cookie)) return false;
  return true;
}

export default {
  async fetch(request, env, ctx) {
    // `caches.default` is Workers-only and absent from the DOM CacheStorage type.
    const cache = (caches as unknown as { default: Cache }).default;
    const cacheable = isCacheableRequest(request);

    if (cacheable) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    const response = await requestHandler(request, context);

    if (
      cacheable &&
      response.status === 200 &&
      /(^|,)\s*public\b/.test(response.headers.get("cache-control") ?? "") &&
      !response.headers.has("set-cookie")
    ) {
      const stored = new Response(response.body, response);
      stored.headers.set("x-worker-cache", "MISS");
      ctx.waitUntil(cache.put(request, stored.clone()));
      return stored;
    }
    return response;
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
