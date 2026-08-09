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
