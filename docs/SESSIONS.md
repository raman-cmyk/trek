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
