// Augments the wrangler-generated `Env` (worker-configuration.d.ts) with the
// vars we read from .dev.vars locally and Cloudflare secrets in production.
// Kept separate so it survives `wrangler types` regeneration.
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SITE_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  RESEND_API_KEY?: string;
  SPARROW_SMS_TOKEN?: string;
  POSTHOG_KEY?: string;
  CRON_SECRET?: string;
}
