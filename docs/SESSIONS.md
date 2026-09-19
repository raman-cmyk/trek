# Sessions log

One entry per Claude Code session: date, milestone, what shipped, what's next,
and any 🙋 founder browser tasks still pending.

---

## 2026-08-09 — M0 (scaffold + motion foundation) & M1 (schema + seed)

**Shipped — M0**

- React Router **v8** framework mode (SSR), Cloudflare Workers target, TypeScript
  strict, Tailwind **v4** (CSS-first tokens). Self-hosted Fraunces + Inter fonts
  (no runtime CDN). See `docs/DECISIONS.md` for the v7→v8 note.
- Design tokens (earthy Himalayan palette, radii, shadows) + motion tokens
  (easing, durations, keyframes) in `app/app.css`; JS-readable mirror +
  `usePrefersReducedMotion` / `useIsMobile` in `app/lib/motion.ts`.
- Motion/feel primitives (per `docs/06` §14, built FIRST):
  - `app/components/skeletons/` — shimmer base + Guide/Offering/GuideProfile/
    OfferingDetail/Review/Trip/Enquiry card skeletons + staggered grid loader.
  - `app/components/SmartImage.tsx` — blur-up from average colour, explicit
    dimensions, lazy/eager.
  - `app/components/Sheet.tsx` — ONE primitive: draggable bottom sheet (mobile) /
    centered modal (desktop), focus trap, Esc/backdrop close, reduced-motion aware.
  - `app/components/Button.tsx` — press / hover / loading (fixed width, spinner→
    checkmark) / disabled.
  - `prefers-reduced-motion` honored across all of them.
- Scratch demo route `/_dev/primitives` (noindex) exercising every primitive.
- CI (`.github/workflows/ci.yml`): typecheck + unit tests + build on push/PR.
- Verified: `npm run build` green, `npm run typecheck` clean, SSR renders complete
  HTML with JS disabled on `/` and `/_dev/primitives`; desktop + mobile-sheet
  screenshots captured.

**Shipped — M1**

- Migrations `0001`–`0009` (`/supabase/migrations`), split by domain, derived
  from `docs/03-database-schema.sql`: identity, catalog, transaction, group
  departures, safety, social, content/SEO, indexes, public views.
- **RLS default-deny on every table** (26/26) with helper functions
  `auth_role()` / `is_ops()` (SECURITY DEFINER, no policy recursion) and
  column-guard triggers (guides can't self-verify/promote; publishing an
  offering is ops-gated).
- **Public-safe views** `public_guides` / `public_offerings` (security-definer,
  safe columns only — no phone/payout/full licence) granted to `anon`.
- `seed.sql`: 12 verified guides (varied tiers/languages/districts/day-rates),
  6 routes with real permit data (EBC, Annapurna Circuit, Langtang, Manaslu,
  Gokyo, Mardi Himal), 20 offerings (8 treks + 12 experiences), languages,
  photos, 120-day availability spread, 10 completed bookings backing 10
  published reviews.
