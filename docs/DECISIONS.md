# Decisions log

Judgment calls made without blocking the founder (per CLAUDE.md working
agreement). Newest first.

---

## 2026-08-09

- **React Router v8, not v7.** The docs specify "React Router v7, framework
  mode." `react-router@latest` is now **8.x** — the direct continuation of the
  v7 framework-mode line, and the version all current tooling/templates target.
  Pinning the superseded v7 would fight the ecosystem. Adopted v8; the stack
  intent (Vite-based, SSR, Cloudflare) is unchanged. Notable v8 API shift wired
  in: the load context is a typed `RouterContextProvider` (see `app/context.ts`)
  instead of the v7 `AppLoadContext` module augmentation.

- **Package manager: npm.** Matches the React Router Cloudflare template default
  and keeps CI simple. (pnpm is available but not adopted.)

- **Test runner: Vitest**, with a dedicated `vitest.config.ts` that omits the
  React Router / Cloudflare Vite plugins so pure `app/lib` unit tests
  (pricing, policy, mask) run without the framework loading.

- **Fonts self-hosted** via `@fontsource-variable/*` rather than Google Fonts
  CDN — avoids a runtime external request (CSP/Cloudflare-friendly, faster LCP).

- **`worker-configuration.d.ts` is gitignored and regenerated.** It's a 549KB
  generated file that tracks the wrangler/compat-date. `npm run typecheck` runs
  `wrangler types` first so local and CI always have fresh Cloudflare types.

- **Tailwind v4 duration utilities.** Named durations are registered under the
  `--transition-duration-*` theme namespace (aliasing the canonical
  `--duration-*` tokens) so `duration-quick` / `duration-base` utilities resolve;
  v4 has no `--duration-*` → `duration-*` mapping.

- **Scope of this session: M0 + M1 only.** Both are pure-code and need no
  founder browser tasks. M2+ begins to require live Supabase/Stripe/Cloudflare
  credentials, so stopping at a green, demoable M0+M1 is the correct first slice.

## 2026-08-09 (M2)

- **Ops auth = Supabase email+password** (not magic-link/OTP). M2 only needs a
  role gate; full trekker/guide auth is M4. Email+password is the simplest thing
  that's verifiable headlessly. `@supabase/ssr` handles cookie sessions; a
  service-role admin client does the privileged ops reads/writes.

- **Adopted Supabase's grant model (`0010_grants.sql`).** Roles hold broad table
  privileges and RLS is the only gate — matching how Supabase cloud is
  configured — so `service_role` (and `authenticated`/`anon`) behave locally
  exactly as in production. Our tables are RLS-enabled default-deny, so this
  doesn't widen exposure.

- **Guard triggers allow `service_role`/`postgres`.** The column-guard and
  publish-guard triggers key off `is_ops()` (which needs `auth.uid()`); the ops
  console writes as the service role, so the guards now also pass privileged DB
  roles. End-user (authenticated) guides are still fully guarded.

- **Local verification stack is partial by necessity.** The sandbox can't run
  the full `supabase start` (an rlimit restriction kills analytics/edge-runtime),
  so we run db+kong+rest+auth via `supabase start -x …`. That covers everything
  M2 needs. The `@supabase/pg-delta` TLS warning during `db reset` is non-fatal
  (migration-catalog caching only) — migrations and seed apply fine.

## 2026-08-09 (M4)

- **Email OTP (6-digit code), not magic-link redirect, for trekkers.** Same
  friction class, but stateless to verify (no PKCE code-exchange callback),
  Workers-friendly, and testable headlessly. The spec said "magic link"; OTP is
  the simpler equivalent and can switch later. Guides use phone OTP (spec).
- **The guide application creates the auth user up front** (phone-keyed, via the
  admin API) so the applicant has an identity to sign in with later and ops has a
  real row to verify. The guides insert is rolled back (auth user deleted) on
  failure so a phone can retry.
- **Guide photos/bio stay ops-authored** (per docs/01) — the application collects
  facts (licence, rate, languages, hook line), not media; ops adds photos/bio to
  keep the quality bar. Photo upload is therefore not in the application form.

## 2026-08-09 (M5)

