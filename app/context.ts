import { createContext } from "react-router";

/**
 * Typed load-context key for Cloudflare bindings (React Router v8 pattern).
 *
 * Loaders/actions read it with `context.get(cloudflareContext)` to reach
 * `env` (Supabase keys, Stripe keys, etc.) and the request `ctx`. The worker
 * entry populates it per request in workers/app.ts.
 */
export const cloudflareContext = createContext<{
  env: Env;
  ctx: ExecutionContext;
}>();
