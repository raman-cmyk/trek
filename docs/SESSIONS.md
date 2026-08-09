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
