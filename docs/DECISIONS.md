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

## 2026-08-10 (M9 security pass)

- **RLS is verified by an executable audit, not by reading policies.**
  `scripts/rls-audit.mjs` connects as anon and asserts deny-reads / allow-views /
  no-private-columns / published-only / deny-writes. It gates releases (exits
  non-zero) and already caught three real defects. Kept as a script (not a Vitest
  test) so `npm test` stays hermetic and Docker-free; run it against a live stack.
- **Verification checks in RLS policies must not depend on the querying role's
  own RLS.** A policy that did `EXISTS (select 1 from guides …)` silently failed
  for anon because `guides` denies anon. Rule going forward: gate cross-table
  policy checks through a `security definer` helper (`is_verified_guide`,
  `is_ops`), never a bare subquery over an RLS-protected table.
- **Public review exposure is view-only.** Anon reads published reviews solely
  through the security-definer `public_reviews` view; the base `reviews` table is
  author/subject/ops only. One projection to maintain, no accidental column leak.
- **Webhook signatures are verified with Web Crypto, not the Stripe SDK.** Keeps
  the no-Node-SDK, Workers-friendly stance; HMAC + constant-time compare +
  timestamp tolerance is the whole contract and is unit-tested with an injected
  clock.

## only_with_me is published unedited (2026-08-11)

Guides write their own `only_with_me` line and it goes live with no ops
review and no copy pass. The action validates length and nothing else.

The obvious objection is quality control — some lines will be weak, and some
will have imperfect English. Accepted deliberately: the entire positioning is
"you are booking a person, not an agency", and second-language English from a
named guide is the strongest available evidence that this is true. A queue
between a guide and their own sentence would also break rule 8 (max two taps)
and would, in practice, mean the founder rewriting 48 sentences into one
voice — which is exactly the agency product we are replacing.

If abuse appears, the answer is a report path and ops takedown, not
pre-moderation.

## Map geometry lives in code, not PostGIS (2026-08-11)

`app/lib/geo.ts` holds district centroids and simplified route lines as
constants. They are approximate by design (a pin means "works out of
Solukhumbu", not "lives here"), they change roughly never, and shipping them
in the bundle means the homepage map renders without a round trip.

Real GPX tracks — actual trekked lines pulled off recaps — are a different
thing and would belong in the database. Basemap is OpenStreetMap raster;
swapping in Baato when the founder has a key is one line in `GuideMap.tsx`.

## Journals are written after the trek, not during it (2026-08-12)

Founder: guides cannot edit while they are on the trail — they write the trek
up once they are back and on wifi.

So the journal editor assumes a connected browser. No offline drafts, no
service-worker queue, no sync-conflict resolution, no autosave against a lost
signal. That is a large amount of work this product does not need, and the
"Save day" button flagged as missing autosave is not a gap.

What the flow does imply: the write-up happens in one long sitting, not in
fourteen two-minute sessions on a ridge. The editor should be built for
somebody working down a list of days at a desk — which is a much easier
target than the one we were designing against.

## First names only, everywhere in the app (2026-08-12)

Founder's rule: no guide's and no trekker's family name appears in the app,
ever. In Nepal a surname is an ethnicity — Sherpa, Tamang, Gurung, Thapa —
and a marketplace that prints it on every card invites people to choose a
guide by caste. A trekker's surname is simply nobody's business.

Enforced in the public views (migration 0042), so a public surface cannot
leak a surname even by accident; signed-in surfaces that read base tables
use firstName() from app/lib/names.ts.

Deliberate exceptions, because they are legal documents rather than UI: the
ops console, contracts, TIMS cards and permit applications keep full legal
names. Guide profile URLs keep their existing slugs (changing them would
break every link and ranking the pages have). Person JSON-LD now carries the
first name only — accepted cost: "Pemba Sherpa" as a search phrase will not
match the structured data, but the rule outranks the ranking.