- **Guide dashboard verified via an injected `@supabase/ssr` session**, not a
  real phone-OTP login, because phone OTP needs an SMS provider enabled
  (`GOTRUE_EXTERNAL_PHONE_ENABLED`), which requires committing dev-only SMS
  config. Rather than pollute `config.toml`, the test signs Pemba in through the
  same `@supabase/ssr` client the app uses (email+password set via admin) and
  injects the resulting cookies — a library-accurate session. Real guide login
  works once the founder enables an SMS provider.
- **Bottom tab bar for the guide app** (Home/Enquiries/Trips/Calendar/Earnings)
  — native-feeling on the cheap Android phones guides use; Profile is reached
  from Home to keep the bar to five items.
- **Guide-editable fields limited to rate + payout** in `/g/profile`; bio/photos
  stay ops-authored (docs/01), surfaced as a change-request. Enforced by the
  action whitelist + the `guard_guide_columns` trigger.

## 2026-08-09 (M6)

- **Stripe behind an interface with a mock default.** No `STRIPE_SECRET_KEY` →
  `MockStripe` (deterministic fake intents, auto-succeed) so the whole booking→
  payment flow is buildable/testable now; real keys switch to `RealStripe`
  (Stripe REST via fetch — the Node SDK doesn't run on Workers) with identical
  fulfillment. Real webhook-signature verification is stubbed until keys land.
- **Booking is created at guide-accept, not at payment.** Accept snapshots the
  quote into a `pending_deposit` booking and holds the calendar (24h TTL), so
  ops sees the pipeline immediately and the trekker checks out against a fixed
  price. Deposit fulfillment flips it to `deposit_paid` + books the days.
- **`fulfillDeposit` is idempotent two ways:** dedupe by PaymentIntent AND a
  "only from `pending_deposit`" status guard, so a duplicate/stray webhook
  (even with a different PI) never double-records a deposit.
- **Crons are HTTP endpoints, not Supabase edge functions.** Hosting is
  Cloudflare Workers, so Cron Triggers hitting `/api/cron/:job` (secret-gated)
  is the natural fit; the sweep logic lives in `booking.server.ts` and is unit-
  testable.

## 2026-08-09 (M7)

- **Documents are server-mediated, not client-RLS.** The `documents` bucket has
  NO storage policies (service-role only); uploads and views go through server
  actions that check ownership, and views return a short-lived signed URL whose
  access is logged. Simpler and stricter than per-object RLS, and it guarantees
  URLs are never logged.
- **Permit applications auto-create via a DB trigger** on the `→ confirmed`
  transition (not app code), so they appear no matter which path confirms a
  booking (ops doc-verify, or a future flow).
- **Unlocks are pure functions of (start_date, now)** — no scheduled state — so
  the brief (T-7) and guide phone (T-48h) are correct without a cron and are
  trivially unit-tested by varying `now`.
- **Local stack now includes storage-api + imgproxy.** They start fine in the
  sandbox with `--ignore-health-check`; a fresh clone's `supabase start`
  includes them by default. (The `-x` exclusions are only this sandbox's
  workaround for the analytics/vector rlimit crash.)

## 2026-08-09 (M8)

- **Double-blind release is a pure function of the booking's review set + now**
  (`reviewsToRelease`), applied both on submit (`releaseForBooking`) and by a
  daily cron (`releaseStaleReviews`). No scheduled per-review state; the 14-day
  boundary is "≥ 14 days elapsed" (release on day 15+ / exactly 14, not day 13).
- **Messaging is one thread per booking, server-mediated.** Masking happens at
  write time: we store the raw `body` plus a `body_rendered` (masked pre-deposit)
  and the loader shows `body_rendered` while `status = pending_deposit`, the raw
  `body` after. Ops never needs to re-mask; the flag is computed once.
- **OG images embed the font in the bundle** (`og-font.ts`, base64 Liberation
  Sans) rather than fetching one at render. Cloudflare Workers have no
  filesystem and outbound fetch at render is a latency/CSP risk; a ~550KB module
  constant is the reliable trade. Rendered via `workers-og` (satori + resvg wasm).
- **Trekker review photos are untrusted** → inserted as `offering_photos` with
  `source='trekker', approved=false` and surfaced only after ops approval
  (`/ops/moderation`). Recaps only ever show `approved=true` photos.