- `app/lib/pricing.ts` (fee math, single source of truth), `policy.ts`
  (cancellation matrix + strike ladder), `mask.ts` (contact masking + flag),
  `copy.ts` (keyed strings) + **39 Vitest tests** (incl. the doc's "$306 of
  $360" and every cancellation-matrix row).
- Verified end-to-end on a local Postgres 16: clean apply of all migrations +
  seed; row counts match spec; as `anon`, the public views + routes/permits/
  published-reviews are readable while guides/users/payouts/booking_documents
  return **zero rows** (no PII/payout/passport leak).

**🙋 Founder browser tasks still pending (needed for M2+ / deploy, NOT M0/M1):**

1. Pick a name + .com + Instagram handle (working codename stays `trek`).
2. Create the Supabase cloud project → `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Create the Cloudflare Workers project (for deploy).
4. Stripe account (test mode) → `STRIPE_*` keys (M6).
5. Resend + Sparrow SMS + PostHog accounts (M7-M9).
6. Populate `.dev.vars` from `.dev.vars.example` and set Cloudflare/GitHub secrets.

**Next:** M2 — Ops admin core (needs the Supabase cloud project + auth providers).

---

## 2026-08-09 — M2 (ops admin core)

**Shipped**

- Ops role gate + `/ops` layout (sidebar with live badge counts, sign-out).
  Auth via Supabase email+password (`@supabase/ssr` cookie sessions); privileged
  reads/writes via a service-role admin client (`app/lib/supabase.server.ts`).
- **Verification queue** (`/ops/verifications`): applied/in-review guides with
  per-check progress; detail page with pass/fail per check, tier assignment,
  approve→verified and reject.
- **Booking pipeline** (`/ops/pipeline`): kanban across the 6 happy-path
  statuses with a one-click status-advance (stamps deposit/balance/completion
  timestamps).
- **Permit tracker** (`/ops/permits`): applications sorted by start-date
  proximity with inline status advance + reference number.
- **Payout ledger** (`/ops/payouts`): payable rows (NPR) with batch-select →
  mark-batch-paid (batch ref, paid_at, paid_by) + paid history.
- **Incident log** (`/ops/incidents`): list with monitor/close + create form.
- Migration `0010_grants.sql` mirrors Supabase's role privileges (RLS remains
  the gate) so `service_role` works locally like production; guard triggers
  now also allow `service_role`/`postgres` so ops writes aren't blocked.
- Seed extended: 2 applicant guides + verification checklists, bookings across
  every pipeline status, permit applications, payable payouts, one incident; the
  seed now sets the GoTrue token columns and a dev ops password
  (`ops@example.com` / `opsdevpass123`) so a fresh `db reset` is login-ready.

**Verified (real local Supabase, Docker up):** `supabase start` (minimal stack:
db+kong+rest+auth) + `db reset`; Playwright drove login → verify a guide (pass a
check, set tier 2, approve→verified, now live in `public_guides`=13) → advance a
booking out of `pending_deposit`. Build + typecheck + 39 unit tests green.

**🙋 Founder, to run this yourself:** create the Supabase project, then in
Supabase Auth create an ops user (or set a password on `ops@example.com`) and
ensure its `public.users.role = 'ops'`. Locally it already works via the seed.

**Next:** M3 — public site (SSR + SEO): home, guide directory, profiles,
offering pages, route landing pages, consuming the M0 primitives.

---

## 2026-08-09 — M3 (public site, SSR + SEO)

**Shipped**

- Public shell (`_public` layout: Header + Footer) reading a public **anon**
  Supabase client (RLS-safe) — `createPublicClient`.
- **Home** — all 8 sections, seed-powered: hero, guide scroller, category-tabbed
  offering grid (signature overlapping GuideChips), trust strip, "on the trail"
  strip, how-it-works, reviews, footer.
- **Guide directory** `/guides` — SSR with shareable URL-param filters (tier,
  language, district, sort), live-updating via a GET form (works with JS off).
- **Guide profile** `/guides/:slug` — photo carousel, bio, stats, "what we
  checked" expander, offerings, read-only availability calendar, reviews, sticky
  mobile bar; **Person + AggregateRating + Breadcrumb JSON-LD**.
- **Offering detail** `/treks/:slug` + `/experiences/:slug` (shared, split into
  a `.server` loader + client view) — carousel, above-the-fold guide block, live
  `PriceBreakdown`, itinerary, included/excluded, reviews, and the **sticky
  booking widget (desktop) / bottom-bar + draggable sheet (mobile)** with live
  pricing; **Product/Offer + Breadcrumb JSON-LD**.
- **Route landing pages** `/routes/:slug` — markdown content
  (`/content/routes/*.md`, EBC + Annapurna written), TOC, live permit/cost table,
  guides-who-lead chips, trips grid, FAQ accordion; **TouristTrip + FAQPage +
  Breadcrumb JSON-LD**.
- **Transparency** + **Safety** content pages.
- `sitemap.xml` (DB-generated, cached 1h) + `robots.txt` (disallows /ops, /_dev)
  + redirects table wired via the `*` catch-all (301 → else 404).
- New public views/policies: `public_reviews` (0011), verified-guide photo read
  (0012), guide day-rate added to `public_offerings` (0009). Shared cards/bits
  (GuideCard, OfferingCard, GuideChip, TierBadge, Stars, PriceBreakdown,
  ReviewBlock), Carousel, BookingWidget, AvailabilityCalendar — all consuming the
  M0 primitives (SmartImage blur-up, Sheet, Button) and prefetch-on-intent.

**Verified (real local Supabase):** every public page returns complete SSR HTML
with content + JSON-LD (JS-disabled), sitemap lists guide/offering/route URLs,
unknown paths 404. Live pricing on the booking widget matches `pricing.ts`
(EBC 14d/1p = $743.40). Build + typecheck + 39 unit tests green. Desktop +
mobile (bottom-bar/sheet) screenshots captured.

**Deferred (noted in BACKLOG/DECISIONS):** MapLibre meeting-point mini-map
(shown as text for now); the real "on the trail now" check-in feed is M8 (M3
uses approved trekker photos as a seasonal teaser). Full-screen photo viewer and
expanding-search animation are polish items.

**Next:** M4 — auth (trekker magic-link, guide phone OTP) + guide application
form → the verification queue ops already has.

---

## 2026-08-09 — M4 (auth + guide application)

**Shipped**

- Auth server helpers (`app/lib/auth.server.ts`): `getSessionUser`, `requireUser`
  (role-gated), `getProfile`, `ensureTrekkerProfile`.
- **Trekker auth** `/login` — email OTP (send code → verify), creates the
  public.users trekker profile on first sign-in.
- **Guide auth** `/g/login` — phone OTP (send → verify), gated to guide-role
  accounts; links to /apply for new guides.
- **Guide application** `/apply` — public, autosaves to localStorage; on submit
  creates the auth user (phone-keyed), public.users (role guide), guides
  (status=applied), guide_languages, and the pending verification checklist —
  then lands the applicant in the M2 ops queue. Rolls back the auth user if the
  guides insert fails.
- **Guide area** `/g` — auth-gated mobile shell + status page (Applied → In
  review → Verified stepper + checklist), sign-out.

**Verified (real local Supabase):** submitted the `/apply` form as "Ang Rita
Sherpa" → she appears in the ops verification queue (Applied, 0/6, full
checklist + languages + phone-keyed auth user created); `/g` redirects unauthed
to `/g/login`; the trekker email-OTP round-trip establishes a session
(signInWithOtp → verifyOtp). Build + typecheck + 39 tests green.

**🙋 Founder (to make auth *deliver* in production):**
1. Supabase → Authentication → enable **Email** (OTP) and **Phone** providers.
2. Configure an **SMS provider** for guide phone OTP — wire Sparrow SMS (or
   Twilio) in Supabase Auth settings. Until then, guide phone-OTP delivery
   won't work (the flow is built and correct); email OTP works out of the box.

**Next:** M5 — guide dashboard (enquiries inbox, bookings, calendar, earnings) at
360px, expanding the `/g` area.

---

## 2026-08-09 — M5 (guide dashboard)

**Shipped** (mobile-first, ≤ max-w-md, bottom tab bar)

- `/g` layout — guide-auth gated; status page for applicants, dashboard for
  verified guides; bottom nav (Home · Enquiries · Trips · Calendar · Earnings)
  with a live open-enquiry badge; sign-out.
- **Home** — today's state: on an active trek → the giant glove-friendly
  `CheckinButton` ("I'm safe — Day N", 96px, success moment); otherwise open-
  enquiry count + next trip + quick links.
- **Enquiries** `/g/enquiries` — cards (trekker + country + offering + dates +
  message) with 2-tap **Accept / Decline**.
- **Trips** `/g/bookings` — upcoming/active + completed; trekker phone released
  post-deposit (tap-to-call).
- **Calendar** `/g/calendar` — 3-month grid, tap a day to block/open
  (optimistic), booked/held days locked.
- **Earnings** `/g/earnings` — payable/paid totals in NPR + per-trip, with the
  "you keep 85%" explainer.
- **Profile** `/g/profile` — read view + guide-editable rate/payout + a
  bio/photo change request (ops-routed).
- Check-in records to `checkins`; `CheckinButton` full wiring (SMS path, missed-
  checkin alerts) remains M8.

**Verified (real local Supabase) at 360px:** signed in as a verified guide
(Pemba) → dashboard shows the active-trek check-in (Day 5), tapping it records a
check-in; Enquiries 3 → 2 after Accept (persisted); calendar/earnings/profile
render. Build + typecheck + 39 tests green.

**Note on how it was verified:** guide login is phone OTP, which needs an SMS
provider (a 🙋 founder task — see below), so the dashboard was driven with a
library-accurate `@supabase/ssr` session injected for the test. `config.toml`
is committed pristine (no dev SMS hacks).

**🙋 Founder:** to let guides actually sign in, configure an **SMS provider**
in Supabase Auth (Sparrow SMS / Twilio) and enable the Phone provider. Trekker
email OTP already works.

**Next:** M6 — enquiry → quote → booking → Stripe deposit (needs your Stripe
test keys).

---

## 2026-08-09 — M6 (enquiry → quote → booking → deposit)

**Shipped** (against a mocked Stripe — real keys slot in with no code change)

- `app/lib/stripe.server.ts` — Stripe behind one interface: `RealStripe` (REST
  via fetch, Workers-friendly) + `MockStripe`, chosen by `STRIPE_SECRET_KEY`.
- `app/lib/booking.server.ts` — the booking state machine: `quote` (pricing.ts),
  `acceptEnquiry` (create booking `pending_deposit` + hold calendar days),
  `fulfillDeposit` (idempotent: PI-dedupe + status guard), `cancelBooking`
  (refund per policy.ts + release days), and the `runEnquiryExpirySweep` /
  `runBalanceSweep` crons. `app/lib/config.ts` for FX + window constants.
- **Enquiry** from the offering booking widget → `/enquiry` (trekker-auth;
  redirects to `/login?next=` if signed out).
- **Guide accept** (M5 inbox) now creates the booking + holds availability.
- **Checkout** `/checkout/:id` — deposit (30%, or 100% inside 14 days) via the
  mock PaymentIntent; **Trip** `/trips/:id` — status timeline, payments, cancel.
- **Webhook** `/api/webhooks/stripe` (deposit success → `deposit_paid` + calendar
  booked, idempotent) and **cron** `/api/cron/:job` (enquiry-expiry, balance-
  sweep), secret-gated.
- Trekker login now honours `?next` (returns to the offering after sign-in).
- Tests: **40** (added webhook-idempotency incl. the stray-PI guard).

**Verified end-to-end (real local Supabase + mock Stripe):** as a trekker,
enquired on EBC → guide accepted (booking `pending_deposit`, 14 calendar days
held) → paid the deposit → booking `deposit_paid`, 14 days `booked`, one deposit
payment recorded; a stray webhook redelivery stayed idempotent (1 payment);
cron endpoints return JSON. Build + typecheck + 40 tests green.

**🙋 Founder:** add **Stripe test keys** (`STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`) to `.dev.vars`/Cloudflare, set
the webhook endpoint to `/api/webhooks/stripe`, and schedule the two crons
(Cloudflare Cron Triggers → `/api/cron/enquiry-expiry` every 15m,
`/api/cron/balance-sweep` daily) with `CRON_SECRET`.

**Next:** M7 — documents, permits, My Trips (private docs bucket + retention).

---

## 2026-08-09 — M7 (documents, permits, My Trips)

**Shipped**

- **Private documents bucket** (`0013`) — Storage bucket `documents` (private,
  10MB, image/pdf). No storage RLS → service-role only; all access via
  server-issued **signed URLs (10-min TTL)**, logged to `document_access_log`,
  URLs never logged (`app/lib/documents.server.ts`).
- **Trekker document upload** (passport/insurance per party member) on the trip
  page → private bucket + `booking_documents`; view via a signed-URL redirect
  route that authorises + logs.
- **Ops doc review** (`/ops/bookings/:id`, linked from the pipeline) — view
  (signed URL) + verify each doc; when all are verified and the balance is
  settled, the booking → **confirmed**.
- **Permit applications auto-created** on `confirmed` via a DB trigger
  (`create_permit_apps_on_confirm`) from the route's permits — the M2 permit
  tracker picks them up.
- **My Trips** — list (`/trips`) + detail: status timeline, documents,
  permit status, **pre-trek brief (unlocks T-7)**, **guide phone (unlocks
  T-48h)**, SOS card while active, confirm-completion (schedules 90-day doc
  deletion).
- **Notifications** (`app/lib/notify.server.ts`) — Resend email + Sparrow SMS,
  stubbed to console until keys land; wired on confirm.
- **Retention sweep** (`/api/cron/document-retention`) deletes docs 90 days
  post-completion (storage object + rows).
- Unlock schedule is pure + unit-tested (`unlocks.ts`, time-travel). **43 tests.**

**Verified end-to-end (real local Supabase incl. Storage):** deposit paid →
uploaded passport + insurance to the private bucket → ops verified both →
booking **confirmed** → **2 permit applications auto-created** → pre-trek brief
+ guide phone visible → retention sweep deleted an expired doc. Build +
typecheck + 43 tests green.

**🙋 Founder:** verify a **Resend** sending domain and set `RESEND_API_KEY`;
create a **Sparrow SMS** account and set `SPARROW_SMS_TOKEN`; schedule
`/api/cron/document-retention` daily. Until then notifications log to console.

**Next:** M8 — messaging, check-ins, reviews (double-blind), recap page + OG.

## M8 — Messaging, reviews (double-blind), recaps + OG (2026-08-09)

Built the social layer that turns a completed trek into trust and demand:

- **Messaging** (`/messages/:bookingId`) — one shared thread for the trekker
  and their guide. Pre-deposit, phone numbers and emails are masked in the
  rendered body (`mask.ts`), the original is stored, and any contact/bypass
  attempt sets `flagged_reason` → ops moderation queue. Post-deposit, the raw
  body shows. Linked from the trip page ("Message your guide") and the guide's
  bookings list ("Message").
- **Double-blind reviews** (`reviews.ts` pure + unit-tested; `reviews.server.ts`).
  A review stays hidden until BOTH sides submit **or 14 days pass** — then both
  release together. Trekker→guide sub-ratings (safety, communication, local
  knowledge, english, pace, value); guide→trekker (fitness honesty, punctuality,
  respect). Trekker reviews from the trip page (optional photo → moderation
  queue); guide reviews from `/g/bookings`. Lone-review release runs on the
  `review-release` cron.
- **Recaps** (`/recap/:slug`) — auto-generated when a booking completes: a
  public, shareable SSR page (days, max altitude, approved photos, guide chip,
  "Book <guide> again"). Dynamic **OpenGraph image** at `/recap/:slug/og`
  rendered with `workers-og` (satori + resvg wasm) and an **embedded** font
  (`og-font.ts`) so it needs no network at the edge — verified returning a
  1200×630 PNG.
- **Ops moderation** (`/ops/moderation`) — flagged-message queue (dismiss) and
  trekker-photo approval queue (approve → public / reject → delete). New nav
  item with a live count badge.
- **Missed check-in sweep** (`runMissedCheckinSweep`, `missed-checkin` cron) —
  opens an L1 incident for an active booking whose last check-in is stale, with
  no duplicate.
- New buckets/tables wiring: `0014_photos_bucket.sql` (public `photos` bucket
  for review/check-in photos), `media.server.ts` (`uploadPublicPhoto`).

**Verified (real local Supabase):** all 14 migrations + seed apply clean;
recap page SSRs the real offering + guide with correct `og:image` meta; the OG
route returns a valid **1200×630 image/png** (font embedded, wasm rendered);
schema columns for messages/reviews/recaps/photos all present. Build +
typecheck + **47 tests** green.

**🙋 Founder:** schedule the `review-release` and `missed-checkin` crons daily;
(same Resend/Sparrow keys from M7 cover review-request emails).

**Next:** M9 — launch gate (deploy to Cloudflare, live env wiring, final QA).

## M9 (part 1) — Security hardening + error resilience (2026-08-10)

Started the M9 launch gate with the security pass — the item most likely to
hide a launch-blocker — plus error-page polish. Built an automated **RLS audit**
(`scripts/rls-audit.mjs`, `npm run audit:rls`) that connects as anon and asserts
the default-deny contract. It caught **three real defects**:

1. **`reviews` base table leaked to anon.** The public-read policy exposed
   published rows straight off the table, including `booking_id`/`author_id`/
   timestamps the `public_reviews` view was built to hide. Every public code
   path already uses that view, so `0015_tighten_reviews_rls.sql` drops the anon
   branch — anon now reads reviews only through the safe view.
2. **Guide photos were invisible to the public (functional bug).** The
   `guide_photos` public-read policy tested verification via `EXISTS` on the
   `guides` base table, which denies anon — so the subquery always matched zero
   and the profile carousel showed **no photos on our primary SEO page**.
   `0016_fix_guide_photos_public_read.sql` adds a security-definer
   `is_verified_guide(uuid)` helper (mirroring `is_ops()`) so verification is
   checked without granting anon any access to `guides`. Verified end-to-end:
   the seed photo now renders on `/guides/pemba-sherpa` for an anonymous visitor.
3. **Stripe webhook did not verify signatures.** `RealStripe.constructEvent`
   just `JSON.parse`d the payload, so in production anyone could POST a forged
   `payment_intent.succeeded` and mark a booking paid without paying. Implemented
   real HMAC-SHA256 verification over `${t}.${payload}` via Web Crypto
   (`verifyStripeSignature`, Workers + Node), constant-time compare, and a
   timestamp-tolerance check that closes the replay hole. Six unit tests cover
   valid / tampered / wrong-secret / replayed / unsigned / no-secret.

Also branded the root **ErrorBoundary** (404 vs 500, CTA back to guides/home,
server-side logging of unexpected 5xx; internals never leak to trekkers).

**Verified:** clean `supabase db reset` applies all **16** migrations + seed;
`npm run audit:rls` → PASS (anon fully fenced); typecheck + build + **53 tests**
green (+6 webhook).

**🙋 Founder (still blocking real launch):** domain + DNS, Stripe **live** keys +
webhook secret, real permit costs confirmed with the TAAN partner.

**Next (M9 part 2):** PostHog events, full copy.ts pass, per-action rate limits,
strip seed + onboard the first real guides.

## Deploy — first live preview on Cloudflare + Supabase cloud (2026-08-10)

Deployed the `claude/app-build-lgnkqo` branch to the founder's real Cloudflare
account against his real Supabase cloud project.

- **Live URL:** https://trek.raman-7d9.workers.dev (Worker `trek`).
- **Database:** all 16 migrations + the demo seed applied to the cloud project
  (12 verified guides, 20 offerings, 6 routes, 10 reviews). Verified live RLS
  over the REST API: `public_guides`/`public_reviews`/`guide_photos` serve anon;
  `reviews`/`bookings` base tables deny anon. Storage buckets `documents`
  (private) + `photos` (public) created.
- **Constraint discovered:** this deploy environment allows HTTPS only — direct
  Postgres ports (5432/6543) are firewalled and the Supabase direct host is
  IPv6-only. So migrations were applied over HTTPS via the **Supabase Management
  API** (`scripts/remote-apply.sh`, needs a `sbp_` personal access token) rather
  than `supabase db push`. Documented for future deploys/CI.
- **Secrets set on the Worker:** SUPABASE_URL, SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, SITE_URL (via `wrangler secret put`; nothing
  committed).

**Preview caveats (not yet production-safe):** no Stripe keys → payments run in
mock mode (no money moves); no Resend/Sparrow → emails/SMS log only; cron sweeps
not scheduled (needs a Cloudflare scheduled() handler — follow-up).

**🙋 Founder:** rotate the service-role key, the `sbp_` token, and the Cloudflare
token that were shared in chat; add live Stripe keys before taking real bookings.
## Brand System v1 — green rebrand (2026-08-10)

Replaced the navy/rust palette with the green field-notebook system (Brand
System v1). Foundation-first so most of the app recoloured at once:

- **Tokens (`app.css`):** the 13-colour green system (ink/pine/moss/fern/sage/
  mist/chartreuse/paper/card/wheat/ember/muted/line); legacy semantic aliases
  (primary→moss, surface→paper, himalaya→pine, danger→ember, gold→chartreuse…)
  remapped so existing components recoloured without churn. Radius scale
  (8/14/24/999), type scale tokens, and `.title`/`.label` named styles.
- **Type:** Fraunces (display, with opsz 72 / SOFT 60 / WONK 0), Inter Tight
  (body/UI), JetBrains Mono (data) — all self-hosted via fontsource (no CDN, per
  the CSP rule; the spec's Google-Fonts suggestion was adapted). Verified live
  that h1=Fraunces, card names=Inter Tight, numbers=JetBrains Mono.
- **The mono rule:** ratings, prices, response times, days, altitudes set in
  JetBrains Mono (tabular).
- **Ridgeline signature (`Ridgeline.tsx`):** one hand-cut path, three placements
  — under the hero, above the footer (flipped), and as the avatar ring on chips.
- **Cards rebuilt (§8):** equal-height (flex + pinned bottom row), "New guide"
  slot never collapses, 2-line clamp, tier badges on paper pills; experience
  cards show the guide's **full name** and a consistent `from $X · per person`
  price. Rating star is moss; tier badges Verified=mist/moss, Trusted=sage/pine,
  Elite=chartreuse/pine, each linking to the new **/trust** page.
- **Photography (§5):** grey placeholders replaced with warm **wheat + contour**
  pattern; pine (never black) hero overlay.
- **New `/trust` page** explaining the verification ladder; footer → pine with
  sage/fern links + ridgeline.
- **Bug-fixes that applied:** carousel `scroll-pl` so the first guide card isn't
  clipped; chartreuse active category pill. (The spec's "duplicate filter row"
  and chip-filter items don't exist in this build — it uses selects — so they
  were adapted, not invented.)

**Verified:** typecheck + build green; **zero raw hex** in shipped
components/routes; screenshots at 390/768/1440 with **no horizontal overflow**.
Deployed to https://trek.raman-7d9.workers.dev.

**Not done (noted):** photo grading (needs real photography); transparent-over-
hero nav on scroll; ridgeline on the guide-profile header; a full every-number
mono sweep on secondary/ops screens.

## Trekker account creation — Typeform-style onboarding (2026-08-10)

Added an immersive, one-question-per-screen signup for customers (`/signup`),
full-screen (no header/footer chrome), keyboard-first, on the green system.

- **Flow:** name → country (one-tap popular chips + "Somewhere else" select) →
  email → 6-digit code → account created. Progress bar, per-step fade-rise,
  Enter-to-advance, Back, personalised copy ("Where are you travelling from,
  Alex?"). Reuses the existing email-OTP auth and `ensureTrekkerProfile`
  (extended to capture `country_code`), so no new auth surface.
- **Entry points:** header "Sign up" CTA; "Create your account →" on `/login`
  (both carry `?next=` through).
- **Cloud auth config:** fixed `site_url` (was `localhost:3000`) →
  https://trek.raman-7d9.workers.dev and set the redirect allow-list.
- Verified the client flow at 390/1440 (name→country→email→code all advance).

**🙋 Founder — email delivery:** the project has **no custom SMTP**, so signup
codes go through Supabase's built-in sender, capped at **2 emails/hour**. Fine to
test with, but before real signups add SMTP (your Resend key): Supabase dashboard
→ Authentication → Emails → SMTP settings. Then the cap lifts.

## Auth → email + password (2026-08-10)

Per founder: dropped the email-code (OTP) dependency for customers; signup and
login are now **email + password** with Supabase **auto-confirm on** (no
verification email needed — reliable email/SMTP is a later task).

- `/signup` last step is now "Set a password" (≥8 chars) → `auth.signUp` returns
  a session immediately (verified against the cloud project) → profile created →
  redirected in.
- `/login` is now email + password (`signInWithPassword`).
- Cloud auth config: `mailer_autoconfirm = true`; `site_url` already fixed to the
  live URL earlier.
- **Trekker test login** (populated "My Trips" — 4 bookings): set a password on a
  seed trekker.

**🙋 Founder:** auto-confirm means anyone can register with any email without
verifying it — fine for now; re-enable confirmation (and add Resend SMTP) before
real launch. Password reset also needs SMTP.

## Auth-aware header + logout (2026-08-10)

Closed the account loop so a signed-in customer is acknowledged across the site:

- `_public` layout loader now resolves the session user + profile and passes an
  `account` (first name + role) to the header.
- **Header** is auth-aware: signed out → "Sign in" + "Sign up"; signed in → a
  role-aware dashboard link (trekker → **My trips**, guide → Dashboard, ops →
  Ops), "Hi, <first name>", and a **Sign out** button.
- New `/logout` route (POST signs out + clears cookies → home).

Verified end-to-end locally: sign in as a seed trekker → header shows My trips /
Hi Liam / Sign out → Sign out reverts to Sign in / Sign up. Deployed.

**Deferred (needs email/SMTP):** password reset — genuinely requires sending a
reset link, so it waits on the founder adding Resend SMTP (the "rest" to add
later). Everything else in the email+password flow works without email.

## Company↔Guide contracts — auto-sign + templates admin (2026-08-10)

Auto contract signing between the Company and the Guide, plus an ops area to
manage contract templates.

- **Schema (`0017_contracts.sql`):** `contract_templates` (ops-managed, one
  active at a time, `{{placeholder}}` body) and `contracts` (one per booking:
  rendered snapshot, terms jsonb, company/guide signed timestamps, status). RLS:
  ops all; guide can read their own; no trekker access.
- **Auto-generation + signing:** wired into `acceptEnquiry` — the moment a guide
  accepts a booking, a contract is generated from the active template with that
  booking's terms and **auto-signed by both sides** (the guide's acceptance is
  their signature; the Company counter-signs). Best-effort/idempotent — never
  blocks the booking; skips cleanly if no active template.
  (`contracts.server.ts`: pure `renderTemplate` + `generateContractForBooking`.)
- **Admin area (`/ops/contracts`):** placeholder reference, create-template form,
  and inline edit/activate/delete for each template (single active enforced);
  "Generate for existing bookings" backfill. New "Contracts" nav item.
- **Booking detail:** a Company↔Guide contract panel showing signed status +
  both signature dates + the full rendered agreement (or a "Generate & sign"
  button if missing).
- Default "Guide Engagement Agreement" template seeded + set active; backfilled
  16 signed contracts across the demo bookings (cloud + local). Unit test for the
  renderer. **56 tests**, typecheck + build green. Deployed.

## Insurance checker + in-app blue TIMS card (2026 rules) (2026-08-10)

Two connected moats aligned to Nepal's 2026 rules.

- **Insurance checker (`/insurance`)** — a public one-screen "does my policy
  qualify?" tool. Pure, unit-tested logic (`insurance.ts`): high-altitude cover
  and helicopter evacuation are the hard gate; medical/repatriation/dates are
  advisory. Live verdict as you toggle; altitude threshold adapts to the trek
  when opened with `?bookingId=`, and a signed-in trekker can attest the policy
  to their booking (provider + number + coverage → `insurance_meta`). Linked in
  the footer. SEO meta for "does my travel insurance qualify for Nepal".
- **Blue TIMS card, issued in-flow** — the green independent card is gone; we
  issue the agency blue card as a product feature (`0018` migration:
  `tims_cards` + insurance columns on bookings; `tims.server.ts`). Ops verify
  insurance then **Issue blue card** from the booking detail (gated on the 2026
  insurance rule); the card auto-fills trekker, nationality, route, region,
  entry point, **guide name + licence**, and dates, with a deterministic serial
  `TIMS-B-YYYY-XXXXXX`. Trekkers view/print the styled blue card on their trip
  page; guide licence is called out for checkpoint verification.
- Ops booking detail gained Insurance + Blue-TIMS panels. Renderer + card-serial
  unit-tested (**64 tests**). Migration + a demo verified-insurance/issued-card
  applied to cloud + local. Typecheck + build green. Deployed.

**🙋 Founder / partner:** the checker is the hook for an insurance-partner
referral (affiliate link on the "not yet — here's the gap" state). Real TIMS
issuance should reconcile against TAAN's system; today it's a first-party record.

## Insurance-partner slot + PDF downloads (2026-08-10)

- **Affiliate slot** on the /insurance "gap" state: env-driven partner
  (`INSURANCE_PARTNER_NAME` / `INSURANCE_PARTNER_URL`) — a moss CTA with a
  `?ref=trek` + `rel="sponsored"` and a "we may earn a commission" note; a
  graceful "ask us" mailto fallback when unset. Founder flips it on via
  Cloudflare vars, no deploy.
- **PDF downloads** via pdf-lib (pure JS, Workers-friendly): `pdf.server.ts`
  renders the blue TIMS card and the signed contract as real `application/pdf`
  files. Resource routes `/pdf/tims/:bookingId` (trekker/guide/ops) and
  `/pdf/contract/:bookingId` (guide/ops only — trekker gets 403). Download
  buttons on the trip page (TIMS) and ops booking detail (TIMS + contract).
  Verified: valid `%PDF-` bytes, correct content-type, and the trekker→contract
  403 gate holds.

## v3 Phase 0/1 — the Split + experience-page breakdown (2026-08-10)

Brand v2 does not exist; building v3 on Brand System v1 (per founder), in v3's
phase order.

- **`<Split>` (dual mode, `Split.tsx`)** — `GuideSplit` (90/10 thin bar) and
  `ExperienceSplit` (6-slice bar + full itemised list, mono amounts). v2's slice
  tokens mapped to Brand v1 (guide=moss, permits=pine, porters=fern,
  logistics=sage, trek=wheat, fund=chartreuse). Amounts must sum; a mismatch
  renders in `--ember` and refuses ("do not book") — never silently normalised.
- **0020**: `price_breakdown` (+ route `max_altitude_m`) exposed on the
  `public_offerings` view.
- **Experience page** now shows a "What you pay" section: the full Split, a live
  **group-size stepper**, and "Guide fee split N ways → you save $X each." The
  booking widget reads the **same** breakdown (shared group state) so the page
  shows ONE per-person total. Verified live at 420/1280 — math reconciles, no
  overflow.

**Deferred (Phase 2, booking spine):** the server `quote()`/booking money
snapshot still uses the legacy model (day_rate×days + 8% service). No money moves
at enquiry, so display is correct now; the quote adopts the breakdown when the
request→deposit spine is rebuilt (needs porters/logistics/fund columns on the
booking). **Next slice (Phase 1 #5):** guide cards (day-rate) vs experience cards
(breakdown "from $X · per person") — fix the day_rate×days card bug.

## v3 Phase 1 #5 — card price semantics (2026-08-10)

- **Guide cards** now show the **day rate** (`$X/day`, mono) plus a thin
  `GuideSplit` 90/10 bar and "90% goes to <first name>" — the guide is hired per
  day; 90% is theirs.
- **Experience cards** now price from the **breakdown** (`fromPerPersonUsdCents`,
  cheapest per-person) as "from $X · per person" — fixing the day_rate×days bug
  (EBC 14d now $614.16, not $630). Day experiences keep their flat price.
- `price_breakdown` added to the offering card selects (home/experiences/routes/
  guide-profile) and the trek JSON-LD price now uses the breakdown too.
- Verified at 390/1280: guide Split bars render, experience "from" prices are
  breakdown-derived, equal height, no overflow.

**Next (Phase 1):** #8 add-ons (gear, airport+hotel, porter) + budget slider;
#9 multi-currency display. Then Phase 2 (booking spine).

## v3 Phase 1 #8a — add-ons (2026-08-10)

- **Add-ons** on the experience page (`addons.ts` catalogue): **Gear rental**
  (Kathmandu pickup) and **Airport pickup + first-night hotel**, each a labelled
  per-person line that recomputes the grand total. **Porter** is a toggle on the
  core line — turning it off recomputes the trek/fund fee on the smaller base
  (the fee follows the real package). Add-ons are pass-through — "partner
  services we take no cut of."
- Grand total ("Your total · per person") is the single number and matches the
  booking widget (breakdown + add-ons threaded through `useQuote`).
- Verified: solo core $1,148.08 + gear $60 + airport/hotel $45 = $1,253.08;
  porter-off recompute unit-tested. 70 tests green.

**Next (Phase 1 #8b):** budget slider (package recomposer — teahouse tier /
porter / days, showing deltas). Then #9 multi-currency. Then Phase 2.

## v3 Phase 1 #8b — budget slider (package recomposer) (2026-08-10)

- **Budget slider** on the experience page (v3 §1c): drag a per-person budget and
  the package **recomposes** to hit it via honest levers — teahouse tier
  (comfort/standard/basic, logistics ×1/0.8/0.6) and porter on/off. The trek fee
  + Fund recompute on the new base (fee follows the package). Shows the config
  ("Standard teahouses · with porter") and exact, sequential per-lever deltas
  ("standard teahouses −$47.46", "no porter −$X") that sum to the total change.
- Pure + tested: `recompose`, `budgetConfigs` (6, sorted), `pickConfig` (richest
  within budget). Verified: min config = basic + no porter → $958.24 (from
  $1,148.08), porters $0, logistics ×0.6, fee recomputed; booking bar matches.
- Days/itinerary recomposition intentionally deferred to route/custom-trip pages
  (Phase 6) — it doesn't apply to a fixed-length packaged trek. 73 tests green.

**Phase 1 complete except #9 multi-currency (next). Then Phase 2 (booking spine).**

## v3 Phase 1 #9 — multi-currency display (2026-08-10) — PHASE 1 COMPLETE

- **Currency toggle** (USD/EUR/GBP/AUD) in the header; NPR reserved for guides/
  ledger. `currency.ts` (cached daily rates, USD-cent source of truth) +
  `currency-context.tsx` (hydration-safe provider defaulting to USD, adopts the
  stored choice post-mount; `useMoney()` hook).
- All shopping prices convert: cards ("from"), day rate, experience Split lines +
  total, budget rails/deltas, add-ons, booking widget. **Summation preserved** —
  the shown total is the sum of the *converted* lines, never converted
  independently. Disclosure: "shown in EUR (approx.) — you're charged in USD."
- Verified in EUR: EBC breakdown Guide €579.60 / Permits €84.64 / … summing to
  €1,056.23, cards + widget consistent, no overflow. 73 tests green.

**Phase 1 (pricing model) COMPLETE (#4–#9).** Next: **Phase 2 — booking spine**
(message→request→deposit→instalments, backup guide, cancellation window) — where
the server quote adopts the breakdown (charged total = displayed total).

## v3 Phase 2 #10 — message-before-pay (2026-08-10)

The differentiator: a **free conversation with a named guide before any money**.

- `0021_conversations.sql`: `conversations` (trekker↔guide, optional offering) +
  `messages.conversation_id` (relaxed the thread check to conversation OR enquiry
  OR booking); RLS participant-scoped.
- `findOrCreateConversation` (one thread per trekker/guide/offering). Routes:
  `POST /conversations` (auth-gated; self-message blocked; redirects to login
  with `?next` when signed out) → `/messages/c/:id` thread.
- Thread: masked contact info pre-booking (bypass attempts still flag to ops),
  **response time surfaced** ("Usually replies in ~42 min"), free-chat notice,
  and a **Request to book** escalation CTA.
- Entry points: "Message <guide> — free" on the guide profile and the experience
  page.
- Verified end-to-end (trekker login → Message → thread → a phone number is
  masked, raw number not leaked). 73 tests green.

**Next (Phase 2):** request→confirm→deposit→**interest-free instalments** (two-
track: instant pay for day experiences) + adopt the breakdown in the server
quote; then backup guide + cancellation window. A conversations inbox (both
sides) is a small follow-up.

## Feature Pack v3 — Phases 2–8 shipped (2026-08-10)

One session, seven deployed slices, all verified in-browser and live:

- **#11 instalments** — interest-free balance split chosen at checkout
  (schedule preview, all payments ≥7d pre-departure), generated on deposit,
  charged by the sweep, shown on the trip page. Migration 0022.
- **#11b two-track** — day experiences pay 100% at checkout ("Pay & confirm")
  and confirm instantly; sweep can never touch fully-paid bookings.
- **#12 backup guide + cancellation window** — every trek shows a named
  verified backup ("your trek never cancels on you"); checkout shows the
  trekker's concrete free-cancel date. Migration 0023.
- **Phase 3** — verification receipts with dates on guide profiles
  (public_guide_verifications view), porter-welfare pledge badge +
  /trust#porters, /messages inbox for both sides. Migration 0024.
  Guides can now log in with email+password.
- **Phase 5 matcher** — /match: five questions → ranked guides with
  plain-word reasons (region/season/availability/budget-floor/language).
  Pure scoring lib, 6 unit tests. Fixed a site-wide header overflow ≤390px.
- **Phase 6 route engine** — 4 new route articles (Langtang, Gokyo, Manaslu,
  Mardi Himal), /routes hub with real from-prices, related-route interlinks,
  sitemap additions.
- **Phase 7+8** — /stories recap gallery (8 seeded), unread badges in the
  inbox (thread_reads, migration 0025), /fund with a live 3% counter
  ($434.10 from 13 paid bookings), /hosts recruiting page with an NPR
  earnings calculator.

84 tests green. Migrations 0022–0025 applied to cloud + local; seed updated
to demo everything on a fresh reset. Deployed continuously to
https://trek.raman-7d9.workers.dev.

**🙋 Founder:** domain + Resend SMTP still pending (say "DNS live" with the
domain when ready). Stripe is still mock — real keys needed before launch.

## The Smoothness Pass — 6 batches (2026-08-11)

Three parallel code audits (trekker flows / guide+ops / data+logic) surfaced
~100 concrete issues after v3's fast slices. All six batches shipped and
deployed.

**Batch 1–2 — security, money correctness, lifecycle wiring** (e930203)
- Mock-Stripe webhook was an unauthenticated free-booking endpoint → 404s
  under mock. Cron endpoints failed OPEN (public card-charging/document-
  deleting) → fail closed + CRON_SECRET set. Enquiries RLS let a trekker
  self-accept. g.calendar could flip a booked day. apply.tsx unthrottled.
- Checkout HID ~28% of the price (logistics + Fund had no booking columns);
  refunds were issued against the deposit PI only (would fail on real
  Stripe for any balance/instalment booking); instalment_count wasn't
  clamped to what fits; five screens printed USD numbers with EUR symbols.
- Nothing ever ran the crons (no trigger, no scheduled handler) — added.
  Holds never released; payouts were never created by code; ten
  notification seams were empty. All wired.

**Batch 3 — dead ends + silent failures** (efbf5b6)
Message threads (timestamps, clear-on-send, autoscroll, error, back-links),
cancel confirm with real refund preview, booking-widget empty state +
lead-time/consecutive-day rules, enquiry server validation, mobile header
nav restored, match chips respond to taps, signup says what's wrong.

**Batch 4 — one pricing truth** (797843d)
/transparency still sold the dead 85/15/8% model; rewritten around the v3
model with a worked example from a live listing. hosts/copy/g.earnings
aligned. safety.tsx: insurance required for all treks (not >4,000m), new
permits/TIMS section, founder aside removed. Tier ladder unified in
lib/tiers.ts. Shared lib/format.ts killed raw ISO dates and raw status
enums.

**Batch 5 — guide side** (d1417fd)
/g/login switched to email+password (OTP needed an SMS provider that
doesn't exist — every applicant was locked out); apply collects
credentials. Messages tab + unread badge; guide home shows money owed and
backup-guide assignments. PDF links, calendar tones, change requests
persist to an ops queue (migration 0027). Seed realism: 270-day
availability, bookings hold their days, payment rows, payouts.

**Batch 6 — polish** (bad69dd)
Voice intros play (3 real recordings); header unread dot; robots/noindex/
sitemap-recaps; Button primitive onto brand tokens; hardcoded counts gone.

Migrations 0026–0027 + data fixes applied to cloud and local. 84 tests
green throughout. Live: https://trek.raman-7d9.workers.dev

**🙋 Founder still needed:** real domain + Resend key (email is stubbed),
real Stripe keys (payments are mock; off-session charging needs saved
payment methods — TODO noted in booking.server), and a real ops phone
number for the SOS card (currently a 555 placeholder).

---

## Session — search, dates, and real supply (2026-08-11)

Six things the founder called out after living with the site for an hour.

**Search + a date filter** — the primitive that was missing. One search bar
on both browse lanes: free text plus a date range. The text match unions
three sources, because nothing on a guide's row says "Annapurna" — that
lives on the routes they lead. Dates read the availability table: /guides
asks for one open day in your window, /experiences asks for a run long
enough for the whole trip, so a 14-day trek needs 14 consecutive free days.

**Gender as a filter** (migration 0029, self-declared, optional). It exists
for exactly one reason: solo women travellers ask for a woman guide
constantly and we could not answer. "A female guide free in October for
Annapurna" now returns 6 of 48.

**Counts are dynamic.** "48 verified guides, and more joining every week"
unfiltered; "6 of 48" when narrowed. No count is baked into a string.

**The commission split came off the browse cards.** A trekker choosing a
person does not need the percentage; /transparency still carries it in full.

**A key on the availability calendar** — built from the same class function
the grid uses, so the swatches can't drift from the days.

**Money rounded on cards, exact in breakdowns.** Converted cents are an FX
artefact; a grid of "€565.03" is noise. New `mr()` for cards, `m()`
everywhere the cents are the point.

**36 more guides** — 12 → 48, across 24 districts, 13 women, each with a
portrait and a trek. `seed_guides_cohort.sql` re-runs the generic seed
passes idempotently, so it applies standalone to cloud as well as via
`db reset`.

Also fixed a seed bug that migration 0028 had turned fatal: every seeded
payment intent was named from the first 8 characters of a booking uuid,
which are identical across all of them, so `db reset` failed on the new
unique index.

94 tests green. Migration 0029 + cohort applied to cloud and local.
Live: https://trek.raman-7d9.workers.dev

**🙋 Founder still needed:** real domain + Resend key (email is stubbed),
real Stripe keys (payments are mock; off-session charging needs saved
payment methods), and a real ops phone number for the SOS card.

---

## Session — only_with_me, and a marketplace homepage (2026-08-11)

**`only_with_me`** (migration 0030). One concrete thing you get with this
guide and nobody else, first person, under about twelve words. It is not a
second hook_line: hook_line is a description of a guide, this is the guide
talking. It leads the guide card as a pull-quote and sits under the name on
the profile, styled as a quote with "— Chhiring's words, printed as written"
beneath it. Guides write it themselves in /g/profile — type, save, live. The
action checks length and nothing else; see docs/DECISIONS.md for why we
publish it unedited. Seeded for all 48.

**The homepage now leads with search.** Where · when · how many, in the hero,
as a plain GET to /experiences — no JavaScript required, every result a
shareable URL. Party size became a real filter (min_party/max_party), so
"8 people" hides the trips that cannot take 8.

Below it: a MapLibre map of guides pinned by district with routes drawn and a
map/list toggle; six browse-by-intent rows, each literally `/guides?intent=…`
so a row can never disagree with its own "see all"; a "free this week" row off
the availability calendar; regions as doorways; and a mono band of real
numbers (48 guides · 24 districts · 1,128 treks led · $435 to The Fund this
year · $0 taken on rescue flights).

Hero contrast was measured rather than eyeballed — sampling the brightest
pixel behind the headline at six widths. The single scrim was 3.1:1 at 390px.
Two full-bleed scrims now hold ≥5.5:1 for the headline and ≥9:1 for the
paragraph from 360 to 1920.

**Two real bugs surfaced and fixed:**

- *Nested `<a>` broke hydration site-wide.* TierBadge and GuideChip both
  render links and both sit inside cards that are themselves links. Browsers
  un-nest invalid anchors while parsing, so React hydrated against a DOM it
  never rendered and threw on every page carrying a card. Both take a `static`
  prop now; six pages went from one hydration error to zero.
- *`guide_languages` was invisible to the public* (migration 0031) — RLS on,
  one owner/ops policy, no public read, the same shape as the 0016
  guide_photos bug. Anonymous visitors had received zero rows since 0001,
  which silently broke the language line on every card, the "Any language"
  filter (it matched nothing, ever), the profile languages row, and the
  matcher's language score.

94 tests green. Migrations 0030–0031 and the promise seed applied to cloud and
local. Live: https://trek.raman-7d9.workers.dev

*Verification note:* Chromium cannot reach the live URL from the build sandbox
(the proxy is curl-only), so browser-level checks — map markers and popups,
the map/list toggle, hydration, contrast sampling — ran locally against the
same code and data. The deployed site was verified over curl: every row,
stat, promise line and filter count above is from the live HTML.

**🙋 Founder still needed:** real domain + Resend key (email is stubbed), real
Stripe keys (payments are mock), a real ops phone number for the SOS card,
and — new — a Baato API key if you want Nepali-language map tiles instead of
OpenStreetMap.

---

## Session — Trek Journals + Guide page v2 (2026-08-11)

The thesis of the brief: a guide is proven by his body of work, not his bio.

**The journal** (`/journals/:slug`) — one album per completed trek, written by
the guide who led it. Title overlaps the cover photo's bottom edge; one mono
stat line; sticky guide strip; day blocks with the numeral in the left margin
and photo layouts rotating full → two-up → portrait so no grid shape repeats
down the page; the hard day as its own ember-ruled block; an elevation strip
drawn only from altitudes the guide actually recorded (missing days are absent
rather than interpolated — a smoothed number on a page whose job is "this
really happened" is the wrong kind of convenient); the closing note set large;
the client's note; then the CTA to walk it with the same man.

**Two rules are enforced in the database, not in page code** (migration 0032):
`journals_real_trip` means a journal hangs off a completed booking or an
ops-verified pre-platform trek and there is no third option; and consent is
applied in the public views, so `client_names_ok` decides whether the world
sees "Jef & Simon, BE" or "two guests from Belgium", and `client_photos_ok`
filters out photos flagged as having a recognisable client. A page that forgets
to check cannot leak.

**Photo upload** (`/api/journal-photo`) strips the GPS pointer from the JPEG
EXIF before storage and keeps the dates. Anything it cannot parse is refused
rather than stored. Its test suite caught a real out-of-bounds read on a
truncated file — which is exactly what a dropped 3G upload from a lodge looks
like.

**Guide page v2**: journal wall directly under a two-column header, dominant
lead card, route chips with per-route counts, mono stat band that links down
to what proves it. Floating price card and empty right column deleted; price
moved to the stat band and a sticky bottom bar. Bio demoted below the wall
with a 3-line clamp. Zero-journal and zero-review states are invitations.

Porter pledge now keys off "does this guide's work carry porters", not tier —
that mismatch is why it appeared on some profiles and not others.

`/journals` index (filter by region, route, season, guide), a "Latest from the
trail" strip on the homepage, journals in the sitemap, and the footer's "Trek
stories" now points here.

Migrations 0032–0033 + the journal seed applied to cloud and local.
99 tests green. Live: https://trek.raman-7d9.workers.dev

**Not reproduced:** the three floating icons overflowing the right viewport
edge. I probed every element's bounding box against the viewport at 320, 360,
390, 1023, 1280 and 1440, in USD and EUR — `scrollWidth === clientWidth` and
zero overflowing elements at every width, and the only fixed element on the
old page was the mobile bottom bar. The v2 rebuild removes the right rail and
the old sticky bar regardless, so if it was one of those it is gone. If it
recurs, a screenshot with the browser and window width would pin it down.

**🙋 Founder still needed:** real domain + Resend key, real Stripe keys, an ops
phone number for the SOS card, a Baato key if you want Nepali map tiles — and
now, the first real journals: ring three guides, ask them about their last
trek, and type it into /ops/journals while they talk.

---

## Session — route catalogue, journal albums, tagging, and the floating icons

**The floating icons, found.** Four reports, two "cannot reproduce" from me,
and the cause was not overflow at all — it was `SmartImage` rendering
`<img src="">` whenever a row had no photo. An empty `src` is not "no image"
to a browser: it resolves against the current URL, fetches the HTML page,
fails to decode it, and paints the broken-image glyph. Every null
`avatar_url` — trekkers, ops accounts, guides still in review — produced one,
which is exactly why they appeared on the guide profile, the matcher, the
messages thread and the journal and nowhere else. `SmartImage` now returns
the placeholder block when there is no src, so there is no `<img>` to break.
Bounding-box probes never would have found it; a broken-image glyph is inside
its element's box.

**Route pages, the whole Nepali catalogue.** `/routes/{slug}` for 24 named
routes, driven from data (`routes.day_stops`, `month_profile`, `faq` — all
jsonb, migration 0035) so adding the 25th is a seed row, not a page. Each
page: full-bleed hero and a mono stat strip, an elevation profile you scrub
with a pointer that drives the MapLibre pins alongside it, the day-by-day
list, route permits with real costs, the cost Split, a 12-month
crowds/weather/cost heatmap, every guide who runs it with their trek count,
every journal on it, the bookable experiences, and TouristTrip + FAQPage
JSON-LD.

They only work as an SEO surface if the site links into them, so:
`public_offerings` now exposes `route_slug/name/region` (0037), every
experience card and trek page names its route, the homepage has a named-route
strip, and the journal header links its route. `OfferingCard` became a div
with a stretched title link so the route chip can be a real link — a nested
`<a>` breaks hydration, which is the same bug that bit the tier badges.

**Journals are albums now.** The seed covers every day of all four treks
(days 1–15, not "6" then "9") with 17–35 photos each drawn from a pool of 22.
Publish refuses a journal under 8 photos or with a day missing, and names the
gap: "missing days 2–3 of 14". Layouts rotate full / two / three / portrait /
panorama so no two blocks share a shape; the portrait block floats so text
wraps instead of leaving half a row empty, and the three-up grid sizes its
columns from the photo count so a block never ends in a hole. The dead right
column became a sticky rail — route mini-map, elevation profile, guide card —
and "Trek this with Binod" is a sticky bottom bar the whole way down.

**Tagging.** A closed vocabulary (season, difficulty, group, conditions,
theme — `TAG_VOCAB`), because a free-text tag field gives you "Autumn",
"autumn", "Fall" and "post-monsoon" for the same week and then the filter
returns three of the four. Editable in both the ops and guide editors, shown
under the journal cover, clickable to `/journals?tag=…`. Route is now required
on a journal — it is what connects it to the route page and the guide's count.

Migrations 0035–0037 + seed_routes + seed_journal_days applied to cloud and
local. 111 tests green. Live: https://trek.raman-7d9.workers.dev

**🙋 Founder still needed:** unchanged — real domain + Resend key, real Stripe
keys, an ops phone number, and the first real journals from three guides.

## Session — group trips in the inbox (2026-09-06)

**The bug the founder saw:** a trip group is a real conversation — four
friends deciding whether to add a rest day — but `/messages` never mentioned
it. Group chat lives in its own table (`trip_group_messages`, migration 0039)
and only ever rendered on `/groups/<slug>`, so the inbox and the header dot
were built from conversations and booking threads alone. If you did not
remember the group's URL, the conversation was gone.

**The fix is in the two places the inbox is assembled**, not a new screen:

- `listThreads()` now carries a third thread kind, `"group"`. Membership
  (`groupIdsFor`) is the access rule — these queries run on an admin client
  that bypasses RLS, so that lookup is what keeps someone else's trip out of
  your inbox. The thread shows the group name, the offering title underneath,
  the trek's cover photo as its avatar, and links to `/groups/<slug>`, which
  is where the chat actually lives alongside the roster and the money.
- `countUnread()` counts group messages the same way, so the envelope in the
  header stops under-reporting.
- Unread is tracked under `thread_reads` key `g:<group_id>`, and the group
  page stamps it on load for members — the chat is read there and nowhere
  else, so without that write a group thread would sit bolded forever.
- A cancelled group with nothing said in it stays out of the list; one that
  was talked in stays, because a trip falling apart is exactly what people go
  back and read.

Guides are not group members, so a guide's inbox is unchanged — the group
chat is deliberately not a moderated trekker-to-guide thread.

New `app/lib/threads.test.ts` runs the inbox against a small fake Supabase
builder: the group appears, someone else's does not, and unread counts only
what other people said since you last opened it. 258 tests green, build green.

## Session — the guide joins the group, and every trip gets a track (2026-09-06)

Three things the founder asked for, in one pass.

**The guide is in the group chat.** Migration 0056 adds `is_group_guide()` and
widens the group's read policies plus the chat's insert policy to the guide
the group is planning with. `groupIdsFor()` now resolves both halves of "who
is in the room" — the roster, and the guide, who is never on it. The guide
talks and changes nothing: no invite, no remove, no payment mode, no cancel,
and no join (joining would give them a seat and a share of the bill). They see
who is coming; they do not see anyone's share or what they still owe, and that
section is not rendered for them rather than hidden with CSS.

**The chat is in the inbox, with a composer.** `/messages/g/:groupId` is the
group conversation inside the messages shell: attributed lines, runs collapsed,
the guide's lines marked, system lines centred, and the same Composer every
other thread uses. The rail now opens it instead of bouncing to the trip page.
The trip page keeps its own copy of the chat — that is the planning room, next
to the roster and the money — and both mark the thread read under
`thread_reads` key `g:<group_id>`.

**The pipeline** (`app/lib/pipeline.ts`) is the trip's own progress track, one
per kind of experience, not to be confused with `/ops/pipeline`. A trek runs
through passports, insurance and permits; a day hike gets a meeting point; a
food tour gets an address and an appetite. Stages are pinned to the booking
statuses we already store, so a shorter track skips positions instead of
falling off the end: a day hike sitting at `docs_pending` reads as "Paid".
A finished trip has no pulsing "current" dot; a cancelled one stops rather
than pretending the rest is still coming.

It shows on the group page, in the group chat, on `/groups` (compact — a list
where every row says "Planning" tells you nothing), on the guide's trip list,
and on `/trips/:id`, where it replaced a six-step ops timeline that told a food
tour it was waiting on "Documents". Rendered in `/_dev/primitives` and checked
at 360px.

Not built, deliberately: notifying a group when somebody posts. Every other
thread notifies, and fanning that out to a whole roster plus the guide is a
metered-SMS decision, not a plumbing one — see BACKLOG. Trip groups are still
absent from `supabase/seed.sql`, so a fresh clone cannot demo this; the local
container had no database to verify new seed SQL against, so it is written up
rather than guessed at.

271 tests green (new: the pipeline's stage maths, group access rules, and the
inbox carrying group threads for members and the guide), build green.
Migration 0056 needs applying — see below.

**🙋 Founder needed:** apply migration 0056 to the cloud database (`supabase db
push`, or the SQL editor) — until it runs, the guide's group thread will list
in their inbox but the group page will not open for them.

## Session — group chat learns to send email (2026-09-06)

The fan-out that was logged in BACKLOG last session is built, on top of the
email foundation from 0055 rather than beside it: `sendRichEmail`, so every
group email is consent-aware, skips blocked addresses, retries once, and
lands a row in `email_log`.

**`app/lib/group-notify.ts`** is the pure half — who is mailed, whether they
were mailed too recently, and what they missed — so the rules that decide
whether somebody's evening gets interrupted are tested rather than trusted.
**`group-notify.server.ts`** does the IO. It fires from both places a group
message can be typed: the inbox composer and the trip page.

The rules: never the author; at most one email per person per group per 30
minutes; catch-up starts at the later of their last read and their last
email, so nothing quotes lines they have already seen; system lines alone
never earn an email. The guide gets email like everyone else here — the one
place in the app where a guide is not texted, because a group of six typing
would be five SMS a message.

**Muting** is `trip_group_mutes` (migration 0057), keyed on (group, user) so
it covers the guide, who is in the chat but not on the roster. The toggle is
in the chat header — a fetcher, so muting mid-read does not move the page —
and the email footnote points at it.

`email_log` is now browsable in `/ops/data` under Messaging, which answers the
only question anyone asks about a notification: did it go, and if not, why.

283 tests green (12 new on recipients, the burst window and the digest), build
green.

**🙋 Founder needed:** migrations 0056 and 0057 still have to be applied — this
container has no database credentials, so I could not run them. See the next
session note or ask Claude to run them once a connection string is available.

## Session — two document slots, and a place to buy insurance (2026-09-06)

The Documents section on a trip asked for a name, then made you pick
"Passport or Insurance" from a dropdown before you could do either. Two
different jobs behind one form, and one of them — insurance — is a job half
the people on that page cannot do at all, because they have not bought any.

Now it is two cards, each asking for one thing: **Passport** ("the photo
page — a photo of it is fine") and **Travel insurance** ("has to cover
trekking to 5,364m and emergency helicopter evacuation", the trek's own
altitude from its route, not a generic number). Each lists what is already in
with its own status, and each has its own upload button.

Under the insurance card is **"Don't have insurance yet?"** — the area for
the insurance we intend to sell. It sells nothing: no price, no checkout, no
provider named, because none of that exists. The button emails a human, logs
the request under `insurance_interest`, and tells the trekker we will come
back with cover that qualifies. That is a working stub and a demand signal in
the same click — `email_log` now answers "how many people actually want
this?" before anyone negotiates with an underwriter. Full write-up of what the
real product needs is in BACKLOG.

The old "Insurance & TIMS" box below was asking for the same certificate a
second time; the insurance half moved up beside its own upload and the section
is now just the TIMS card.

`DocumentSlot` and `NoInsuranceYet` live in `app/components/TripDocuments.tsx`
and render in `/_dev/primitives`, so they can be looked at without a booking.
Checked at 360px. 283 tests green, build green. No migration needed —
`booking_documents.type` already allowed exactly these two.

## Session — why nobody could create an experience (2026-09-06)

Founder: "I am not being able to create dayhikes experiences and other stuff
as well." Three causes, all real, none of them about day hikes.

**The office could not create anything.** `/ops/experiences` could edit every
experience and create none — the only path into the offerings table was a
guide filling in the five-step form himself. The founder's own account is
`ops`, so from where they were sitting there was no button at all. Now there
is: `/ops/experiences/new`, the same `ExperienceForm` with a "whose trip is
it?" picker in front of it, saving as a draft and dropping the office into the
editor where the Live button already lives. One publish path, not two.
Photographs are not demanded here the way they are of a guide (3 minimum) —
the office is usually typing from a phone call and the pictures follow.

**A guide who was not yet verified had no navigation.** The tab bar rendered
only for `status === 'verified'`, so an applied or in-review guide landed on a
status screen with no way to reach Experiences, Journals or anything else.
Both of the founder's test guide accounts (`abc@gmail.com`, `xyz@gmail.com`)
are in exactly that state. The bar is now always there: publishing is gated by
ops regardless, so there is nothing an unverified guide can break by building
their listings — and a guide who arrives on the day of verification with three
trips already written is the whole point of the welcome email.

**"List a trip" opened the profile page.** The one instruction on the
unverified guide's screen led away from the thing it was asking for. It now
opens the form.

The database was never the problem: a day-hike insert with a realistic payload
succeeds (tested against the live database inside a transaction, rolled back),
and `booking_documents`/`offerings` constraints all allow every kind. What
does not exist in production is a single offering that was created through the
app — every row is seed data, `live` or `paused`, which is consistent with the
create path having never worked for anyone.

283 tests green, build green. Not verified in a live browser: writing the
service-role key into `.dev.vars` is blocked in this environment, so the ops
create page has not been clicked through against real data — the form
component is the one the ops editor already uses in production, and the insert
is proven, but the first click is the founder's.

## Session — the package, negotiated (2026-09-06)

Three asks, one thread running through them: the product assumed a trek that
somebody either books or doesn't.

**Optional extras are actually optional.** The guide's own "optional extra"
lines are tick boxes on the offering page now, priced per person for the party
on screen, and what gets ticked travels with the enquiry
(`enquiries.selected_options`) and shows on the guide's request card — "Wants:
Gear hire". The hardcoded `STANDARD_ADDONS` catalogue is gone: it moved the
total and was never charged by anything downstream.

**Custom packages** (`package_proposals`, migration 0058). The guide's request
card has a third answer between yes and no: *Suggest changes* — days, party,
start date, which options are in, one extra line of their own, and a note,
priced live as they type. The trekker gets an email and a card at the top of
My Trips, opens `/proposals/:id`, sees what moved in words and what it costs
against what they asked for, and approves — which creates the booking and goes
straight to the deposit, now **20%**.

`composePackage` and `describeChanges` are pure and tested (10 new tests):
what somebody is about to be charged, and the sentence explaining why, are not
things to work out inside a route handler. The proposal stores its own price
breakdown in the offering's shape, so `quote()` — one new optional argument —
prices it with the same arithmetic, and checkout, contracts and payouts need
no special case.

**The guide form stopped being a trek form.** Steps come from the kind (no
"The route" step containing nothing), length defaults to what that kind
usually is (a day hike opens at 1 day, not 12), and the price preview no
longer shows "Porters" and "Permits (TIMS + park)" at $0 to a food tour.
Verified in a browser: switching to Day hike gives four steps, one day, and a
day-hike price library.

Migration 0058 is applied to the live database and verified (table, RLS, three
policies, the enquiries column); a realistic proposal insert was smoke-tested
in a rolled-back transaction. 293 tests green, build green.

**Not done, and worth saying:** none of the new screens have been clicked
through against real data — this environment cannot hold the service-role key,
so the guide's proposer and the approval page have been driven only by types,
tests and SQL. The first real proposal is the test.

## Session — packages, agreed in the conversation (2026-09-06)

Most trips do not begin with the booking form. They begin with "is Manaslu
doable in October?" in a message thread, and by the time the two of them have
agreed what the trip is, the conversation is the only place it exists. Sending
them back to a listing to press "Request to book", so the guide can propose the
thing they already agreed, is a step for nobody.

Migration 0059 lets a proposal hang off a conversation as well as an enquiry
(`enquiry_id` nullable, `conversation_id` and `offering_id` added, a check that
it has one home or the other), and lets a message carry something:
`messages.offering_id` for "this is the trip I mean", `messages.proposal_id`
for a package.

In the thread now:

- **An "About" picker** above the composer, defaulting to the trip the
  conversation was opened from. What a trekker picks rides with the message and
  shows as a chip on it, so a thread stops filling up with "the 14 day one".
- **"Send a package"**, for the guide, opening the same composer their request
  list uses — days, party, date, extras, one line of their own, priced live.
- **The package renders as a card in the thread**, and the trekker's answer is
  one button: *Approve and pay $368*. Approving creates the booking and goes
  to checkout; approving and paying are one decision, and splitting them over
  two screens is where people go away to think about it.

One implementation, three surfaces: `createProposal` (server) and
`PackageComposer`/`PackageCard` (components) are shared by the request list,
the thread and `/proposals/:id`, so a package agreed in conversation is the
same object as one agreed through the booking form — same snapshot, same
arithmetic, same approval path.

Checked by rendering the thread at 380px from both sides: the guide's button
and the picker were on one row and the button clipped, so they stack.

293 tests green, build green, 0059 applied to the live database.

## Session — a guide's work did not start the day they joined (2026-09-06)

`/g/journals` could only write up a trek booked through Trek. A guide who
joined last week — fifteen years of Manaslu behind them, no bookings here —
had nothing they could write, and a journal is the one thing that makes a
trekker choose them. The old empty state told them to message the office.

The schema always allowed it: 0032 gave journals `pre_platform` and a
constraint that a journal hangs off a booking *or* that flag. Nothing ever set
it. Now the write-up card has two tabs — "A trek from Trek" (pick it, dates and
route come with it) and "One of your own" (title, the day you set off, an
optional route, and a note for the office). A guide with no bookings lands on
the second tab, because it is the only one they can use.

Honesty is the other half. `pre_platform` joins `public_journals` (0060) and
the journal page carries a line — "Pemba led this trek on their own — it was
not booked through Trek" — so a reader is never left to assume the stronger
claim. The guide's own list marks them "your own trek" too.

Migration 0060 had to append `pre_platform` after `comment_count`: `create or
replace view` can only add columns at the end, and inserting one mid-list
renames every column after it. Postgres said so, loudly, before anything ran.

293 tests green, build green, 0060 applied to the live database.

## Session — the rename (2026-09-06)

"Trek" → **Guides of Nepal**, everywhere it was the brand and nowhere it was
the noun. 136 occurrences, done by hand in explicit batches, because a
find-and-replace here produces "a Guides of Nepal from before Guides of Nepal"
and a verb that no longer means anything ("Trek Manaslu with Binod").

Changed: both wordmarks and the one in the email template, the email from-line
and postal address, every guide SMS, schema.org Organization/publisher, the
contract and TIMS-card company name, page titles, `llms.txt`, the sign-in and
apply pages, the Fund and transparency pages, and the fee row in every price
breakdown ("Our fee (10%)").

Kept: "trek" the lowercase noun, "Trek stories" (it reads as stories about
treks), `kind: "trek"`, and the worker/repo/package names — renaming the worker
would change the live URL.

New `app/lib/brand.ts` holds the name for anything that composes a string.
CLAUDE.md's header said "working codename: GMKT — rename before launch"; it now
says what the product is called and where the name lives.

Two SMS templates were trimmed to stay inside one 160-character segment — the
prefix grew by eleven characters and two messages tipped over, which would have
doubled their cost on every send.

The header needed work: at 1100px the longer wordmark pushed "Group trips" and
"Sign out" onto second lines. Nav gap tightened and the items set to nowrap;
checked at 360px and 1100px.

293 tests green, build green.

## Session — the calendar's selection was invisible (2026-09-06)

"The dates that are selected should be green outlined, this is confusing
people." They already were, in the code — `picked && "ring-2 ring-accent"` —
and it did not render, because `cn` is a plain joiner and the "free to book"
grey ring on the same button won on stylesheet order. A guide picked a
ten-day stretch and saw the two ends lit.

Each day's look now comes from one function with one branch per state, in
precedence order: past, booked, chosen, blocked, free. Chosen is a green
outline on a pale fill — distinct from booked, which is a solid green fill and
the one state a guide must never misread. The legend gained the missing row.

Rendered all five states side by side to check, because "which class won" is
not a question code review answers.

293 tests green, build green.

## Session — the photographs (2026-09-06)

"The pics are not being saved… need to be able to view images too."

**Why an upload was refused.** The endpoint decided what a file was from
`file.type` — the operating system's guess, which arrives empty often enough
(a photo shared out of another app, a file with no extension) that real
photographs were being turned away with "Photos only — JPEG, PNG or WebP".
It now reads the first bytes: JPEG, PNG, WebP and GIF are accepted on their
signatures, whatever the browser called them.

HEIC gets its own answer. It is what every iPhone shoots by default, browsers
cannot display it, and "Photos only" is a useless thing to say to somebody
holding one. The message now names it and says exactly what to do — Settings →
Camera → Formats → Most Compatible, or send it to yourself and upload the copy.
Six tests on the sniffer, including that a text file is not a photograph.

**Why they were "not saved".** The rest of the form is kept on the phone as it
is typed; the photo list was not — it was explicitly skipped by the draft
restore. A guide who uploaded six, went back to fix the price and returned
found an empty box, with the files sitting safely in storage. The gallery now
keeps its own list under `<draft>:photos`, restores after hydration, and both
keys are cleared when the form is finally sent.

**Viewing them.** Tapping a thumbnail opens the full-size viewer the journals
already use — arrows, a counter, a filmstrip. A guide choosing between four
near-identical shots of the same ridge cannot do it from an 80px crop.

Driven in a browser: uploaded state restored across a reload (2 photos, and the
hidden field that carries them into the submit), and the viewer opened from a
thumbnail.

## Session — the treks a guide has actually walked (2026-09-06)

Migration 0049 opens with "The application now asks them directly." It never
did. The table has existed since then, `/g/profile` edits it, the public
profile leads with it — and `/apply`, the one screen where the office decides
whether somebody is worth verifying, collected years, a day rate, languages
and a one-liner, and nothing about which trails they have walked.

The application now asks. A route and a count, added a row at a time; a route
already claimed drops out of the picker, and the whole list travels in one
hidden field because there is no account yet to save rows against. On submit,
the claims are checked against live routes — a crafted post cannot invent one —
and written to `guide_route_experience` best-effort, because an application
must not fail over a route claim.

`parseRoutesWalked` is pure and tested (5 cases): it deduplicates, because the
table's key is (guide, route) and a double tap would otherwise fail the insert
and lose the application; it drops a row with no count rather than inventing a
1; and it caps at the 500 the CHECK allows.

Driven in a browser: added two routes, confirmed the picker stops offering them
and the hidden field carries `[{routeId,times}]`.

302 tests green, build green.

## Session — likes, other guides' journeys, and a way back to your own page (2026-09-06)

Three things off one screenshot of the guide's home.

**"View my profile"** was a link at the very bottom, under everything. It now
sits on the same line as the greeting, which is where a guide looks when they
want to see the thing trekkers see.

**Journeys from other guides.** A guide's home was entirely their own admin.
It now carries four recent write-ups by other guides — cover, name, route, and
what they have collected — because that is the half of the product they are
competing in, and reading somebody else's is the fastest way to learn what a
good one looks like.

**Likes** (migration 0061). Journals have taken comments since 0038 — the
expensive gesture, the one that needs you to have something to say. A like is
the cheap one: one row per person per journal, so a double tap cannot inflate
it and a person can take it back. `like_count` joins `public_journals`
(appended last again — `create or replace view` only adds columns at the end),
and the button holds its state optimistically, because on a 3G connection a
count that waits for the round trip reads as a button that did not work.

Signed out, the button becomes a sentence with a sign-in link and the count, so
the page never shows a control that cannot do anything.

Smoke-tested the whole path against the live database in a rolled-back
transaction: two likes stored, `like_count` reads 2 through the view, and the
conflict clause holds.

302 tests green, build green.

## Session — what a guide is interesting for (2026-09-06)

A licence says somebody may lead a trek. It says nothing about whether they
know the birds, cook, carry a real camera, or are the person you want when a
fourteen-year-old is struggling on day four — which is what a trekker is
actually choosing between, and it had nowhere to live but a sentence of free
text nobody could filter on.

`guide_skills` (0062) with a closed vocabulary of 23 in
`app/lib/guide-skills.ts`, grouped four ways: what you know, what you do on the
trail, who you are good with, what you bring. Every label is a thing a guide
could say out loud about themselves. Ticked in /g/profile, capped at eight —
without a cap the honest guide ticks four, the optimistic one ticks everything,
and the optimistic one wins every filter.

They show as chips on the public profile, each one a link into `/guides?skill=`,
so a reader scanning four profiles for the one who knows the birds can follow
it straight to everyone else who does.

**This closes the `guide_tags` backlog item.** The homepage intent rows matched
keywords against the guide's own text — "Photographers" was a substring search
for "camera", and a guide who phrased their promise differently was invisible
to the row built for them. Four rows now filter on the skill. Keywords stay as
the fallback for a guide who has claimed nothing, so nobody disappears from a
row while the claims fill up.

308 tests green, build green. 0062 applied and smoke-tested against the live
database.

---

## 2026-09-07 — Emergency contacts, message photos, the group order, and the trekker's own profile

A long session, mostly founder-reported breakage, and two features.

**Skills picker rebuilt for scale.** The vocabulary went from 23 to 39 across
five groups (adding "how you work"), which as a column of checkboxes was a
screen and a half of scrolling on a 360px phone. Chips that wrap, a search box,
a live "n of 8 chosen" and the cap explained before it bites. The tick is still
a plain checkbox with `defaultChecked`, so it works with no JavaScript.

**Emergency contacts, both sides (0063).** Two columns had sat on `users`
since 0001 marked "trekker only", written by nothing but the ops console. Now
the trekker fills theirs in beside their documents, a guide gives theirs when
they apply and can fix it on their profile, the guide sees the trekker's as a
`tel:` link on the active-trip screen, and ops sees both. On `users`, not
`bookings`: a next of kin is a fact about a person, and it is what lets guides —
who have no booking of their own — have one at all.

**Photos in messages were destroyed by the contact masking.** The pre-deposit
mask ran over the whole body, links included, and a photo URL is a user id and
a timestamp — all digits — so every shared photo arrived as
`[number hidden]/[number hidden]-msg.webp`. Nobody could send or receive one.
The mask steps over `http(s)` links now and masks only the prose between them;
one shared renderer (`MessageBody`) shows photos as photos in both threads; the
composer holds an attachment as a thumbnail instead of pasting a URL into the
text box. The one already-broken row was repaired in place.

**Pre-trek brief, written from the trip** (`app/lib/pre-trek.ts`). Was four
lines behind the T-7 unlock — advice that arrives after the boots are bought
and the flight home is booked. Now six sections generated from the booking:
cash for this many days, altitude only above 3,000m, Lukla only for Khumbu,
restricted permits only where they apply, packing for the season it actually
is. Open from the day they pay; only the meeting point and the guide's phone
still wait for T-7, because those are the two things that change.

**The request flow, walked end to end.** A trekker could not see their own
requests anywhere, which is what makes a second request to the same guide feel
impossible — they are listed on My trips now, with a way to take one back
(0064 adds `withdrawn`). Three real bugs alongside it: `acceptEnquiry` demanded
status `open`, so a guide who proposed a package could never accept the
original request; accepting did not check the guide was still free, so two
overlapping requests could both be accepted and the second silently overwrote
the first's calendar; and the identical request sent twice made two rows.

**The group trek ran in an impossible order (0065).** A group invited
everybody, split the money and collected it, and asked the guide last — and the
gate on asking demanded every share be paid, which cannot happen, because a
share is paid into a booking that does not exist until the guide agrees. The
order is now: pick the trip → ask the guide → invite the others → everyone
pays, shown as four steps on the page. Invites are locked until the guide says
yes, a group cannot go with somebody who was invited by email and never signed
in, and an accept lands back in the group that asked instead of creating a
second group page. A guide can now propose a package inside the group's chat —
same composer, same pricing — and the organiser approves it for everyone.

**The trekker has a profile (0066).** The reviews table has carried a
`guide_to_trekker` direction since 0006, written after every completed trek by
`/g/bookings` and read by nothing. `/trekkers/:id` now shows it: what the
guides said, the treks and days behind them, and the trekker's own words for
the guide deciding whether to take the trip. Not public, and the loader is what
keeps it that way — a guide who has been asked, ops, or yourself.

**Not built, and the founder knows:** per-person payment. A group member has a
share in the database and no way to pay it; only the organiser can pay, through
the ordinary checkout.

**Founder-side, outstanding:** Workers Paid plan (the homepage SSR exceeds the
free plan's 10ms CPU limit and throws 1102 under load), `STRIPE_SECRET_KEY`
(checkout runs in mock mode and confirms without charging), `RESEND_API_KEY`
and `SPARROW_SMS_TOKEN` (nothing is emailed or texted at any step).

362 tests green, build green. 0063–0066 applied to the live database.

## 2026-09-08 — Categories, each other's clocks, everyone's own share, the safety screen, and route pages as blocks

Six things, in the order the founder asked for them. Migrations 0067–0071.

**Homepage rows come from a category, not a hard-coded list (0067).** A
category is a name, a slug, and a set of guides — hand-picked, or swept up by a
skill tag — and a guide can sit in as many as apply. `/ops/categories` builds
them and previews a draft row before it is live (0070 lets ops read the draft;
the homepage still filters on `live`). `/guides?category=` is the row's "see
all". Caveat verified against production: `guide_skills` has zero rows, so the
skill sweep collects nobody until guides tick skills. Hand-picking works today.

**Silence at 2am is not a no (0068).** The trekker in Berlin and the guide in
Lukla now see each other's local time above the thread — "It's 3:40am for
Pemba, a reply usually comes in the morning" — from a `timezone` the browser
records the first time someone opens a conversation. Nobody has one yet; it
fills as people message. The group thread shows the guide's Nepal clock.

**The track before you book.** `previewTrack(kind)` in `app/lib/pipeline.ts`
generates the "what happens after you pay" panel on the booking widget from
the same pipeline definitions the trip page walks, so a day hike and a
fourteen-day trek promise the steps they actually have.

**Everyone pays their own share (0069).** `/groups/:slug/pay` takes a member's
deposit share against a pending intent; when the shares cover the deposit the
booking advances the same way an organiser's payment did (`advanceOnDepositPaid`
extracted for exactly that). Stripe is still mock — nobody is charged.

**The safety update has its own screen, and a calendar that stops.** The
day counter on `/g` was days-since-start with no clamp, which read "day 34"
on a trek nobody closed. `trekDay` clamps to the itinerary, `/g/checkin` is a
"Safety" tab with a badge when a day's update is due, and the guide closes a
finished trek from there — completed, recap, payout.

**Route pages are blocks in a list (0071).** `route_blocks` rows carry a
kind, a sort, and jsonb data; `/ops/routes/:slug/page` adds, fills, moves, and
publishes them, and `/ops/routes` now lists every route (it listed only guide
proposals before, of which there were none). Sixteen kinds: hero, prose,
stats, climb_day, itinerary, elevation, gallery, quote, faq, guides, map,
permits, season, packing, split, cta. A page with any `climb_day` runs the
Langtang scroll engine — altimeter, palette climbing with altitude, full-bleed
day frames — lifted out of the Langtang constant into `RouteBlocks.tsx`, and
every other block sits inside that palette rather than on a white slab.
Langtang itself has thirteen blocks live; a built page wins over the
constants. `/routes` opens on a tilted terrain map of every route.

**Caveats:** a route whose day stops have no lng/lat draws no line on either
map; production screenshots are impossible from here (Chromium is
localhost-only), so live pages were verified by fetched HTML and local
screenshots at 360px and desktop.

**Founder-side, still outstanding:** Workers Paid plan (1102 under load),
`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `SPARROW_SMS_TOKEN`; and, when the
updates are done, revoke the Cloudflare token and Supabase access token and
reset the database password that were used in these sessions.

438 tests green, build green, deployed.

## 2026-09-09 — Everyone's logins

The founder asked to see every account and get into any of them. `/ops/users`,
in the ops sidebar under System, and only for `raman@greyemails.com`.

**Accounts, not profiles.** `/ops/people` reads `public.users`, so a signup
that never finished a profile appears nowhere. This lists the auth records
themselves — `admin.auth.admin.listUsers`, paged — joined to whatever profile
exists: name, role (or "no profile"), email and phone each with a copy button,
last sign-in as "3h ago" with the date under it, joined, provider, and flags
for unconfirmed and banned. Sorted by last sign-in, never-signed-in last, and
searchable by name, email or phone.

**Two ways in, because there is no third.** Supabase stores a password hash,
so "copy their password" cannot exist and the page says so. Instead: *Open as
them* mints a magic link with `generateLink` and points it at our own
`/ops/users/enter`, which verifies the token and redirects to wherever that
role lands — the route sits outside the ops layout, because by the time it
redirects the browser is no longer ops. *New password* sets a readable
three-word password on the account and shows it once, next to a link to that
person's own sign-in page with the email pre-filled (`?email=` now fills the
field on `/login`, `/g/login` and `/ops/login`).

**The gate is a list in code.** `SUPER_ADMIN_EMAILS` in
`app/lib/super-admin.ts`, checked against the signed-in auth email. Not a
column: ops can edit `public.users`, so a super-admin column is one ops
account away from being self-granted. The nav entry hides for everyone else
and both the loader and the action redirect them to `/ops`. Reasoning in
docs/DECISIONS.md.

**Caveat:** the two buttons are real actions on real accounts. *New password*
replaces a person's actual password — fine for test accounts and a locked-out
guide, not something to click on a live trekker. Both were verified by unit
tests and the deployed pages' HTML; neither was fired against a real account
from here.

449 tests green, build green, deployed.

## 2026-09-09 — The routes index, rebuilt around the shape of each trek

The founder sent a design draft for `/routes` and three asks: images,
descriptions, and the price as a range.

**The profile is the card.** The draft generated plausible-looking elevation
profiles from a seeded PRNG. It did not need to — every route already has real
altitudes in `day_stops` — so `profileOf()` builds the profile from those and
the card draws the actual climb. Poon Hill reads short and gentle beside the
Three Passes' three teeth, which is the argument the page is making.

**Images where they exist.** Seven of twenty-four routes have a photograph
(six article heroes plus one a guide uploaded). Where there is one the profile
rides its bottom edge as a white ridge over a scrim; where there is not, the
profile fills the frame. Both sit in the same aspect-ratio box, so a row of
cards does not step up and down as the photographs run out. **The other
seventeen routes need photographs** — that is a founder task, not a code one.

**The price is a range.** `priceSpread()` takes the low and high across every
guide's offering, and the card prints `$398–$463` rather than `from $398`,
which hid the nine guides who are not the cheapest. Rounded — `$397.76` is not
a number anyone compares. A route with guides but no prices says "Ask a guide";
one with no guides at all says "No guide listed yet" and shows no price.

**Also on the card:** the route's own `summary`, the grade as four filled
triangles, days and best months in fixed positions, and the real faces of up
to three guides who walk it.

**Filters are progressive.** Region, grade and sort are client state over a
list that server-renders complete, so the crawler and a phone with no
JavaScript still get all twenty-four. The bar is sticky, which means it has to
be short: fourteen region pills wrapped onto five rows and pinned a whole 360px
screen, so on a phone each row scrolls sideways and the sort collapses to a
native select.

The hero keeps the tilted Nepal map from the last session; the closing band is
forty-nine real guide photographs behind "49 people. Pick one."

**Verified** at 1440px and 360px against a snapshot of live data, and on the
deployed page: 24 cards, 48 profile paths, 17 "no guide listed yet", and the
rounded ranges. Map tiles cannot load in this sandbox, so the map itself was
not re-verified visually — it is unchanged from the last deploy.

469 tests green, build green, deployed.

## 2026-09-10 — Sign out had never worked

The founder signed out of the dashboard and got a 500, "Method Not Allowed".

The button in both dashboards was `<Form method="post">` with no action. A
form with no action posts to the page currently on screen, not to the layout
the button is rendered in — and a pathless layout is never the target of a
form post — so the sign-out action sitting in `g.tsx` and `ops.tsx` had never
run once.

What that looked like depended which tab you were on. Earnings and Messages,
and the console's Today, Verifications, Data and Search, have no action: the
post 405'd and showed the error page. Requests, the Calendar, People, Payouts
and the rest DO have actions, so the post ran that page's action, which
answered "Unknown action" — and left the session alive. The visible failure
and the dangerous one were the same bug, which is why only half of it got
reported.

Sign-out is now `/g/logout` and `/ops/logout`, each outside its gated layout
because that layout's loader demands the session the request is ending, and
each answering GET as well as POST so a typed URL cannot look like it worked.
The dead actions are gone from both layouts.

`app/routes/layout-forms.test.ts` reads every route module that renders an
`<Outlet/>` and fails on a post form with no action. The type checker cannot
see this class of bug and neither can any other test — the only place it is
visible is the source.

The build caught the tail of it: removing the actions left `supabase.server`
imported into two client bundles.

476 tests green, build green, deployed. Both routes verified live on GET and
POST.

## 2026-09-10 — One live request per trekker, per trip, per date

The founder sent a screenshot: the same trek, the same dates, twice in My trips
and twice in the guide's queue, both acceptable.

**Those rows are from 2026-09-03** — four days before the first duplicate guard
shipped on the 7th, and both bookings are cancelled now. The two enquiries
behind them were created four minutes apart while the first was still open,
which is exactly what that guard refuses. So the photograph is of a fixed bug.

**Two holes in that guard were real, though.**

It only looked at requests still *waiting* — `open` or `quoted`. Once the guide
accepted, the identical ask sailed past: the trekker asks again, the guide sees
the same trek and dates a second time, and accepting books a fortnight already
committed. `askOutcome()` now weighs a live booking as well as a live request,
and the widget says "you already have this trip booked" rather than pretending
to send.

And look-then-insert is not atomic — which is how this bug actually arrives. A
double-tap on a slow connection puts two requests in flight, both looking, both
finding nothing, both inserting. **0072** adds partial unique indexes on
`enquiries` (where status is open or quoted) and on `bookings` (where status is
not cancelled). Neither had a live violation, so both applied clean. The loser
of that race gets 23505, which the action answers as "you already asked",
because that is what happened.

Accept refuses a duplicate too, checking the bookings rather than the enquiry:
requests sent before any of this are still in guides' queues and nothing else
stops one being accepted.

Cancelled bookings and finished requests are deliberately outside every guard —
a trip that fell through can be asked for again, which is a normal thing a
person does after a no.

`acceptEnquiry` had no test at all. It has five now, the founder's case among
them, and the booking mock grew `in` and `limit` to reach them.

491 tests green, build green, deployed. 0072 applied; index predicates verified
in production.

## 2026-09-11 — The top nav says Plan an Event

"Group trips" sat two items away from the signed-in "Groups" link and meant
something different, and /events is where a trip is planned as much as joined —
the page already leads with "Organise one".

The footer link, the two back-links inside the events flow and the JSON-LD
breadcrumb follow it, so one destination carries one name everywhere the public
sees it. Two things deliberately keep the old wording: the page's `<title>`
("Group trips anyone can join"), because that is the phrase people type into
Google and search is the demand channel; and the ops console, which is the
office's own language.

The nav row is tight by design — there is a comment about items wrapping at a
1100px laptop — and the new label is two characters longer, so it was checked:
the live page served locally at 1024, 1100, 1280 and 1440 stays on one line
with no horizontal overflow. The signed-in row has more room than the
signed-out one measured here, its right-hand side being the shorter of the two.

491 tests green, build green, deployed.

## 2026-09-11 — The trek is the heading, not whose trip it is

/groups read "Odonell's trip", "Sarah's trip", "Ben's trip", with the actual
trek in small grey type underneath. You could not find the Everest one by
looking at the list.

A group carries a name of its own and neither source of it works as a headline.
A group a trekker makes by hand suggests "<first name>'s trip"
(`groups.new.tsx`). A group created automatically when a guide accepts is named
after the offering (`groupForBooking`), so those cards printed the same
sentence twice — "Patan Durbar Square heritage walk" as both lines.

`groupHeading()` puts the trek first and keeps the group's own name as the line
below, dropped when it only repeats the trek. Comparison ignores case, spacing
and apostrophe style, so "Kathmandu Momo Crawl!" and "Kathmandu momo crawl"
count as one thing. The group's own page and the invite page follow the same
shape, so arriving from the list is continuous. What to say when no trek is
picked stays with each page — the list says "No trek picked yet", the group
page offers the guide instead — rather than being baked into the helper.

Dates in those same lines were rendering as `2026-11-11`; they go through
`fmtDate` now, like everywhere else.

Verified by unit tests on the exact strings, typecheck and build. The signed-in
group pages could not be screenshotted from here.

497 tests green, build green, deployed.

## 2026-09-11 — Sending a document back, with a reason

Ops had one verb: verify. A blurry passport scan, a policy with no helicopter
cover, a passport expiring before the trek ends — all ordinary, and none of
them had an ending. The document sat unverified, the trekker's page read
"checking" indefinitely, and whether anybody had actually been told depended on
somebody remembering to send a message.

**0073** adds `rejected_at`, `rejected_reason`, `rejected_by` to
`booking_documents` and the same three to `bookings` for insurance, which is
fields rather than a file. Two check constraints go with them: a row cannot be
verified and rejected at once, and a rejection without a reason of at least
three characters is refused by the database. The reason is required in the
form and in `rejectDocument()` too — a rejection nobody can act on is worse
than no rejection, and it is the whole point of the feature.

**It reaches the trekker.** The reason shows on their own trip page, in red,
directly above the upload box that fixes it, and an email goes out naming the
document and quoting the reason. The badge reads "needs redoing" rather than
"rejected".

**The trap this had to avoid.** Uploading inserts a new row rather than
replacing the old one, so a rejected document left in the reckoning would have
kept the booking unconfirmable no matter what the trekker sent afterwards.
`confirmIfDocsComplete` now counts only live documents via `docsSettled()`, and
a booking whose every document was sent back is not "settled" — it is "nothing
to confirm", which is the same answer as an empty list.

Verifying clears a rejection and rejecting clears a verification, so a document
that was sent back and then accepted does not carry both.

Verified the trekker's view at 360px on the dev primitives page, which now
carries a sent-back document in its fixture alongside the verified and checking
ones. The ops side could not be screenshotted — it needs an ops session.

509 tests green, build green, 0073 applied and columns verified in production,
deployed.

## 2026-09-13 — The permit tracker gets filters, hand entry, and the permit itself

Three things it could not do.

**It could not be asked a question.** Every application for every upcoming
trek, sorted by which leaves soonest — the right order to work in and the wrong
one to find "what is still waiting on documents" in, which meant reading all of
it. Tabs sit beside the title now: Awaiting documents · With the department ·
Ready · Rejected, each carrying its own count so the answer is legible before
the click. Filed and approved share one tab, because "sent off and not back
yet" is one question and not two. The filter is a URL (`?show=ready`), so a
shift can be handed over with a link.

**It could not be told about a permit.** Applications only ever appeared via
the confirm trigger, so a fee paid at a municipal counter, or a permit filed
before the booking came through, had nowhere to live. There is a form now —
booking, permit, status, reference, optional scan, optional note for the
office. `stampsFor()` dates a hand-logged row the way a filed one would be, so
its history reads the same.

**0074** adds a unique index on (booking, permit) for anything not rejected:
the trigger and a person can now both reach for the same permit, and the same
permit listed twice on a trekker's trip is a question nobody can answer. A
rejected application is excluded so a refused permit can be filed again. No
live duplicates existed, so it applied clean.

**And it could not hold the permit.** The trekker's page said "Sagarmatha
National Park Entry — ready" and they arrived at the checkpost with our word
for it. Ops attaches the issued permit (photo or PDF) from the tracker row or
when logging it, and it appears on the trekker's own trip page as "View
permit", behind exactly the passport's rules: private bucket, ten-minute signed
link, the path stored and never the URL, and a route that checks the booking
belongs to whoever is asking.

523 tests green, build green. 0074 applied, columns and index verified in
production; the signed-out gates on `/ops/permits`, `?show=`, and the new
permit route verified live. The signed-in pages could not be screenshotted from
here.

## 2026-09-13 — One status filter, on every console list

People had a status dropdown at the far end of the search row: it needed a
second click on Search, said nothing about how many sat in each state, and
vanished on the Trekkers and Office tabs. The permit tracker had tabs written
three days earlier in its own idiom. Every other queue had nothing at all, so
"which guides are waiting on review" meant reading the whole of /ops/people.

**Seven lists now share one pattern** — guides, experiences, group trips,
journals, routes, incidents, permits. `StatusTabs` sits beside the title; each
tab carries its own count so the shape of the queue is readable before the
click; an empty tab is dimmed so it does not look like work waiting. The choice
lives in the URL, and every other parameter (a search term, which tab of People
you are on) rides along untouched — losing somebody's search because they
clicked "Verified" is the kind of small rudeness that makes a console tiring.

**Two things the tests hold down.** `allOf()` carries an *empty* status list,
which this module reads as "every row". Spelling out the known statuses looked
tidier and silently dropped rows whose status is null — on People, a user with
no guide record — from the one view meant to hold everything; the test caught
it. And `ops-filters.test.ts` asserts every filter set against the status
vocabulary in its own migration, both directions: no status without a tab, no
tab filtering on a status the table cannot hold, and each status in exactly one
tab so the counts add up. A status added to a check constraint and not to a
filter now fails a test instead of appearing under All and nowhere else.

**The summary lines needed care.** "3 waiting on us" on group trips, "2 waiting
on approval" on experiences, and the routes headline all counted the rows on
screen — which are now filtered, so they would have read zero the moment
somebody clicked another tab. They read from the counts, which are taken before
filtering.

**Deliberately untouched:** `/ops/pipeline` and `/ops/payouts`. Both already
lay their rows out in per-status sections, so a filter over the top would only
hide columns that are the point of the page.

The permit tracker's bespoke filter code is gone; `app/lib/permits.ts` keeps
only what is still its own.

568 tests green, build green, deployed. All seven filtered URLs verified live
(they redirect to the ops login, as they should when signed out). The signed-in
pages could not be screenshotted; the component itself was checked at 900px and
380px on the dev primitives page, which now carries it.

## 2026-09-13 — The verification queue gets two lanes and itemised checks

It held one of the two things it is named for. Guides — and only those
mid-application, since the loader filtered to `applied` and `in_review`, so a
verified or suspended guide was not reachable from this page at all. A
trekker's passport was in no queue anywhere: the only way to find one was to
already know which booking it belonged to and open that booking.

**Two lanes**, each with the console's status filter over it. `LaneTabs` joins
`StatusTabs` in `components/ops/StatusTabs.tsx` — same pill, different question
— and crossing lanes drops the status, because "applied" means nothing to a
passport and carrying it over would land somebody on an empty list they did not
ask for. Each lane's tab carries its own backlog: guides still applying,
documents still waiting.

**Guides are itemised.** The row said "4/6 passed", which told you four had and
never which two had not. Every check is a chip now — named, and stating pending
/ failed / expired where it is not passed — so "why is this one still in
review" is answered without opening anybody. The photograph is on the row, and
its absence is called out in red: a licence that does not match the face is
what this queue exists to catch. `checkLabel()` supplies the names, so the
list stays in step with `guide-checks.ts`.

**Trekker documents are decided from the list.** Pass is a button; sending one
back takes its reason inline and emails the trekker — the same `rejectDocument`
path the booking page uses, so there is one way to say no and one place the
reason is written. Opening forty profiles to approve forty passports is the
work this page now removes.

Their three states are not a column — `docState()` derives them from
`verified_at` and `rejected_at` — so `DOC_REVIEW_STATUSES` spells the
vocabulary out and joins the filter-coverage test with the rest.

573 tests green, build green, deployed. Both lanes were rendered against a
snapshot of live data at 1100px and read correctly; the live page could not be
screenshotted, as it needs an ops session.

## 2026-09-13 — My trips says which trips are group trips

The groups list was fixed on the 11th (the trek leads, the group's own name
follows). My trips had the opposite gap: a group booking looked exactly like a
solo one — trek, guide, dates — with nothing saying there were other people on
it or which group it belonged to. The word "group" appeared nowhere in that
page's loader.

The group's name now sits beside the guide's on the row, under the same rule
`groupHeading()` applies on /groups: named only when it adds something, so a
group auto-created when the guide accepted — which takes the offering's title —
does not repeat the line directly above it.

The lookup is skipped rather than asked with an empty `in()` list, since a
trekker with no bookings is the common case on this page.

Not linked, deliberately: the whole row is already a link to the trip, and an
anchor inside an anchor is invalid HTML. The trip page links on to the group.

573 tests green, build green, deployed.

## 2026-09-13 — The ask sits at the top of the group page

"Ask Pemba to take us" lived at the foot of the right-hand rail. On a phone
that rail stacks underneath everything — the money, the roster, the whole
conversation — so the organiser scrolled past their own next step, and a trip
sat waiting on nobody. It is the one action that unblocks a group: invites do
not open and nobody pays a share until the guide has said yes.

It is a banner directly under the header now, naming the next step and why it
is safe ("it costs nothing, and nobody else is asked until they say yes"), with
the button beside it. The rail keeps its step list and its explanatory line;
the duplicate button is gone, since two buttons doing one thing is one too
many. `askBlocked` still drives both the wording and the disabled state, so the
banner cannot invite a click that would be refused.

Verified at 1100px and 380px against a fixture group in the waiting-to-ask
state. That check also confirmed the 11 September heading change is live: the
page renders "Patan Durbar Square heritage walk" as the H1 with "Heritage · See
the trek · Oct 30, 2026 · 2 of 2" beneath it — the founder's screenshot of the
old order predated that deploy.

573 tests green, build green, deployed.

## 2026-09-13 — The balance was total minus deposit, not what was still owed

A group paid for a whole trek in shares — the group page said "everyone is
paid up", $54 of $54 — and the organiser was then asked for the balance again.

`runBalanceSweep` computed `balance = total − deposit`. That is right for one
person paying alone and wrong for every group: shares are recorded as payments
against the same booking, and the sweep never looked at them. Fourteen days
before departure it would charge the organiser's card `total − deposit` for
money the group had already paid in full.

The worse half was the other branch. Inside ten days the sweep cancels for
nonpayment, and it checked the date before it checked the money — so a group
that had paid for everything was in the window to lose its trip.

`outstandingUsdCents()` now counts what has actually arrived, and the sweep
asks it first: a booking whose payments cover its total is stamped
`balance_paid_at` and advanced to `docs_pending`, charging nothing; one that is
short is charged the difference rather than the whole balance. The settled
branch runs before both the instalment path and the cancellation, because a
paid-up trip must never be cancelled.

`runBalanceSweep` had no tests at all, which for the function that charges
cards is the wrong number. It has five now — paid in full charges nothing,
partly paid charges only the remainder, deposit-only charges the whole balance,
a paid-up trip inside ten days is not cancelled, and one that genuinely has not
paid still is. The mock learned `.is()`, `.not(col, "like", …)` and rows back
from `update().select()` to reach them.

Checked production before shipping: no booking was sitting in the exposed state
(`deposit_paid` with no `balance_paid_at`), so nobody was double-charged.

584 tests green, build green, deployed.

## 2026-09-13 — The trek picker, and a photo upload that blamed the wifi

**Choosing a trek on /groups/new.** Every guide's title starts with the route
they walk — "Everest Base Camp at porter pace", "on a budget", "with a
mountaineer" — so a flat list of fifty-six offerings ordered by title put eight
nearly identical lines between somebody and the trek they wanted, with the
route and the guide jumbled into one sentence.

Grouped by route now, in one native `<select>` with `<optgroup>`s: it
server-renders, needs no JavaScript, and optgroups are real on a phone. The
heading is the trek; inside it the guide leads, carrying the few words of their
own title the heading has not already said, then the length and the price.
Cheapest first within a trek, unpriced last where a missing number cannot read
as free. Day trips keep their whole titles and sit at the end.

`angleOf()` strips the route from the title, and `echoesGuide()` catches the
case that made it look silly: "Annapurna Circuit with Sunita" stripped to "with
Sunita", printed beside "with Sunita". Checked by rendering all fifty-six live
offerings through it.

The QA note asked for two dropdowns, route then guide. The founder said not to
follow it, and the underlying complaint — route and guide jumbled together —
is what the grouping answers, without a wizard.

**Photos on a group trip.** "No connection. It will still be here when you have
signal." on a working connection, and nothing uploaded.

`/api/journal-photo` demanded a guide and fell back to demanding ops. An
event's organiser is a trekker, so both threw a redirect to `/login`, the
browser followed it, and the uploader got an HTML page where it expected JSON.
`res.json()` threw *inside the same try as the fetch*, so a permissions problem
was reported as a network one — which is why it sent the founder to look at his
wifi.

Both halves fixed: any signed-in person may upload (this serves journals, ops
and now organisers), while a `guide_id` naming somebody else's folder is
honoured only for ops. And the uploader now separates a fetch that never
completed — the only thing that is actually a lost connection — from a reply
that is not JSON, which says you have been signed out.

604 tests green, build green, deployed.

**The daily safety check, where there is no signal.** "We just need the daily
safety check as a due diligence but alot of places theres no internet so he
cant do anything about it."

The screen only ever wrote today. The action hard-coded `day: today` and
refused outright unless the trek was running right now, so four days above
Namche with no bars were four days gone — and once the guide was back down
there was nothing they could do about it. The record the platform keeps for
due diligence had holes in it that no one could ever close, which is the one
thing a due-diligence record cannot have.

Guides walking out of signal is the normal condition of the job, not a
failure. So the check-in is no longer a thing that only exists on the day:
`missingDays()` lists the days of the trek with nothing against them and
`canRecord()` lets any day that has already happened be written up, up until
the trek is closed. The guide's screen shows them as "5 days still to fill in
— no signal is fine, just say so", one line each with an "All was well" button
and an optional note, on its own line so it is typeable at 360px.

Filling a day in late does not pretend it was sent on time. `wasLate()`
compares the day against when it arrived, and the ops booking page now carries
a **Daily safety check** panel: every day of the trek in order, tagged "on the
day", "filled in Sep 12" or "nothing yet". A back-filled record is still a
record — but the office can see which is which, and a gap reads as no signal
rather than no guide.

No migration: `checkins` already carries `unique (booking_id, day)` and
`received_at`, so lateness was derivable all along and the upsert had a
conflict target waiting for it.

627 tests green, build green.

**A trekker can put a face on their profile.** The profile page always showed
an avatar; nothing anywhere let the person it belongs to fill it. The only
route into `users.avatar_url` was an ops admin pasting a URL into a text box
on /ops/people/:id — so a trekker asking a stranger to walk them to 5,300m was
making that case from behind a grey circle.

New `avatars` bucket (0075), `/api/avatar`, and an `AvatarPicker` on your own
trekker profile. The upload stands alone rather than riding on the page's
form: a photo is picked, seen and done, and cannot be lost to a validation
error somewhere else on the page. A selfie carries the coordinates of wherever
it was taken, usually somebody's home, so the GPS pointer is stripped before a
byte reaches storage, and the old file is deleted once the new one is live.

The bucket is public but its select policy is not: the object endpoint serves
a file to anyone holding its exact URL, while `list()` is limited to the owner
and ops. Without that second half anyone could enumerate the bucket and walk
off with a directory of trekkers' faces, which is the opposite of what the
page promises in as many words.

Guides still cannot set their own — theirs is the public face of a verified
professional and ops holds it deliberately. Noted rather than quietly changed.

**"Permits filed" never ticked.** The step was driven entirely by the
booking's status, which cannot know anything about permits: a booking sits at
`confirmed` from the day the papers land until the day the trek starts, so the
step stayed an open circle for weeks after the permits had been issued and
were sitting in the Kathmandu office. Four live applications were at `ready`
against bookings still at `confirmed` when this was found.

`permitProgress()` reads the applications themselves — issued only when every
one of them is, and the worst news wins, because one rejected permit is the
story however well the others went. A ticked step keeps its hint, which no
other step does, because "Permits filed ✓" raises a question it has to answer:
"Issued and at our Kathmandu office. Pemba collects them — nothing for you to
do." And the step after it stops claiming they are walking when they are not.

The other end of that sentence: guides were told nothing about permits
anywhere in the app. Their trip list now says "Permits are ready. Collect them
from the Kathmandu office before you go."

**A way back in.** There was no forgot-password anywhere. Everybody here signs
in with an email and a password — trekkers, guides, the office — and a guide
who forgot theirs had one route back: ring Kathmandu. `/forgot` mints a
recovery token with the service role and sends it through our own mail, the
same machinery "Open as them" already uses; `/reset` trades the token for a
session, spends it, and drops it out of the address bar before rendering the
form. The answer is the same words whether or not the address has an account.
The link sits beside the password field on all three sign-in pages.

The admin half of that request already existed: /ops/users and
/ops/people/:id both set a password and show it to copy.

670 tests green, build green.

**The trail on the picture — the design pass.** The founder sent five
references (a terrain planner with a dotted route and pins, a split-photo
sign-in, a summit line with photographs pinned to it, two hiking apps in
sage and lime) and asked for "more of these vibes wherever possible — at
least a hundred places". docs/07-visual-direction.md records what we took
from them and the numbered list of places; this is what shipped.

The foundation is a set of primitives under `app/components/design`:
`TrailScene` draws a trek as a dotted line with labelled pins over a
photograph — or over a terrain drawing when there is no photograph, which
is most guides and many trips — from the route's real day stops;
`PhotoCard`, `Glass`/`GlassPill`, `Eyebrow` (the `::` mono-caps line),
`Chip` with an inline glyph set, `StatTile`/`StatRow`, `FactStrip`,
`ProfileWithPhotos` (the elevation line with a journal's own photographs
pinned where they were taken), `Fallback` (the contour pattern with the
guide's initial or the trip's glyph) and `AuthSplit`. Geometry is in
`app/lib/trail.ts`, tested. `Button` gains `lime`; `app.css` gains glass,
a 20px photo radius and the line-draw animation.

Applied: every sign-in and sign-up screen as the split card beside a real
route; the four shared cards (guide, offering, journal, route) in the
photo-forward shape with designed empty states; eyebrows, glyph chips,
stat tiles, region photo cards and one lime per screen across the browse
pages; trail scenes with fact strips on the route, trek, journal, trip and
event pages; stat tiles on the guide profile; photo cards on My trips;
tiles and the lime on the guide's phone. 120-odd places by the list in
docs/07 — around 260 by count of the new marks in the code.

Found and fixed on the way: `SmartImage` held every `<img>` at opacity 0
until React's onLoad fired, so with JavaScript off, or before the bundle
arrived on a slow connection, not one photograph on the site was visible.
The fade is now gated on hydration. Guide names no longer truncate to
"Pemb…" on a four-up grid.

Verified by mirroring the deployed pages and screenshotting at 1280 and
400 (Chromium cannot reach the egress proxy directly; curl can). 684 tests
green, build green, deployed.

**Catching up with the agencies on content.** The founder put our route page
beside nepalhightrek.com and trekthehimalayas.com: "there are so many things
that these guys' pages are covering but ours are not, we need to first fix
that." He was right. Their pages run to 15,000 words and answer the fifty
questions somebody has before they fly — how long is each day, where do I
sleep, is there a shower, what does charging a phone cost at 4,000 m, what
happens if I get ill up there. Ours answered about five, in 400 words.

Two kinds of content, kept apart on purpose. Route-specific — highlights, the
overview, getting to the trailhead, what the lodges are like, food, water,
extra kit — is new columns on `routes` (0076) that ops edits without a
deploy. Universal — altitude and acclimatisation, insurance, rescue, permits,
sleeping, food, money, power and signal, porters, tipping, etiquette,
responsible trekking, and a packing list — is written ONCE in
`app/lib/trek-knowledge.ts` and parameterised by the route's own altitude,
region and permits. The competitors copy-paste theirs onto every page, which
is why the same site quotes a permit at two different prices; ours cannot
drift. A 2,500 m walk is not told to buy a −15 °C down jacket or read up on
cerebral oedema; a 5,644 m one is.

The day-by-day now carries what every agency carries and we did not: metres
climbed and dropped — arithmetic on altitudes we already stored, so exact and
never written down twice — plus where you sleep and how long the day takes.
The hours are honest about what they are: an estimate from the climb, printed
as "about", until a guide or the office types a real figure, which wins. It
declines to guess at the day you arrive, the day you leave, and any day that
drops a thousand metres to finish below 2,000 m, because that is a flight out
of the mountains and not a six-hour walk.

`/ops/routes/:slug` is the founder's other ask — "inline editing capabilities
to modify route details and itineraries, allowing administrators to directly
fix any issues for the guides". Every field and a row per day, one save, no
JavaScript required; spare rows at the bottom add days and emptying a row
removes one; days renumber themselves. The Hours box shows the estimate as its
placeholder, so you can see what the page currently says and type over it. It
is linked from the routes list and from the route block inside the ops
experience editor, where the founder asked for it, and the page says how many
trips a correction will reach.

Eight flagship routes seeded with real content. Everest Base Camp went from
about 400 words to 4,600. The old markdown articles in `content/routes/`
stand down where the newer fields exist rather than repeating "Permits and
real costs" twice on one page; their FAQs are still merged.

750 tests green, build green, deployed.

**"Where to meet" was never a chore.** On a day experience the fourth step sat
as an open circle with no button under it, from the moment of booking until
the day itself — so it read as something the trekker had failed to do. The
address had in fact been agreed when they paid: "Thamel", 23 September, 18:00,
all three already in the database.

Same shape as the permits bug, so it got the same fix, generalised. A step is
now settled when the thing it describes is settled, not when the booking
reaches a later status — `settledSteps()` covers both the permits and the
meeting point, and the track moves on instead of waiting for the calendar. A
settled step keeps its hint, because a tick raises a question the line
underneath has to answer: "Meet Pemba at Thamel — 23 Sep, 2026, 18:00."

Where there genuinely is no address yet the step stays open and names who it
is waiting on, which is the guide and not the trekker. The hour comes out of
the guide's own itinerary (`meetingTimeOf`), which on a day trip is a list of
times rather than days. Group trips get all of it too — the founder asked,
and it was the same component.

765 tests green, build green, deployed.

**Sharing where you are.** "Yo make it easy for the guide to share location,
the messaging should have away manymore features than necessary."

A location rides inside the message body exactly as a photograph does, so no
new column, no new send path, and both threads — the booking one and the
group one — render it without being told. Masking already steps over whole
URLs, so the link survives the pre-deposit filter intact.

The part that decides whether this gets used: it reads the links people
ALREADY send. A guide presses share in Google Maps and pastes whatever comes
out, and `message-location.ts` takes coordinates out of Google's `@lat,lng`
and `?q=`, Apple's, Waze's, OpenStreetMap's and a bare `geo:` URI. Anything
we cannot read stays an ordinary link, which is dull but never wrong.

The card has no map tiles on purpose — this renders on a cheap Android over
3G in a lodge. What it has instead is everything you need to act on: the
words somebody typed beside the link, the altitude if their phone knew it,
coordinates you can read out over a radio, and one tap into either Google or
OpenStreetMap. The composer's pin button sends immediately; "share location"
that then needs a second press on Send is two taps for the one thing a guide
does with cold hands. Each way it can fail gets its own sentence — no sky,
no permission, no fix — because "location unavailable" tells somebody
standing in a stone lodge nothing they can do.

One thing found on the way: links in messages had never been tappable. Every
message in the app rendered a URL as dead text. Fixed for all of them.

**A pause has to say why.** "In the paused experience section there needs to
be a designated space where administrators can write down the specific reason
why an experience has been paused."

Pause was one click that left nothing behind. A week later nobody could say
whether a listing was down because the photographs were somebody else's,
because the guide was on a trek, or because a price was wrong — and the
guide, whose income it is, was told nothing at all.

0077 adds `paused_reason`, `paused_at` and `paused_by`. They describe the
pause a listing is in NOW and are cleared when it goes back up; the history
is not lost, because every pause and unpause is written to `offering_edits`,
which nobody can edit and which the guide already sees. The reason is
required in the action, not just by the browser — an optional box is an empty
box. One implementation shared by the list and the editor, so two pause
buttons can never record different things.

The paused rows carry the reason and how long it has been down, in red past a
month, which is usually somebody forgetting. The editor grows an "on and off
the market" trail. The guide gets the reason by SMS and email with the link
to the page where they fix it.

And the hole that opened once a pause carried a decision: a guide could flip
it straight back. `paused_by` tells the two kinds apart — a guide hiding
their own trip is theirs to undo; an office pause now shows them the reason
and asks them to fix it and message us. A decision anyone can reverse without
a word is not a decision anybody is tracking.

817 tests green, build green, deployed.

**The console was reading an error as "empty".** Three reports, one cause for
two of them: the booking pipeline showed 0 in every column with 29 bookings
in the database, and clicking Open on a live trek 404'd.

PostgREST resolves `trekker:users(...)` by finding ONE foreign key from the
parent to `users`. `bookings` has three — `trekker_id`, `meeting_set_by` and
`insurance_rejected_by`. The embed is ambiguous, so the request FAILS;
Supabase returns `{ data: null, error }`; every call site in this codebase
destructures only `data`; and the page renders as though the database were
empty. The second and third keys were added for ordinary features, months
apart, and nothing anywhere said they had broken twenty-one queries.

Twenty-one, across fourteen files: the pipeline, a booking's own page,
permits, verifications, incidents, ops search, ops home, the guide's
bookings, earnings, check-in list and active trek, the messages thread
header, and TIMS card issuance. `ops/people/:id` already named its key, which
is the only reason one page kept working while the pipeline beside it read
zero — and is what identified the cause.

The guard is `app/lib/embeds.test.ts`: it walks every `.select()` in the app,
works out which table each `users(` embed hangs off — the innermost enclosing
embed, or the selected table — and fails if that table is one of the seven
with more than one key into `users`. The list is the schema's, from
`pg_constraint`. Adding a foreign key can break a query in a file nobody
touched; this is the thing that now says so.

**"0 accounts" was never no accounts.** `/ops/users` reported zero with 70
auth records. The loop asked for `perPage: 1000`, and on any error at all
did `break` — so a refusal from the auth server and an empty platform looked
identical. Now it asks for 200 a page and carries the failure out to the
screen with the reason on it. Accounts created on six different days,
including today, say the auth admin API itself works, so the oversized page
is the likely refusal; if it is something else the page will now name it
rather than lying quietly.

818 tests green, build green, deployed.

**Picking your dates, and seeing the whole walk.** "I as a client should be
able to select the dates I want to go on a trek before clicking request to
book, so I can have a visual representation on the trek's timeline."

The date was a dropdown of start days. A dropdown cannot show you that a
twelve-day trek from the 20th runs to the 1st of next month, and it cannot
show you that the guide is booked on the 27th of it. Worse, nothing stopped
you asking for exactly that span — the request went in, and it failed days
later when the guide pressed accept and `clashingDays` refused. The trekker
experienced a machine's mistake as the guide letting them down.

The calendar already on the page now picks, in two modes, because the two
pages ask different questions. On an experience the trip has a length, so
clicking a start paints the whole walk and the second month appears when the
trip runs into it — a timeline two thirds visible is not one. Days the guide
is free but which are too late to START a trip this long are dimmed rather
than hidden: the guide IS free then, and a calendar that contradicts the day
beside it is worse than one that explains itself in a tooltip. On a guide's
page there is no trip yet, so it is a free range — first day, last day — and
the dates travel into the message as a draft to edit and send, instead of a
blank box and "September sometime?".

The rules are in `app/lib/date-span.ts` rather than in the grid, so what a
span is, whether it is clear, and which days can start one are testable
without a browser. The server now checks the whole span too.

836 tests green, build green, deployed.

**Take action on a flagged message, and two sections instead of one.** The
moderation page had a single button, Dismiss, so the only thing the office
could do about a guide handing out a WhatsApp number was to pretend it had
not happened. It now has warn / suspend / ban, each with a required reason
that is sent to the person word for word, and the flagged list is split into
guides and clients — genuinely different problems that one mixed list made
look identical.

An action that restrains nobody is theatre, so `requireUser` checks for a
live block on every signed-in request rather than only at the login screen;
somebody suspended at ten in the morning has a session cookie that would
otherwise last them the week. `/suspended` tells them what was decided and
why. Suspending a guide pauses their listings and remembers their prior
status, so lifting puts them back where they were. A failure to READ the
block list lets people in — the safe direction is not shutting the platform.

0078 also writes out `account_blocks`, which existed in production with no
migration and no code using it.

**"Nothing shows up — in app or through email."** Two faults, one symptom.

The email was real, correct, and had never once left the building: all 39
emails this platform has ever composed are logged `skipped / no_api_key`.
Not a bug — `RESEND_API_KEY` is not set in Cloudflare.

The in-app half did not exist. No table, no bell, no page. The only channel
the platform had was an email it could not send, so a trekker whose guide
had just accepted found out by going and looking at My Trips.

Rather than adding a notify() call beside forty existing sendEmail() calls
and forgetting some, the notification is derived from the email at the moment
it is composed — every transactional email already knows who it is for, what
happened, and the one link to follow. It is written BEFORE the branch that
needs the API key, which is the whole point: the app can tell people things
while the email channel is down, which is the state it has been in since the
first day. The href is read out of the email body, so there is one place
stating where a notification goes.

0080 backfills from `email_log`: 39 things people were supposed to be told
and were not, handed back to them unread, because that claim is true.

877 tests green, build green.

**"How did you hear about Guides of Nepal?"** Asked of every guide who
applies, because for a guide-first marketplace the answer is the business.
Guides do not arrive from advertising; they arrive because another guide told
them, and knowing WHICH guide is the difference between a channel you can
grow and a number on a dashboard.

So the referral answers carry a second question — who? — and that name is the
valuable half. Stored in two columns rather than one free-text box, so the
channel can be counted and the person can be named. The other options exist
to keep the referral answer honest: without "Facebook" on the list, everyone
who saw a post picks "a guide told me" because it is closest.

Required, and checked on the server as well as in the browser — a field half
the applicants skip tells nobody anything, and `required` is a courtesy
rather than a rule. The name box is always visible rather than revealed by
JavaScript: a guide on a cheap Android should not need a script running to
answer a question.

It is shown where it is useful rather than filed away: on the row in the
verification queue that decides whether to verify them, because "Pemba sent
me" is both a reference and a channel, and as a one-line roll-up above the
queue. Anyone who applied before the question existed is counted nowhere —
they are not "somewhere else", they are not data.

895 tests green, build green.

## 2026-09-14 — What happens if they cannot come, said under every Book button

A trekker in Berlin is about to send money to a stranger in Nepal for a walk
four months away. The one question in their head is not on the page: what if
I can't come? Every competitor answers it beside the calendar. We answered it
nowhere.

So the widget now carries two blocks under the dates — what the deposit does,
and what happens if the trip is cancelled — plus a full policy page behind
them. The free-cancellation window is named, with the date it ends for the
dates they actually picked, because "free cancellation up to 30 days before"
is a rule and "free until 12 October" is an answer.

Every number in that copy is produced by running `computeCancellation`, not
typed. A refund policy that says one thing on the page and does another in
the refund is worse than no policy on the page, and copy drifts from code the
moment they are allowed to disagree.

907 tests green, build green, deployed.

## 2026-09-14 — One filter panel for guides, experiences and routes

Three browse pages had grown three different filter layouts, none of which
fit a phone. They now share one panel that opens over the page, with the same
filters that were already there — nothing new to learn, one place to learn it.

Built on `<details>` rather than React state, so it opens, filters and
submits with JavaScript off, which is the state of every crawler that decides
whether we rank. Verified with JS disabled.

922 tests green, build green, deployed.

## 2026-09-14 — Maps: one pin per place, real ground, and a route that reads

The founder found the bug by using the thing: on Annapurna, Day 2 and Day 11
are the same village, so pin 11 sat on top of pin 1 and the numbers appeared
to skip. Days sharing a place are now one pin listing every day it serves,
and pins that merely crowd each other are nudged apart — never far enough to
lie about where the village is.

The basemap went from flat vector tiles to Esri satellite imagery with a
terrarium DEM under it, hillshade, and sky. A trek map whose background is
grey does not sell a mountain.

Two bugs of the same family were fixed under it. The route was drawn on
MapLibre's `load` event, which never fires when tiles are slow or blocked —
so on a bad connection the map arrived with no route on it, silently. It
draws on `styledata` now. And the route included the flight home, which drew
a straight line across the country and made an eleven-day walk look like a
mistake; travel legs are excluded from the walking line and the bounds.

Honest limit: this sandbox's software GL does not draw MapLibre line layers
(proved with a bright red test line through known coordinates that also did
not appear). Pins, terrain, hillshade and imagery were verified in a browser
here; the trail line itself was not, and needs the founder's eyes.

959 tests green, build green, deployed.

## 2026-09-14 — The homepage map stops counting and starts introducing

The map on the homepage showed bubbles with a number of guides per district.
That is a statistic. Nobody books a bubble, and the whole positioning of this
company is that you pick a person, not an agency — so the largest element on
the front page was arguing the opposite case.

It is now a trail atlas: pick a trail, meet the people who walk it. Satellite
terrain, the trail on it, and the guides who work it standing on the map as
faces. Tap a face, get a card, go meet them. A slow auto-tour moves between
trails until the viewer touches the map, then stops for good — an ambient
thing that never fights the person using it.

The join is deliberately two-tier and deliberately visible. A guide who
actually sells an offering on that route gets the chartreuse ring; a guide
whose listed regions merely cover it does not. `guide_route_experience` had
two rows in it and was useless; offerings→route covers 44 guides across 7
routes, and regions carry the rest. The distinction is kept in the UI because
the alternative is implying someone is bookable on a trail when they are not,
and that is the one promise this marketplace cannot break.

Guides sharing a trailhead are fanned around a circle so faces never stack —
the same bug as the day pins, one level up. MapLibre only loads once the
section approaches the viewport, since most visitors never scroll that far
and it is 1.2 MB. With JavaScript off the section is a list of trails and the
guides on them, which is what a crawler needs anyway.

Verified in a browser at 1100px and 390px: the fly-to, the faces, the names,
the sells ring, the rail, the satellite relief. On mobile the rail was hidden
entirely behind the two-line attribution bar — the control for the whole
experience, invisible — and now sits above it. The trail line itself is still
unverifiable here (see above) and wants the founder's eyes.

985 tests green, build green, deployed.

**Correction, same day.** The first deploy of the atlas ranked trails by total
guide count, which is the wrong number. The rail opened with six Annapurna
trails all reading "18 guides", led by Annapurna Base Camp — which nobody
sells. Everest Base Camp and Langtang, with seven and ten guides selling them
today, were pushed down or off.

The weak "works this region" link had quietly become the ranking signal, so
the front page led with the trails you cannot book, on the page whose whole
argument is that you can book a person. And "18 guides" under a trail with no
sellers is true in the way that misleads: nobody reads it as "eighteen people
in the general area".

Sellers now decide the order and the regional count is only a tiebreak; the
label says which number it is ("7 guides" vs "18 in the region"); the regional
fill is capped at six faces, because twelve ringless faces read as endorsement
whatever the ring says; and the tour visits a trail somebody sells first. The
rail now opens Mardi Himal, Langtang, Annapurna Circuit, Everest Base Camp,
Manaslu — four regions, all bookable, verified on the deployed page.

Worth noting for next time: the first check of the live page showed the old
rail, because Cloudflare had cached the HTML. A cache-busted request showed
the truth. A verification that reads a cache is not a verification.

991 tests green, build green, deployed.

## 2026-09-14 — Everyone on the map, and a search box that only knows Nepal

"The map should show all the guides. Make it small so it does not look
cluttered, no mark, clean mapping, search a place feature."

The atlas was showing only the guides on the trail you happened to be looking
at, and rebuilding every marker whenever that changed — so the country was
empty between trails and the faces flickered on each step of the tour. All 48
placeable guides are on the map now, always, and the markers are built once
and restyled rather than torn down.

The uncluttering is a size rule: a guide nobody is looking at is a 22px dot at
72% opacity with no name on it, a guide on the active trail lifts to 40px, and
the one you tapped goes to 48px. Measured in a browser, not eyeballed. Fifty
faces at 22px read as a scattering of people across a country; fifty at 40px
with labels was the mess being complained about. The face is the label.

Tapping anybody now lights every trail THEY walk rather than only the selected
one — the reverse of the rail, and the thing that makes having everyone on the
map worth the pixels: the country becomes browsable by person, which is the
positioning.

Search is deliberately not a geocoder. A general one needs a key, a rate limit
and a round trip per keystroke, and answers "Base Camp" with somewhere in
Alaska. This searches our own gazetteer — 24 trails, 166 located villages
lifted from the itineraries, the regions, the districts our guides live in.
Instant, offline, and every hit is somewhere this company can actually take
you. Names fold past case, accents and punctuation, because Ghorepani reaches
us spelled three ways and a search that only matches our spelling tells people
we do not go there. A village on four itineraries is one row reading "On
Annapurna Circuit and Nar Phu Valley", not four identical rows that look like
a bug.

Verified at 1200px: 48 faces, 12 lit, 10 carrying the sells ring; rings
measured at 22 and 40px; "manang" and "namche" both resolve and fly the
camera; an unmatched query says so rather than listing the country. The guide
card was sitting under the attribution bar — the same bug as the rail, one
week later — and now clears it.

## 2026-09-14 — Asking a stranger when they are coming, and making them an account

Three seconds after somebody lands, the one question that decides everything
downstream: when are you coming to Nepal?

Most people cannot answer it, and that is the whole design problem. So there
are three first-class answers — exact dates, a season, and "no idea yet" — and
the third is the one that matters. A popup that will not let you say "I don't
know" teaches people to type a date they invented, and then the business plans
around fiction. "Just looking" is real data about a real visitor and is stored
as itself rather than as a made-up date we would go on to act on.

Then the email, and the account is made for them: no password chosen at a
popup, no second form. What they get is a row and a sign-in link. Nobody is
signed in by this and the account is created unconfirmed, because anybody can
type a stranger's address into a popup — an account you can use because
someone else typed your email is a hole, not an account. Clicking the emailed
link is what proves the address.

The lead is written FIRST and everything after it is allowed to fail. Creating
an auth user can fail for a dozen reasons outside our control, and somebody
who has just said they are coming in October is worth keeping whether or not
Auth was having a good afternoon. An email that already has an account is
found and never touched.

Season windows roll over properly and are tested rather than typed: asked in
December, "autumn" means next year; asked in January, "winter" is the one you
are standing in; February knows about leap years. The read-back in the dialog
is generated from the same function, so what they are told we heard cannot
drift from what we saved.

marketing_consent stays false. The copy promises no newsletter and the row
agrees with the copy.

Verified against production rather than a mock: three real posts to the live
endpoint created two accounts and three intent rows with the right
mode-specific fields, the second answer from a returning email reused the
existing account instead of duplicating it, a bad submission returned both
problems at once, and GET returns 405. In-app notifications landed for all
three. The emails logged `skipped` — RESEND_API_KEY is still unset, which is
exactly why the notification is derived from the email rather than sent beside
it. All probe rows, users and auth users were deleted afterwards and the
deletion verified.

1044 tests green, build green, deployed.

## 2026-09-15 — The map becomes the product

Six changes, and one correction to something I had written down wrong.

**Guides stand on the trek they run.** A face used to sit at the centre of its
guide's home district. True, and useless: it piles everybody around Kathmandu
and says nothing about a walk. Choose a trek and the people who run it now
step onto the route itself, spaced along the line by DISTANCE rather than by
vertex — a rest day in Namche is one vertex and a twenty-kilometre valley walk
is another, so stepping by index bunches four faces into whichever part of the
trek had the most short days. Eleven guides in a row along the Everest route
say "these people walk this path" in a way no legend can.

**Contrast is the whole point of selecting something.** Guides on the chosen
trek take a dark green outline at 42px; everyone else goes light green, 16px,
desaturated, 40% opacity. The earlier version merely dimmed them, and half-lit
faces beside lit ones read as a rendering fault rather than a decision.

**Outside Nepal is dimmed.** The map was giving half of India and a slab of
Tibet the same weight as the one country the whole company is about, so the
eye had nowhere to land. The first attempt used a world-spanning polygon with
Nepal as a hole; it looked right in a pitched close-up and vanished completely
when the camera flattened — a polygon that large, carrying a hole, does not
survive being cut into tiles at low zoom, and it fails by disappearing rather
than by erroring. It is a regional box now.

**Altitude is drawn, twice.** Contour lines, generated in the browser from the
elevation tiles the hillshade already loads — no key, no new provider to go
down, 3.4 kB gzipped and lazy — because lines close together is the one
language every walker already reads. And an elevation profile of the selected
trek, because Everest Base Camp and Mardi Himal both "go up" and only one of
them goes up for a fortnight. A summit height is a number; the profile is the
shape of getting there, and it is the most decision-useful thing we know about
a trek.

**No stray words.** The Esri reference-label overlay is gone. It was scattering
half-drawn district names across the mountains, including one that read
"7 4 2". The map now carries exactly one label: the name of the trek, along
the trek.

Two silent failures fixed on the way, both of the same family as the
`load`-event bug from last week — things that fail by doing nothing. The style
had no `glyphs`, so every `symbol` layer on this site has been drawing text
into the void, which is why the routes map has never once shown a trail name.
And the routes map was re-adding a `dem` source the shared style already
owned; that throws, and the `catch` sitting beside it swallowed the loss of
its own terrain.

**A correction.** I previously recorded here that this sandbox cannot render
MapLibre `line` layers. That was wrong, and it had me writing off work as
unverifiable for a week. It cannot load any source that needs MapLibre's Web
Worker. Proved by putting a bright red fill over the whole country and getting
zero red pixels, with `isSourceLoaded` false for a geojson source whose data I
had just read back from the console — and the same with terrain switched off,
which ruled out draping. Raster imagery, the DEM, hillshade, colour relief and
terrain all render here; geojson and vector sources do not.

So the trail lines, the contours and the dimming mask are verified in the
founder's browser and by arithmetic, never by a screenshot from here.
`nepal-border.test.ts` proves the mask contains Kathmandu, Pokhara, Lukla and
the far west and excludes Delhi, Lhasa, Gangtok and Bihar — which is a better
check than looking at it anyway.

What WAS verified visually, at 1280×900 and 390×844: 48 faces, 11 lit in pine
at 42px, 37 hushed in chartreuse at 16px, standing in a line along the Everest
route; the profile reading "Highest: Kala Patthar · 5,644 m"; no lit face
hidden under the trail rail at either size. On a phone the profile panel was
sitting on top of the trail rail — burying the one control that picks a trek,
which is the worst thing a supporting panel can do — and now stacks above it.

1076 tests green, build green, deployed.

## 2026-09-15 — Two sessions, one worker

The founder asked why the live site had "gone 100 steps back". It had: the
homepage was showing the pre-rename "Trek." wordmark and the old count-bubble
map. Not a cache — two Claude sessions have been building this repo in
parallel from a common ancestor (`96a2429`), both deploying to the same
Cloudflare worker. Whichever finished last is what the public sees. Mine went
out at 23:53; the other line went out at 23:57.

Neither branch contained the other: 91 commits against 28. Worse, both had
independently built in-app notifications AND the deposit-and-cancellation
block under the calendar — the same features, twice, by two agents who could
not see each other.

Rather than start a redeploy war, both heads were pinned as branches nothing
writes to (`backup/2026-09-15-*`). Annotated tags were the first choice; the
session token is scoped to its own branch and cannot push tags, so branches
created through the GitHub API stand in. `docs/PARALLEL-SESSIONS.md` records
the split.

The part git does not protect: **migration numbers 0059-0068 are each used
twice**, for unrelated migrations, and three features were built on both
sides with different numbers. Production was checked and is intact — one
`notifications` table, and `account_blocks` a workable hybrid whose `kind`
check happens to allow the `warned` value the moderation feature needs. That
was luck. Two sessions writing DDL to one database is not safe in general.

By the end of the day the other session had started committing to THIS
branch, which is the convergence we wanted; its work was rebased in and both
lines now build and deploy together.

## 2026-09-15 — The password you can say down a phone line, and a record that you did

`/ops/users` could already mint a random password. What it could not do is set
a CHOSEN one, which is the case that comes up: a guide on a phone in Namche,
on a call, who needs something they can type now. Reading out
"juniper-lantern-marigold-4417" down a bad line is not that.

Typed passwords are checked for what goes wrong when a human fills in an admin
box in a hurry — too short, the same few characters, an invisible leading
space, or one of the words people reach for when they think a password is
temporary. Temporary passwords are the ones that live for two years.

Setting a password and signing in as somebody were the two most dangerous
capabilities here and neither left any trace. `admin_actions` (0084) records
who, whom and when, and deliberately never the password — not hashed, not
masked, not a prefix. `auditNote()` takes no password argument and a test
asserts its arity, because a function that cannot see the secret cannot leak
it. RLS on, zero policies: an audit log the audited can edit is not one.

0085 then dropped its own foreign keys. There are no orphan auth accounts
today, but the first one would fail the FK and go unrecorded — and a broken
account is exactly what an admin reaches for.

Two smaller things. "Forgot it?" beside the password label was easy to miss;
all three sign-in pages say "Forgot password?" now. And `/forgot` was telling
people to check an inbox that could never receive anything: RESEND_API_KEY is
unset, so every reset link for the life of this platform has gone nowhere. It
says so plainly now — checked after the work above so both paths take the same
branches, and worded as a fact about our mail setup rather than about the
person, so it still leaks nothing about whether an account exists.

## 2026-09-15 — A food tour is not a trek

A food tour in Kathmandu was headed "A few quick things before the trek", and
underneath it told the customer to bring shoes with grip because "Nepali
trails are stone", and warned them about the sun "at this altitude". They were
going out to eat.

Everything here was a trek once, so the word got written into headings and
advice as though it were the only thing we sell. `tripNoun()` decides the word
once — trek, hike, food tour, tour, day out, and "trip" for a kind nobody has
taught it about yet, which is true of all of them.

The non-trek brief split by kind instead of being one lump. A food tour gets:
come hungry, say what you cannot eat BEFORE the day so the route can change
rather than your dinner, drink only what your guide hands you, shoes you can
slip off at every door. A city tour gets temples, uneven brick and valley
dust. A day hike keeps the walking advice, because for a hike it is right —
and a low hike no longer warns about altitude it never reaches.

Wrong advice is worse than none: it teaches people the brief is boilerplate,
and then they skip the section that mattered.

## 2026-09-15 — Making the admin area cheap to add to and hard to break

"Make sure the backend admin area can be built easily." The cost is not the
typing — it is that the two ways to get an ops screen wrong both fail
silently, and a silently failing admin page still renders.

This area has shipped that bug three times. `/ops/users` said "0 accounts" on
a live site with 71. `/ops/pipeline` showed nothing with live treks in it. A
live trek opened as a 404. Every one was `const { data } = await admin...`,
which throws the error away. The write side is worse: a rejected update
returns a result rather than throwing, so a failed save and a successful one
are indistinguishable and the ops person simply clicks again. A count found
**33 writes across ops that never check whether they worked.**

So the correct version is now the shorter one to type: `rows()`, `one()`,
`write()`, `writeAll()` in `app/lib/ops.server.ts`, each taking the thing in
the reader's own words and handing back a sentence instead of a blank page.
`knownCause()` translates the four failures this codebase actually hits,
including the embed ambiguity behind all three incidents.

`app/lib/ops-pages.test.ts` fails the build when a new ops page fires an
unchecked write, or is added to the router but not the sidebar — reachable
only by typing the URL. It was proved by injecting that exact mistake into a
page, watching the test fail, and restoring. The allowlist of pages written
before the helpers is a ratchet: a name that no longer offends, or no longer
exists, fails the test.

`docs/OPS-PAGES.md` is the recipe, and CLAUDE.md points at it.
`ops.incidents.tsx` is the worked example — including rendering the error,
because a stored error nobody displays is still silent. On that page it is
the difference between "nobody is in trouble" and "we cannot see who is".

The other 16 legacy pages were deliberately left: a 16-file refactor would
have collided with the other session mid-flight. The ratchet converts them as
they are touched.

## 2026-09-15 — Whose calendar is it

"I can see my own free dates, but I cannot tell whether the guide is free or
not." Two faults, and the calendar had both.

It never said whose availability it showed. The key read "Free" and "Taken" —
free for whom? On a guide's page it is the guide's diary, so it says "Pemba is
free" and "Pemba is booked" now, in the legend, the tooltips and the
screen-reader text. All three callers already had the name and none were
passing it.

And the two states were nearly the same colour: free a tint at 15% opacity,
booked plain text at 40%. Two pale greys, on a phone, to somebody who has
never seen this calendar. Free is now filled, outlined and bold; booked is
struck through. The strike carries as much as the fill, because colour alone
is not a label.

Nothing changed about what the calendar knows. The open days were always
there. They were indistinguishable, which for the question this widget exists
to answer is the same as being absent.

1188 tests green, build green, deployed.
## Session — handover from the second session (2026-09-15, closing)

This session ran in parallel with the one that owns this branch, and that was
the mistake behind most of today's confusion: two agents, one Cloudflare
worker, one database. Five deploys reverted each other and the live site
flipped between two different applications depending on who pushed last. From
now on there is one session and one deployer. Everything below is on this
branch and verified.

**Verified by running the app, not just by tests.** `wrangler dev --local`
against the production database, every public page loaded, and the specific
claims checked in the rendered HTML — because a green build says nothing about
whether a page renders. Three checks failed on the first pass and one of them
was a real bug (below).

Pushed here today:

- **The card price is now the page price.** A card priced the trip with the
  guide fee split four ways — `min(max_party, 4)` — while the trip page opens
  at the party the trip allows, almost always one. Pemba's Everest trek was
  advertised at $157 and charged at $1,148. `app/lib/list-price.ts` is the
  single definition — "what this page will say when somebody lands on it" —
  and the card, the route card's range, the route headline and the picker all
  read it. Verified live: comparison table $1,148, trek page $1,148.08, card
  $1,148. "from" is gone, because it promised a floor and then showed a bigger
  number one click later.
- **Before-you-go is a briefing, not twelve accordions.** The icons were
  assigned from whatever the design system had spare, so a tick meant
  insurance *and* money and a spark meant rescue *and* food *and* charging;
  behind them sat 8,000 characters nobody clicked twelve times to read.
  Grouped by when each answer matters, and shown.
- **The route page's price breakdown is now who sells the walk** — every guide
  on the route with their own angle, days and price, sorted, cheapest marked.
  A breakdown explains a real quote on a trip page; on a route page it
  answered a question nobody asked.
- **The day list says what each day does to you.** The descriptions were
  written and stored all along ("Into the gorge") and the row hid them. Now
  open, plus what the altitudes mean — the first night above 2,500m, a
  sleeping gain over the 500m-a-night guidance, the highest night, what a rest
  day is for — each derived from stored altitudes against published guidance,
  with the rule printed.

**The bug that only a real page load found:** the first-night-above-2,500m
warning fired on a *crossing*, so Everest Base Camp — which starts at
Phakding, 2,610m — said nothing at all. The routes that fly straight into
altitude were the ones getting no warning. Fixed and tested both ways.

**🙋 Founder — what is NOT on this branch.** The other branch,
`claude/new-session-vereu4`, holds 25 commits that were never merged, and
`docs/MERGE-HANDOVER.md` there lists them in priority order. Two matter:

1. **A request to book is still lost when a trekker signs in.** `/enquiry`
   redirects to the login page and drops the form; they come back to an empty
   one. This loses bookings and the fix is five self-contained files.
2. **Nine homepage bugs** from Pratik's list — the guide's name truncating
   before the district, cards in a row not lining up, five different "see all"
   labels, "1 guides", the map opening over India — are fixed there, not here.

Also standing: no `RESEND_API_KEY` and no `SPARROW_SMS_TOKEN` on the worker,
so no notification has ever been delivered by email or SMS;
`guidesofnepal.com` has been stuck `initializing` in Cloudflare for hours with
the registrar side correct, and needs "Check nameservers now" pressed; and
Workers Paid at $5/month would end the Error 1102 class of failure rather than
just making it rarer.

---

## 15 Sept 2026, evening — the card's last line, and the trip page's missing tier

### The guide's rating, in place of a pricing footnote

Every experience card ended with "per person · less in a group". It is true of
every card on the site, so it carried nothing, and it spent a card's last line
on a pricing footnote on a platform whose argument is that you pick a person.
That line now reads `★ 4.9 (12)`.

`app/lib/card-rating.ts` never invents a number. A guide with no reviews is not
a 0.0 and not a blank: it falls back to "New here · 14 years guiding", or "No
reviews yet" where we do not hold the years.

**A bug this uncovered.** The fallback shipped dead — `guide_years_experience`
was not on `public_offerings` at all, so all 38 review-less cards on
`/experiences` read "No reviews yet", including for guides with twenty-year
careers. Nothing failed: an unselected column is `undefined`, and `ratingLine`
treats undefined years as "no years" by design, so there was no type error and
no runtime error. The guard test reads the select strings themselves, because
neither the compiler nor Postgres will complain about a column nobody asked
for. Proved by dropping the column and watching it fail.

Live now: 18 cards with stars, 38 with "New here · N years guiding", none with
"No reviews yet".

### The trip page

The momo crawl page was a hero photo, a "What you'll do" containing one line,
two included items and one review.

**Most of the fix was already written.** The other session built it on
`claude/new-session-vereu4` and handed it over in `docs/MERGE-HANDOVER.md` §5.
`app/lib/offering-details.ts` came across wholesale with its 19 tests; the
rendering was re-applied inside this branch's design system, which is what that
doc asks for. Added: getting there and around, how hard it is in words, the
languages on the trip, who it suits (cautions last, with a different mark), a
trip reference, the questions people ask as `<details>` plus `FAQPage` data
emitted only where a guide has answered something, the rating spread rather
than only its mean, the guide's numbers under their name, a breadcrumb a reader
can climb, and two rails at the foot of a page that was a dead end.

**The day-by-day is new.** Measured on production: every live trek carries one
itinerary entry or none, while the route it walks holds a full set of day
stops. "Everest Base Camp, the classic 14 days" answered "what do I do for two
weeks?" with one line, with fourteen days of the answer one table away.
`app/lib/trip-itinerary.ts` falls back to the route's stops when the guide's
own is thinner than the trip is long, and the page says whose plan it is — a
route's standard stages printed as this guide's own is a small lie that becomes
a complaint on day three. A guide's words still win at half length. Langtang
now shows eight days with altitudes; it showed one line this morning.

### Migrations

0088 adopts the other branch's columns (0066 there, renumbered), 0089 the
backfill. Both were already applied to production from that branch and every
statement is idempotent, so this is the history catching up with a schema the
database has had for a day.

0087 was corrected in the same session it was written. It had been built by
copying the view definition live in production, which already carried those
nine columns — so a fresh clone would have failed on a view referencing columns
nothing had created. It no longer mentions them; 0088 re-creates the view once
they exist.

### 🙋 Founder — the thing behind "the website went 100 steps back"

The two branches have now diverged to **111 commits here, 33 there**, and both
sessions deploy to the same worker. Whoever deploys last decides which of two
different applications the site is. That is not a theory: it is why the
experience page looked thin to you this evening — this branch was deployed, and
the sections were on the other one. Three of those 33 commits are now ported;
thirty are not, and `docs/MERGE-HANDOVER.md` §1 is still the expensive one — a
booking request is lost when a trekker signs in.

`MERGE-HANDOVER.md` §7 is the rule to adopt: **one deployer.**

Also still standing, unchanged: no `RESEND_API_KEY` and no `SPARROW_SMS_TOKEN`
on the worker, so password resets and trip-intent links go nowhere. And the
Cloudflare API token, the Supabase personal access token and the database
password are all in these two transcripts and want revoking once the updates
stop.

Green: typecheck clean, 1267 tests, `npm run build` passing, deployed.
---
## 2026-09-16 — The journey page, rebuilt from its own altitudes

Pratik reviewed a journey page (`/journals/:slug`) and sent ten design notes.
Loading it in a real browser against production found an eleventh, worse than
any of them: below the cover photograph the dates, the weather note and every
tag were **white type on cream paper** — invisible on the live site. The
caption had been pulled up over the photo's foot with `-mt-16`, which covered
the title and nothing else.

What changed, against his list:

- **Squeezed to the left.** Four container widths on one page became one
  `SHELL`. The article column is a reading measure with the sidebar beside it,
  so the page is centred rather than shoved left, and every left edge — cover
  title, day one, the elevation graphic, the closing panel — is the same.
- **The right column.** It was empty from day three down. It now opens with
  **On this page**: every day as a link, grouped by chapter. Plain anchors, so
  it works with JavaScript off; verified that day 10 lands 96px down, clear of
  the sticky strip, both by hash and by click.
- **Repetitive.** `chaptersOf` breaks the trek into the four moments its
  altitudes mark, with a rule and a day range. `dayShape` gives the hard day,
  the highest day and each chapter's first day a **feature** frame — deeper,
  and wider than the prose on a big screen — and puts a short one-photograph
  day **beside** its picture instead of above it.
- **Weak hierarchy.** Chapters are a tier above days now (pine, 34px) rather
  than the same size; body text is 17px on 1.75 line-height.
- **The hero.** The whole caption sits inside the photograph over its own
  gradient, with the cover taller on a phone so the title clears the drawn
  trail line, and real clearance from the bottom edge.
- **Photographs inconsistent / too small.** One gap everywhere (was 8px for a
  pair and 12px for four). A pair went from 4/3 — 250px deep in a reading
  column — to 4/5.
- **The booking action arrives very late.** **Plan this trek** is now in the
  sticky strip at the top, and a **Still reading** strip sits in the pause
  before the high days.
- **Disconnected boxes near the end.** "How high, and when" is a heading with
  a line of explanation in a frame, not a 13px eyebrow over a floating
  graphic; the two closing quotations sit under "The last word".
- **The foot looked unfinished.** The dark band had its offer in the left half
  of a full-bleed section and the right half empty, which is what read as an
  unfinished container. It is two columns now: the offer, and the guide with
  what this story is evidence of.

The one item **not** from his list that this also fixed: the hard day's ember
rule used to indent that day 22px right of every other one. It hangs in the
margin now.

One thing this session got wrong and then fixed: the first pass put `DAY 6 ·
4,410 M` in mono caps above each day's title — fifteen captions over fifteen
headings, which is precisely the pattern the `:: LABEL` purge removed after
the founder said it "makes the website feel a lot AI". The day and the
altitude are metadata, so they sit *below* the title now, in mono and not
shouting, which is also where the altitude was before any of this. The two
markers that survived that purge upstream ("The hard day", "Walk it
yourself") are left exactly as they were.

Also dropped: the second, unlabelled copy of the elevation sparkline in the
sidebar. With "How high, and when" now a titled section in the article and
the day index directly above it, a caption-less graphic in a card was the
disconnected-widget problem rather than a fix for it.

`app/lib/journal-reading.ts` is a pure module with 23 tests, including the
real Everest and a trek that starts at its own high point. Suite: **1,310
tests in 89 files, green**; `npm run build` green. Every screen above was read
off a real browser render against the production database at 1440px and
390px, on all four journals that exist — and with JavaScript disabled, where
the day index still has its fourteen links and `#day-10` still lands 96px
down, clear of the sticky strip.

---

## 2026-09-16 — Pratik's three empty ops screens

Three screenshots: `/ops/users` reporting "0 accounts", `/ops/pipeline` with
six empty columns, and a live trek opening as a 404. These are, word for word,
the three failures already written down in `docs/OPS-PAGES.md` and in the
header of `app/lib/ops.server.ts` as having shipped before.

**What production actually holds**, read with the service-role key:

    users (auth accounts)   72
    bookings                35   — 11 completed, 11 confirmed, 9 cancelled,
                                   2 pending_deposit, 1 active, 1 docs_pending
    the booking he opened   exists, status `active`

So the board should show 2 / 0 / 1 / 11 / 1 / 11 and nine cancelled badges.

**I could not reproduce any of the three.** I ran each page's literal select
string — copied out of the route, not paraphrased — against the same database
with the same key: the pipeline's returns 35 rows, the booking detail's
returns its 1 row, `listUsers` returns 72 accounts. Every column the queries
name exists. My first theory (the `guides(users(...))` embed being ambiguous —
twelve tables join guides and users, so it is a plausible PostgREST refusal)
is wrong: that select works. The live worker is several commits behind, so the
likeliest answer is simply that it is stale.

Which is the actual problem, and it is not a query: **these pages cannot tell
anyone why they are empty.** I spent a dozen steps guessing at a cause the
screen already knew and had thrown away. So:

- `/ops/pipeline` reads through `rows()` and renders the failure above the
  board; its status-advance button goes through `write()` and reports a
  refused update instead of reloading unchanged, which reads as a dead button.
- `/ops/bookings/:id` separates "no such booking" from "the query failed" —
  the 404 now fires only when the read succeeded and found nothing — and its
  seven panel reads go through `rows()`/`one()` with one line naming any that
  failed. An empty Documents panel on a real trek is the passport check
  silently not happening.
- `app/lib/ops-pages.test.ts` already ratcheted the write side. Its header
  listed the swallowed *read* as failure #1 and never checked for it, so it
  has a `LEGACY_SILENT_READS` ratchet now: eighteen pages with their counts
  recorded, failing if any rises, and zero allowed on anything new. Plus
  three assertions specific to these bugs — that a captured error is
  rendered and not just stored, and that a refused query is never answered
  with a 404.

Eighteen pages are still on the old pattern; the list is in that test and the
worklist is in `docs/BACKLOG.md`, worst first (`ops.people.$id` and
`ops.routes.$slug.page` at five each).

**Deployed** — version `39ccf1b0`, the first deploy from this session. The
previous one was `2116a607` at 23:42 the night before, so everything from
today (the journey page included) had been sitting on the branch unreleased.
Verified live afterwards: the journey page's chapters, day index, mid-page
offer and metadata-below-the-title all render, with zero uppercase captions;
`/routes/everest-base-camp` now carries the altitude warning it was silently
missing; and ten pages including the three ops screens return 200.

Worth noting for the ops three: Pratik's screenshots are watermarked **11
Sep**, five days before this session. Migrations 0066–0068 and a long run of
fixes landed in between, and today's database answers all three of those
pages' queries correctly. So they were most likely already fixed. What was
not fixed is that nobody could have told — which is the part this commit
addresses.

The worker has five secrets set: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `CRON_SECRET`. There is no
`RESEND_API_KEY`, no `STRIPE_*` and no `SPARROW_SMS_TOKEN`, which confirms
from the platform side that no email or SMS has ever been delivered.

Green: 1,344 tests in 89 files, typecheck clean, `npm run build` passing.

---

## 2026-09-18 — Trek Ops Phase 1: making the trip page tell the truth

Raman's "Trek Ops" spec sets its own order: *"Phase 1 — fix the trip page.
Real payments, calculated status, one permits model, validation. Staff must
trust the numbers first."* This session is that, minus Stripe, which he asked
to leave until last.

**Five things were found wrong before anything was built**, each verified
against production rather than assumed:

1. **Anyone could book a trek for nothing.** `MockStripe.retrievePaymentIntent`
   returned `"succeeded"` unconditionally, the checkout action called
   `fulfillDeposit` on it, and the live worker has no `STRIPE_SECRET_KEY`.
   Closed first, on its own commit.
2. **One passport confirmed a booking for six.** `docsSettled` read
   `live.length > 0 && live.every(verified)` — no document type, no head
   count — and confirming fires the permit trigger.
3. **Blue TIMS cards were issued for routes with no TIMS permit.** Five of the
   six issued. `issueTimsCard` checked the booking existed and insurance was
   verified, and nothing else.
4. **The board could be dragged anywhere.** `/ops/pipeline` wrote
   `String(form.get("next"))` with no whitelist; pending_deposit → completed
   was one click.
5. **Nothing ever wrote `active`** except that drag, so a trek on the trail
   could sit in the wrong column for a fortnight.

**What shipped, in order.**

*Free-booking hole* (`12f0508`) — mock Stripe answers
`requires_payment_method`; both checkout actions refuse with a 503 that says
nobody was billed.

*Layout* (`8074928`) — itinerary collapsed to one line, the duplicate cost
table removed, conversation and logistics into a sticky rail.

*Validation and the insurer picker* (`f39d104`) — `validate.ts` (19 tests),
`evaluatePolicy` moved server-side, and 0098 collapsing "world nomads" and
"wolrd nomads" into one. Found on the way: the booking whose insurer is
literally **"xyz" is insurance-verified and has a TIMS card issued against
it**.

*The traveller roster* (`52e17ff`, `ea63125`) — 0099 `booking_travellers`,
0100 backfill (8 leads, 21 documents attached, 5 superseded, nothing deleted),
0101 `superseded_at` so a replaced document is not read back to the trekker as
a rejection. `travellers.ts` (19 tests). Roster panels on the trip page and
the ops booking page; both upload forms pick a person instead of asking for a
name. `trip-readiness.ts` counts papers per person: "Passports checked (1/2)"
where it used to say done on the first upload.

*One permits model* (`9dfdcfc`) — 0102 `permits.code`. `issueTimsCard` asks
the route whether TIMS applies, refuses by name where it does not, and on
success writes the permit application too so the two models cannot disagree.
The blue-card panel folded into the permits list. `saveRoutePermits` upserts
instead of delete-then-insert, which would have died on the first edit to any
route with an application against it.

*The checklist as rows* (`f7cc28b`) — 0103 `trip_tasks`, `task-template.ts`
(the spec's 30 trek and 13 experience tasks as data, 14 tests), `tasks.ts` (10
tests). Ops work it grouped by stage; the trekker sees "Before you go" with
their rows first and ours underneath.

*Derived status* (`5271aaf`) — `booking-status.ts` (21 tests) and its server
half. Twelve hand-written `status:` writers now ask one function. Rejecting a
document re-derives, which it never did. `runStatusSweep` runs daily and is
forward-only.

**Checked against production before each deploy.** The status sweep moves
exactly one of the 38 bookings — an `active` trek whose dates have passed.
The money fact had to read `balance_paid_at` before counting payment rows,
because every booking made before Stripe was configured carries the stamp and
no rows at all; counting rows alone would have reported all thirteen live
bookings as unpaid.

**Still open, for Raman.**

1. **Stripe test keys and the webhook endpoint** — §2 of the plan, left until
   last on his instruction. Nothing on the platform can take money until they
   exist.
2. `RESEND_API_KEY` — no email has ever been sent, so every notification in
   the spec is a no-op.
3. **The Khumbu question, unanswered on purpose.** Everest Base Camp and Gokyo
   Lakes carry a Sagarmatha park entry and a Khumbu municipality fee and no
   TIMS row, while five blue cards have been issued against Everest bookings.
   Either that permit list is missing a row or those cards should not have
   gone out. Not guessed at.
4. Go-ahead to delete the 10 junk `trip_groups` rows (migration 0093 is
   written; the bulk delete was blocked twice and a loader-level filter is
   hiding them meanwhile).
5. **Rotate the Cloudflare API token, the Supabase personal access token and
   the Supabase database password** — deferred by him until the updates are
   done, and the updates are now done.

Green: 1,715 tests in 118 files, typecheck clean, `npm run build` passing,
deployed (`e1681530`).

### Later the same day — a checklist builder

Raman: *"lets build a checklist builder we need different checklist for
different areas, for guide verification, for different types of guides
verification, for experience, for bookings of day experience and trek
experience."*

The checklist shipped that morning (0103) was the right shape and the wrong
ownership — it was thirty rows in a TypeScript file, and he cannot deploy. So
the lists became data.

- **0105** — `checklists` and `checklist_items` are the template;
  `trip_tasks` is generalised into `checklist_tasks` with a subject, so a
  booking, a guide and an experience all run lists through one model.
- **0106** — six lists, 93 steps. The two booking lists are generated from
  `task-template.ts`, so the seed and the ops spec cannot drift. Guide
  verification splits into core / trekking guide / day guide or host. Putting
  an experience live gets its first list ever.
- `/ops/checklists` — write a list, copy an existing one, add and reorder
  steps, set who owns each and when it falls due. `/ops/checklists/:key` is
  the builder.
- The same panel on the booking, guide and experience pages, because it is
  the same thing run against three subjects.
- Deleting a list that is already running is refused: switch it off instead,
  which stops it being handed out and leaves the history readable.

Found and left alone on purpose: **nothing in the data says what kind of
guide somebody is.** `guides` has a tier and a list of regions and no type. So
the core list starts itself, ops picks the trekking or day list, and
`applies_to` is a label rather than a rule until guides carry a type.

Green: 1,744 tests in 120 files, typecheck clean, build passing, deployed
(`095f30d2`).

---

## Session — the guide's own screen (items 7, 8, 9)

### A verified guide on the marketplace could not be booked

Chasing "let the guides calendar be open from the start" turned up a live
bug rather than a preference. `availability` only ever records what happened
to a day; nothing in the app writes a row meaning "free". The booking server
reads that silence as free (`clashingDays`); every page that shows or searches
guides read it as busy. Consequence in production:

- Every guide who joined through the real application form has **zero**
  availability rows.
- **Laxman shah — verified, one live experience — could not be sent a booking
  request at all.** His trek page rendered "No open dates right now" *in place
  of* the request form, and he was absent from every dated search.
- The 49 guides whose calendars worked were seed data (271 rows each).

Fixed by making the read side agree with the booking server: a day is open
unless a row says otherwise, out to a one-year horizon. New pure
`app/lib/open-days.ts` (18 tests); every reader inverted to query taken days
and subtract — `openRunsByGuide`, the trek page, the public profile, the
matcher, the guide dashboard, the ops person page. `clashingDays` and
`g.calendar.tsx` needed no change: both already believed this.

Two more caught on the way. `/match` was ranking availability off a silently
truncated query (`.limit(5000)` against ~17,500 rows). And `supabase/seed.sql`
now stores only blocked days, so a fresh clone has production's shape instead
of one that hides this class of bug.

- **0111** — realigns the partial indexes with the question now being asked
  (taken days, per day and per guide) and puts the rule in a table comment.
  Rows with `status = 'open'` stay valid and mean the same as no row, so
  nothing needed backfilling.

### Home is one list now

Six tiles, two full-width cards and a pair of stat tiles became a single
column of plain sentences (`app/lib/guide-home.ts` + `components/guide/
HomeList.tsx`, 9 tests). "Your experiences" and "Booked trips" — the pair
doing the most damage — are "Trips you offer" and "Trips you're leading".
Every string goes through `copy.guide.home`.

The tab bar went back to five: "Experiences" does not fit in sixty pixels at
360px, and it is the one tab nobody is waiting behind. "Journeys from other
guides" is gone from `/g`, as asked.

"Get more work" lost its open-days line — after the fix it would read "89 open
days" for everybody — and gained the line that is now the true reason a guide
is not being found: no trip listed means not on the site (0110).

Green: 1,848 tests in 122 files, typecheck clean, build passing.

### Applied and deployed, and checked on the live site

`0111` applied over the Management API; `availability_day_taken_idx` and
`availability_guide_taken_day_idx` exist, `availability_day_open_idx` is gone.
Deployed as version `10424b14`.

Verified against production, not just locally:

- **Laxman's `/treks/gokyo` went from nothing to 354 bookable start days** —
  22 Sep 2026 through 8 Sep 2027, which is right for a 12-day trek with the
  three-day lead time and the one-year horizon — and renders "Request to book"
  where it rendered "No open dates right now". He now appears in
  `/guides?from=&to=` and `/experiences?from=&to=` a month out.
- **Nothing regressed for the seeded guides.** Pemba's held and booked days
  are still excluded from his one-day experience, his free days still offered.
- **`/g` signed in as a guide**: seven rows, "Trips you offer" / "Trips you're
  leading", live badges (7 upcoming, 1 question, 2 unreplied reviews); five
  tabs on the bar; none of "Your experiences", "Your journeys", "Booked
  trips", "Block dates", "Journeys from other guides" or the duplicate footer
  link anywhere in the HTML. "Get more work" no longer counts open days.

One thing worth writing down: `scratchpad/` was **not** in `.gitignore`, and
this session stages with `git add -A`. Checked the whole history first — no
token has ever been committed — and added the line. Two of the three
Cloudflare tokens supplied turned out to be invalid against Cloudflare's own
verify endpoint (they came from a screenshot, and `O`/`0` and `l`/`1` are not
distinguishable in that font); the one from earlier in the conversation, in
text, worked.

---

## Session — guide money (items 14 and 1b)

### What the database said before anything was written

- 12 payouts, **all `payable`, none ever `paid`** — about ₨896,000 owed across
  8 guides.
- **Not one of those 8 had a `payout_account` check row.** 8 such rows exist
  in the whole database and none belongs to anyone owed money.
- **0 `payout_proof` documents**, because no guide has ever been able to
  upload anything: `uploadGuideDocument` had one caller and it was an ops route.
- 4 of 56 guides with no payout method, 5 with no account number, 5 with no
  name on the account.
- `/ops/payouts`, the screen that pays people, selected `method` and nothing
  else — no account, no name.

### Built

- **`app/lib/payout.ts`** (21 tests) — the plain-English predicates both the
  guide's page and the ops ledger read from.
- **`/g/payout`** — method with a real blank option, the number labelled for
  the method chosen, bank + branch when it is a bank, the name on the account,
  the QR, and (verified only) a PAN. Blank clears; switching to a wallet nulls
  the bank fields.
- **`/g/doc/:docId`** — a guide opens their own paper. Signed for ten minutes,
  logged as `guide_self`, 404 for anything that is not theirs.
- **`/ops/payouts`** — every payable row now shows the full payment
  instruction, what is missing, whether the account was ever checked, and the
  QR. Rows we cannot pay are not ticked. Its silent read and silent write are
  gone, and it is **out of both `ops-pages.test.ts` allowlists**.
- **`g.profile.tsx`** keeps the day rate and loses the payout fields — a price
  belongs with the profile, a payment instruction with the money.
- **0112** — `payout_bank_name`, `payout_branch`, `pan_number`; `pan_card`
  added to the document kinds; an index for the newest QR per guide.

### Checked on the live site, not just locally

- A bank account with no bank name is refused; a complete one saves, and the
  bank and branch persist.
- **A JPEG posted as `application/octet-stream` — the phone-share case — was
  stored as `image/jpeg`.** `payout_proof` documents went 0 → 1.
- The owner opens the QR (302 to a signed URL, one `guide_self` access-log
  row); another guide gets 404.
- Switching to eSewa nulled the bank name and branch.
- PAN: letters refused, wrong length refused, nine digits accepted and the
  check moved `not_required` → `pending`. An unverified guide sees no PAN
  field but still gets the payout form.
- `/ops/payouts` renders all 12 rows with their instructions — and immediately
  surfaced that **Binod Tamang and Lakpa Sherpa have bank accounts with no
  bank name**, three payable rows that cannot be paid as recorded.

Green: 1,870 tests in 123 files, typecheck clean, build passing. Applied and
deployed (`90764b95`).

---

## Session — four screenshots (and one already fixed)

The bank-name note was shipped earlier the same day; checked on the live site
and left alone.

### Built

- **`/apply` regions**: a hint line in both languages, **Solukhumbu added** to
  the region list (Pikey Peak could never have a guide without it), and the
  draft bug fixed so ticks survive leaving the page.
- **Trails, typed not scrolled**: new shared `app/components/RouteField.tsx` —
  a grouped `<datalist>` over the 24 routes — replacing the flat A–Z select in
  *both* the application form and the profile, which had separate pickers.
- **Chips**: `MAX_SKILLS = 8` shared → `MAX_PER_GROUP = 3`, each group showing
  its own allowance. The save now reports what it kept instead of truncating
  silently.
- **Voice**: `VoiceRecorder` + `app/lib/voice-recording.ts` (16 tests). Record,
  hear it back, re-record, send. Feature-detected after mount, renders nothing
  where it cannot work, file picker never hidden.
- **`AuthSplit`**: a wordmark link home — one file, six sign-in screens.

### Three bugs the browser found that the tests did not

Chromium would not trust the agent proxy's CA, so earlier sessions had no
browser at all. Importing the bundle into the NSS store fixed it, and the
first real run immediately paid for itself:

1. **The voice upload was refused.** Chromium reports
   `audio/webm;codecs=opus`; the route and bucket allow-lists hold bare types.
   `400 Sound files only`. Now stripped, and pinned in a test.
2. **Regions still vanished on reload** after the first fix — the restore
   handed values to components that read them only at mount.
3. **And still vanished after the second fix** — the draft save effect did not
   depend on the form snapshot, so a checkbox tick never wrote a draft at all.

Each was hidden behind the one before it, and none was visible from the SSR
HTML, because this form renders its steps client-side.

### Checked on the live site

- Typing "eve" in the trails picker → Everest Base Camp, Everest Three Passes,
  Everest View & Tengboche. A trail we do not list warns; a real one does not.
- 24 routes in 12 region shelves, with the English glosses.
- Five regions ticked, full page reload, **all five still ticked**.
- Posting 5 chips in one group and 3 in another keeps 3 + 3 and answers
  *"Saved 6. 2 ticks did not fit — 3 to a group."*
- A four-second recording made in the browser: uploaded `200`, stored `.webm`,
  saved, and playing on the public profile.
- Home link present on `/ops/login`, `/login`, `/g/login`, `/forgot`.
- 360px throughout, no horizontal overflow.

Green: 1,890 tests in 124 files, typecheck clean, build passing. Deployed
(`661a2c7a`).

---

## Session — five screenshots: licences, the card, the experience page

### Built

- **Licence by kind** — `app/lib/guide-licence.ts` (12 tests) + migration
  **0113** `guides.guide_kinds`. The form asks what you will take people on
  before it asks for papers, then asks for the card that work actually needs.
  Public copy rewritten in eight places from "licensed" to "licensed for what
  they lead", because the old claim stopped being true.
- **The guide card** — the `~42 min` chip gone (it was never computed; the
  seed typed it), what the guide runs in its place, reviews down beside the
  rate. `app/lib/offering-kinds.ts` (6 tests) replaces five copies of the
  same label list.
- **The trek page** — an Overview section that finally reads the route's own
  `overview` and `highlights` (there since 0076, rendered nowhere a buyer
  looks); one titled "What's included" with both columns; the price box's
  colliding heading renamed; the elevation curve and Day-N pins off the hero,
  which is the carousel now, auto-rotating and pausing on hover/focus/touch.
- **`/apply` sidebar** — the six reasons to guide with us, translated into
  Nepali, beside the live earnings figure.

### Checked on the live site

- `/guides`: no `~42 min` anywhere; cards read "Treks · Day hikes",
  "Treks · Food & culture · City walks".
- `/apply` as a **food host**: "No licence needed", no licence number field.
  Switch to **trek**: the field appears under "Trekking guide licence".
- `/treks/ebc-classic-with-pemba`: Overview carries the route's full text;
  "In the price" / "Not in the price"; no `trail-line-draw`, no Day-N pins
  over the photo.
- The benefits panel renders on the application.

Green: 1,911 tests in 126 files, typecheck clean, build passing. 0113 applied,
deployed (`c2cdf45f`).

### Not done, and why

The photographs. 57 live experiences share 14 photos; day hikes, adventure and
city walks have none at all; 24 routes share 7 images and nine of them show
the same generic file. The Everest Base Camp hero is a forested gorge with no
mountain in it. The founder's answer: *"All of the guides and experiences that
we have rn are place holders chill"* — so the gallery is built and waiting,
and real photographs are a content job, not a code one.

---

## Session — the Viator round, part two

Five items from two annotated comparisons against Viator plus three lines of
text. Four were real work; the fifth turned out to be a switch, not a feature.

### 1. `/routes` is one grid

Twelve regions over twenty-four routes meant **seven shelves held exactly one
route** — a heading, a rule and a lone card in a three-wide row, seven times
down the page. Worse, the page disagreed with itself: the shelf counts were
built from the list minus the three featured routes while the filter bar
counted all twenty-four, and the sort control only ordered *within* a shelf.

Region is a filter now, in the `FilterSheet` that was already on the page,
alongside the three other questions people ask of a trek: how hard, how long,
and what month they are coming. The length buckets split the twenty-four
3/7/8/6; the month list is built from the data, so January is not offered
(nothing is in season) and June to August comes back with three, which is the
honest answer about the monsoon.

The page also ended on the same green face band the site footer already ends
on — two identical bands, same headline, same sentence, stacked. Gone, with
the fifty-four-avatar query behind it.

### 2. The homepage review

One quotation on a half-screen stock photograph of Gokyo, in a square-cornered
card pulled up over the left third of it. The photograph had nothing to do
with the review, the right half was empty, and the quotation named nobody and
linked nowhere — so the most persuasive thing on the page was the one thing a
reader could not act on.

Three now, each about a different guide, each with that guide's face, name,
rating and the trip they led. `topReviews()` keeps the floors `featuredReview`
already applied and passes over a second review about a guide already quoted:
Pemba has the two strongest reviews we hold, and three quotations about one man
argues for Pemba rather than for a marketplace of fifty-six.

### 3. Trip facts on the trek page

> "The section directly below the images includes details like timing, pickup
> availability, discounts and English language availability, and a 'Why
> travellers love this' block."

We held nearly all of it, scattered: the meeting point two screens down, how
hard it is at the very bottom under "Other details", the languages beside it,
the party size only inside the booking widget. One block now, under "Message
Pemba for free".

`app/lib/trip-facts.ts` shows only what a trip has filled in. Viator's row
includes "Mobile ticket"; we issue no tickets, so there is no such line and a
test says there never will be. "Cheaper with more of you" appears only where
`computeExperiencePricing` actually returns less per person at max party than
at min. A 4:30 start — the most consequential fact about a sunrise hike, on no
page until now — sits under the duration.

### 4. A slider on the experience card

`public_offerings` carries `cover_photo_url` and no photo array, so a card had
one picture even where a guide had uploaded five. One batched `offering_photos`
select feeds all seven places that render a card. `Carousel` gains
`size="card"`. Three things the browser caught that a test could not:

- the title link stretches an invisible `::after` over the whole card, so the
  arrows sat under it and a tap opened the trip instead of turning the photo;
- the guide chip overlaps the photo's bottom edge and was sitting on the dots;
- every frame is in the DOM at opacity 0 and all of them get fetched — one
  hero can afford that, twelve tiles × five photographs over 3G cannot. A card
  renders the frame on screen and the next one, and always the first.

### 5. Categories: the system existed and was switched off

The whole thing shipped in 0067 and worked. What did not exist was a way to
reach it from a guide: eighteen action intents on `ops.people.$id.tsx` and not
one mention of categories, so putting one guide in five rows meant opening five
panels on the category page and scrolling the whole roster in each.
`guide_categories_guide_idx` was created for that query and used by nothing.

Also fixed: `guide_categories.sort` was dead — `membersOf` has ordered by it
since 0067 and no screen ever wrote it, so every hand-pick sat at 100.

And the reason it looked missing is now said out loud on both screens. All four
categories were drafts with nobody in them, so the homepage went on showing the
hard-coded rows from `intents.ts` and nothing done in ops changed anything a
visitor could see.

### Checked on the live site

- `/routes`: one grid of twenty-four, "All 24 routes", no lonely shelves, one
  face band.
- The homepage review band at 1280 and 360. **At 360 the cards rendered 447px
  wide and were silently clipped by an ancestor's `overflow-hidden`** — no
  scrollbar, just cut words. The grid column was floored by the nowrap "led
  their &lt;trip&gt;" line; `min-w-0` on the grid items.
- `/treks/ebc-classic-with-pemba`: eight facts and the review block, at 1280
  and 390.
- An experience card on `/experiences`: arrows on hover, the photo turns over,
  the URL does not change. With JavaScript off, two frames in the DOM and the
  first one visible.
- **Categories end to end**: one guide into three rows with positions, two more
  guides into one of them, that row switched live, and the row appeared on the
  homepage above the built-in ones with the guide first. Put back to a draft
  afterwards — which rows go live is the founder's call, not a test's.

Green: 1,957 tests in 128 files, typecheck clean, build passing. No migration
this session.

### Waiting

Five phone screenshots arrived mid-session and are queued: show-password on the
client sign-in, a way to close the booking calendar, a reminder notification at
every pending step of a booking, a document upload button that looks like a
button, and the "Departing between From – To" filter.

**The credentials still need rotating** — the Supabase token, the two
Cloudflare tokens and the database password.

---

## Session — five more from the phone

### The calendar arrows were fighting the calendar

> "The button to change the calander month is not working proerly only shows
>  two months and gets stuck in september"

A real bug, and a satisfying one. Two rules in `DatePick` fed each other:
`showMonths` asked whether the trip's end month differed from the month **on
screen**, so paging changed the size of the window as well as its position;
and an effect followed the chosen date whenever it fell outside that window,
with no way to tell a date arriving programmatically from one the reader had
just paged away from.

His exact case, a one-day trip on 25 Sep 2026:

- **›** → October → `showMonths` flips to 2 → 25 Sep is outside → snapped back
  to September inside the same commit. The arrow was inert.
- **‹** → August → `showMonths` flips to 2 → September is still in the window
  → it sticks, and draws **two months for a one-day trip**.
- **‹** again → July → outside → teleported back to September.

Two reachable views, `{Aug+Sep}` and `{Sep}`, which is his report word for
word. `vitest` here is `environment: "node"` with no DOM setup, so the fix
went where a test can reach it: `spanMonths`, `pageMonth`, `canPage` and
`shouldFollowDate` in `date-span.ts`, the last of which is the bug written
down as a predicate — never follow a date that has not changed.

The bounds turned out to matter as much as the fix. `availableDays` stops at
the 365-day horizon and `AvailabilityCalendar` draws anything it does not hold
as struck-through "booked", so **working** arrows would have walked into a wall
of months the guide is not busy in. Paging stops at this month and at the last
open one, with the arrow visibly disabled rather than dying quietly.

### A guide could not find the way in

Two screenshots, one problem, and the numbers are the argument. At 390px the
homepage is **24.5 screens** tall and held exactly **two** links to `/apply`:
the masthead's, which is `display: none` below 1024px, and one **twenty
screens down**. A guide opening the site on a phone had no way in.

- The menu card was already a link; it simply had no arrow, no hover and no
  prefetch under five browse rows that had all three. It is the sixth row now,
  in the same idiom, saying "Guide with us" — the founder's own observation
  that the laptop's wording was the clearer one.
- The laptop's link was `text-ink-soft`, the quietest thing in a row holding a
  filled Sign up. An outline, not a fill.
- A one-line band after the numbers, at **1,194px — a screen and a half in**.
  A line and not the section: "Your name on the work" stays after the Split,
  because a recruitment pitch above a trekker's first guide fails the one-line
  test.
- The footer said "Guide with us" → `/hosts` while the header said it →
  `/apply`. One label, two destinations. The footer's is "What you'd earn
  guiding" now.

### A wordmark is a way home

`g.tsx:133` was a plain `<span>` — a guide three steps into the experience
editor had the browser's back button and nothing else. It goes to `/g`.

`ops.tsx:110` had the same defect plus one more: it still read **"Trek Ops"**,
the last visible pre-rename wordmark in the UI and exactly what `brand.ts`
exists to have eliminated. It reads `BRAND` now and links to `/ops`.
`AuthSplit` records this same bug being fixed once for the sign-in screens;
both dashboard shells were missed in that pass.

### Checked on the live site

- A one-day experience: **Sep → Oct → Nov → Dec** and back, one month at a
  time, never drawing two, Previous disabled at September.
- A 14-day trek: **Nov 2026 → Sep 2027**, thirteen presses, Next disabled at
  the horizon, the chosen span untouched throughout.
- The homepage at 390px: first `/apply` link now at 1,194px, was 16,331px.
- The menu at 390px: "Guide with us" as a display-size row with the arrow.
- `/ops`: wordmark links to `/ops`, reads "Guides of Nepal — Ops · Grey Floor
  Pvt. Ltd.", fits the 224px sidebar, and "Trek Ops" is gone from the page.

Green: 1,982 tests in 128 files, typecheck clean, build passing. No migration.

### Not verified

The guide wordmark is a `<Link to="/g">` and typechecks, but I have no guide
password so it was not tapped on the live site. Likewise the booking-step
reminders from earlier today: the logic is tested and every column it reads
was checked against the live schema, but no booking has moved since, so none
has fired yet.

### Blocked

**Stripe.** `getStripe` falls back to a mock whenever `STRIPE_SECRET_KEY` is
absent, which is the state of the live worker — the two banners on the
checkout page are correct and there is nothing to fix. Raman is sending the
test keys; when they land, walk a deposit end to end and watch the "document
needed" reminder fire.

**Rotate the credentials** — the Supabase token, the two Cloudflare tokens and
the database password.

## 19 Sep 2026 (second session) — the card field, and one address for the site

Raman asked to "get Stripe live, then Resend". Stripe turned out not to be a
configuration job.

### The domain came up on its own

The last session left `guidesofnepal.com` stuck: Cloudflare's zone was
`initializing` and its nameservers were refusing queries, waiting on a button
only Raman could press. It resolves now — `liberty`/`bjorn.ns.cloudflare.com`
answer, and both the apex and `www` serve the worker with a 200. That
unblocked everything below that mentions the domain.

Still true, and still worth doing: the apex, `www` and
`trek.raman-7d9.workers.dev` all serve the same pages with no redirect
between them, so there is no canonical host. The canonical *tags* now all
agree (see `SITE_URL` below), which is the half that protects the SEO; a
redirect is the other half and is not built.

### Stripe: the key was never the missing piece

Nothing in this application had ever asked anybody for a card. The checkout
created a PaymentIntent, drew a button, and on submit asked Stripe whether
that intent had succeeded — which the mock always said. Real keys would have
answered `requires_payment_method` forever. Adding `STRIPE_SECRET_KEY` on its
own would have converted a clearly-labelled mock into a checkout that told
every trekker "Payment didn't complete. Try again.", permanently.

So the card step was built, on both flows that take money — the deposit
checkout and a group member's share. `app/lib/card-payment.ts` holds the
deciding: `outcomeOfStatus()` is the single place a PaymentIntent status is
read, so the browser and the server cannot reach different conclusions about
one payment — the failure mode there is a charged card, a page saying it
failed, and somebody paying twice. `CardPayment.tsx` mounts Stripe's Payment
Element inside the existing `<Form>`, so the action receives what it always
received and still re-reads the intent from Stripe before fulfilling.

`retrievePaymentIntent` now returns the client secret too. The checkout
reuses a pending intent across reloads and only ever stored its id, so
without it a reload became a page you could not pay on.

### A group member's share would have confirmed the whole trip

Found while checking which webhook events to register. Every intent carries
the booking id, a share included, and the webhook read that id and called
`fulfillDeposit` — which marks the entire booking paid. The first of eight
people to pay their share would have confirmed the trip for all of them.

It had never fired because the webhook refuses to run without real keys.
It would have started firing on the day they were added. Intents now carry
`metadata[purpose]`, and `shouldFulfilDeposit()` decides. A share still has
no webhook backstop if the browser dies mid-payment — crediting one needs the
member and the share arithmetic the webhook has no access to — so that is
written down in BACKLOG.md rather than half-built.

### One address for the site

Every email and SMS is mostly a link, and the address was assembled fourteen
ways. Ten call sites interpolated `env.SITE_URL` bare, so with it unset a
guide's SMS read `Reply: undefined/messages/abc`. Nobody had seen it because
nothing has ever sent anything — all 39 rows in `email_log` still say
`skipped · no_api_key`. It would have been seen in the first message after
the keys landed. `app/lib/site-url.ts` is now the only answer, `SITE_URL` is
a var in `wrangler.jsonc` rather than a secret, and `absoluteUrl` no longer
falls back to `http://localhost:5173` — which fed every canonical tag, the
sitemap and robots.txt.

Green: 2,008 tests in 130 files, typecheck clean, build passing. No migration.

### Not verified

**The card field has never been rendered.** It typechecks and its logic is
tested, but drawing a Payment Element needs real Stripe test keys, and this
container has none — `scratchpad/` did not survive, so there is no Cloudflare
token to deploy with either. Nothing here should be described as working
until a test card has gone through it.

### Stripe is live in test mode

Raman sent the test keys, and the rest was done from here rather than from a
dashboard. The webhook endpoint was created through Stripe's API
(`we_1UHOaW…` → `https://guidesofnepal.com/api/webhooks/stripe`, listening to
`payment_intent.succeeded` alone), which also hands back the signing secret,
so none of it needed a browser.

`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` are
on the worker, `SITE_URL` was overwritten with the real domain rather than
deleted — the wrangler var and the secret now say the same thing, so it does
not matter which wins — and the worker is deployed.

Verified against the live site, not assumed:

- The webhook answered `400 bad signature` to a forged event and
  `200 {"received":true}` to one signed with the endpoint's real secret. It
  answered `404` before, because `getStripe` was returning the mock. That is
  the whole server half proven: real client, real verification, and the
  secret on the worker matching the one Stripe will sign with.
- `/checkout/:id` redirects an anonymous visitor to `/login` on
  `guidesofnepal.com`, so the route still works and `SITE_URL` is right.

### The card field works. Watched, on a 360px screen.

A throwaway booking was seeded (Raman approved it, and it has since been
deleted along with its traveller row), Sarah Klein's demo password was set,
and the whole thing was driven in Chromium at 360x780:

- The Payment Element renders — card number, expiry, CVC, country, ZIP —
  and fits a 360px screen without horizontal scroll.
- `4242 4242 4242 4242` paid. Stripe reports `succeeded`, `amount_received`
  22302.
- The browser landed on `/trips/:id` and the booking read `deposit_paid`
  with `deposit_paid_at` set.

Two things the browser found that nothing else could have.

**The payments table stayed empty.** See below — the bug of the day.

**The card form says "GREY ECOM MARKETING LLC".** That is the Stripe
account's business name, and it is what a trekker reads directly above the
card field: "you allow GREY ECOM MARKETING LLC to charge your card". On a
platform whose entire proposition is trusting a named human in Nepal, being
asked for a card by an unrelated company is exactly the wrong sentence in
exactly the wrong place. Fixed in the Stripe dashboard, not in code —
public business name and statement descriptor.

### The bug of the day: a deposit that succeeds leaves no record

Money moved, the booking advanced, `payments` stayed empty. Both upserts
against that table have failed since migration 0028 — the migration that
added the index they depend on — because the index is PARTIAL:

    create unique index payments_intent_type_uniq
      on payments(stripe_payment_intent, type)
      where stripe_payment_intent is not null;

Postgres only infers a non-partial unique index for `ON CONFLICT (cols)`;
using a partial one means repeating its predicate, and PostgREST's
`on_conflict=` takes column names with nowhere to put a WHERE. Every call
returned 42P10. The feature 0028 was written to enable — reusing a pending
intent across page loads — has never worked once.

It stayed invisible because both callers `await` the upsert without reading
the result, the exact thing CLAUDE.md warns about, and because until today no
real money had ever moved, so there was nothing to fail to record. The
checkout loader also named `onConflict: "stripe_payment_intent"` when the
index is on the pair, so it would have missed even a non-partial index.

0114 drops the predicate. Both call sites now read their result, and
`fulfillDeposit` refuses to advance a booking it cannot record — a trek
marked paid with no payment row cannot be reconciled or refunded, and the
idempotency guard reads that very row.

**Not deployed, deliberately.** 0114 has to be applied first: until the index
exists the upsert still fails, and `fulfillDeposit` now treats that as fatal.
Applying it needs a Supabase personal access token (`sbp_…`) for
`scripts/remote-apply.sh` — the service_role key cannot run DDL.

### Email sends, and the 65 addresses that would have poisoned it

The Resend domain was already added on 14 Sep and sitting in `failed`; it had
been checked while the Cloudflare zone was still initializing. Its three
records were read from Resend's API, written into Cloudflare as DNS-only, and
re-verified — DKIM and both CNAMEs green. `RESEND_API_KEY` is on the worker.
A test message from `no-reply@guidesofnepal.com` reached Resend and was
dispatched.

Before that could be turned on safely: all 65 seed accounts use
`@example.com`, an IANA-reserved domain that is guaranteed to hard bounce.
Harmless while there was no key; the next guide accepting an enquiry would
have started firing them at a sending domain with no reputation to spend.
`app/lib/undeliverable.ts` refuses addresses known to bounce, logged as
`reserved_domain` so ops reads "seed data" rather than hunting a fault.

### Older note, now superseded

Everything above is the server. Nobody has seen the Payment Element render,
because reaching a checkout page needs a booking in `pending_deposit`, and a
booking only reaches that state when a **guide accepts an enquiry**
(`acceptEnquiry`, from `/g/enquiries`) or a trekker approves a proposal. Ops
cannot do either, and the guide passwords are still unknown. Do not describe
the card step as working until a test card has gone through it.

The cheapest way in is the Supabase `service_role` key, which would allow a
throwaway booking to be seeded and the page driven in a real browser.

### Blocked, and on what

- **Supabase `service_role` key** (or a guide password), to get to a checkout
  page and actually look at it.
- **`RESEND_API_KEY`.** With it, adding the domain and writing its DNS
  records is fully automatable now: the Cloudflare token carries `DNS → Edit`,
  and Resend's API returns the records when a domain is added. No dashboard
  needed on either side.
- **`RESEND_API_KEY`**, plus verifying `guidesofnepal.com` in Resend — the
  from-lines are `no-reply@` and `hello@` at that domain, so mail will bounce
  until the DNS records Resend issues are added in Cloudflare. Possible now
  that the zone is active; it was not last session.
- **Supabase token** for `dbq.py`, to check anything against the live schema.
- **Rotate the credentials** once the list above is done — the Supabase
  token, the two Cloudflare tokens and the database password. Deferred
  deliberately, still outstanding.
