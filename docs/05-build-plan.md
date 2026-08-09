# 05 — Build Plan

Milestones sized for Claude Code sessions (one to two sessions each). Do them in order. A milestone is DONE when its checklist passes, `npm run build` is green, and SESSIONS.md is updated. Do not start N+1 while N is broken.

**Founder browser tasks are marked 🙋 — Claude Code must list these at the start of the relevant milestone and wait for confirmation.**

---

## M0 — Project scaffold
- [ ] Init React Router v7 framework-mode app (Cloudflare template), TypeScript strict, Tailwind v4
- [ ] Repo structure per CLAUDE.md; docs/ folder with this pack; SESSIONS.md, DECISIONS.md, BACKLOG.md created
- [ ] Supabase project linked, local dev running (`supabase start`)
- [ ] 🙋 Founder: create Supabase project, Cloudflare project, set env vars in .dev.vars
- [ ] CI: GitHub Action — typecheck + build on PR
- [ ] Deploy hello-world to Cloudflare, custom domain later
- [ ] **Motion/feel foundation (per 06-interaction-motion-spec.md §14):** motion tokens in Tailwind config + /app/lib/motion.ts; shimmer keyframe + skeleton primitives; `<SmartImage>` (blur-up); `<Sheet>` primitive (bottom-sheet mobile / modal desktop); `<Button>` with press/hover/loading/disabled states; `prefers-reduced-motion` handling baked into all of them
**Done when:** app deploys, connects to Supabase, renders one SSR page, AND the motion/skeleton/sheet/button/image primitives exist and are demoable on a scratch page.

## M1 — Schema + seed
- [ ] All migrations from 03-database-schema.sql (identity, catalog, transaction, safety, social)
- [ ] RLS policies: default deny + public views (public_guides, public_offerings)
- [ ] seed.sql: 12 fake guides (varied tiers/languages/districts), 6 routes with real permit data, 20 offerings (8 treks, 12 experiences), 10 published reviews, availability spread
- [ ] /app/lib/pricing.ts + policy.ts + tests
**Done when:** fresh `supabase db reset` gives a browsable fake marketplace via SQL.

## M2 — Ops admin core
- [ ] Ops auth (role gate) + /ops layout
- [ ] Verification queue: list, guide detail checklist, doc viewer (signed URLs), pass/fail per check, tier assign, approve→verified
- [ ] Booking pipeline kanban (read from seed)
- [ ] Permit tracker table + inline status advance
- [ ] Payout ledger + batch-paid flow
- [ ] Incident log CRUD
**Done when:** ops can verify a seeded guide end-to-end and walk a fake booking through every status.

## M3 — Public site (SSR + SEO)
- [ ] Home per design spec (all 8 sections, seed-powered)
- [ ] Guide directory with URL-param filters, SSR
- [ ] Guide profile pages + JSON-LD Person
- [ ] Offering detail pages + JSON-LD Product/Offer/AggregateRating
- [ ] Route landing pages from /content/routes/*.md (write 2 real ones: EBC, Annapurna Circuit — founder supplies raw notes, Claude drafts)
- [ ] Transparency + safety pages
- [ ] Sitemap.xml, robots.txt, OG tags with real images, redirects table wired
- [ ] Lighthouse: SEO ≥ 95, LCP < 2.5s on throttled 4G
- [ ] **Airbnb-feel pass (06-interaction-motion-spec.md §3, §5, §7, §8, §12):** per-page skeletons with zero layout shift, blur-up images, sticky booking widget (desktop) / bottom-bar+sheet (mobile), photo carousels with dot pagination, expanding search, route-level deferred loaders, prefetch-on-intent
**Done when:** with JS disabled every public page renders complete correct HTML, AND with JS on every page passes the §13 acceptance checklist (no blank/spinner states, no layout shift, nothing hard-pops).

## M4 — Auth + guide application
- [ ] Trekker auth: email magic link. Guide auth: phone OTP
- [ ] Guide application form (public, autosaving) → creates applied guide + verification rows
- [ ] Guide status page (applied → in review → verified/rejected)
- [ ] 🙋 Founder: configure Supabase auth providers, SMS provider for OTP
**Done when:** a real person can apply as a guide and ops sees them in the queue.

## M5 — Guide dashboard
- [ ] /g layout, mobile-first 360px
- [ ] Enquiries inbox (accept/decline, seeded), bookings list, calendar block/unblock, earnings view, profile view + request-change
- [ ] CheckinButton (wired fully in M8)
**Done when:** guide flows all work at 360px over throttled 3G.

## M6 — Enquiry → quote → booking → payment
- [ ] Enquiry create from offering page (dates from availability, party size, message)
- [ ] Guide accept → hold availability (24h TTL) → quote generated (pricing.ts)
- [ ] Checkout: Stripe Payment Element, deposit PaymentIntent + SetupIntent; inside-14-days = full charge
- [ ] Webhook handler: deposit success → booking deposit_paid, availability booked, notifications fire
- [ ] Balance sweep cron (T-14 charge, retries, T-10 auto-cancel)
- [ ] Cancellation flows per policy matrix incl. refunds
- [ ] Enquiry expiry sweep (24h → expired, ops alert)
- [ ] 🙋 Founder: Stripe account keys, webhook endpoint config
- [ ] Tests: pricing, refund calculator, webhook idempotency
**Done when:** Playwright happy-path passes in Stripe test mode: browse → enquire → accept → pay deposit → ops pipeline shows deposit_paid.

## M7 — Documents, permits, My Trips
- [ ] Private documents bucket + signed-URL access + access log + retention sweep
- [ ] Trekker document upload (passport, insurance per party member); ops verify → booking confirmed
- [ ] Permit applications auto-created from route permits on confirmation; ops tracker already exists (M2) — wire it
- [ ] My Trips: status timeline, docs, permit status, pre-trek brief (T-7 unlock), guide phone (T-48 unlock)
- [ ] Notifications matrix wired (Resend templates + Sparrow SMS edge function)
- [ ] 🙋 Founder: Resend domain verification, Sparrow SMS account + token
**Done when:** full lifecycle runs: pay → upload docs → ops verifies → permits tracked → briefs unlock on schedule (test with time-travel helper).

## M8 — Messaging, check-ins, reviews
- [ ] Message threads on enquiry/booking; masking pre-deposit; flag regex → ops queue
- [ ] Check-ins: app button + inbound SMS path; missed-checkin sweep → ops alerts (24h/48h)
- [ ] Reviews: double-blind create/release, sub-ratings, trekker photo upload → moderation → offering photos
- [ ] Recap page auto-generated on completion + OG image (satori)
- [ ] "On the trail now" home strip from approved check-in photos
**Done when:** completed seed booking produces released reviews and a shareable recap that unfurls with a proper OG image in WhatsApp.

## M9 — Polish + launch gate
- [ ] Empty states everywhere, error boundaries, 404/500 pages
- [ ] PostHog events: search, guide_view, offering_view, enquiry_created, deposit_paid, review_submitted
- [ ] Copy pass: every string through copy.ts, founder + copywriter review
- [ ] Real content: strip ALL seed data from prod; onboard first 10 real guides via ops
- [ ] Security pass: RLS audit (attempt cross-role access), webhook replay test, rate limits
- [ ] 🙋 Founder: domain, Stripe live keys, real permit costs verified with agency partner
**Launch gate:** one real guide, one real (friend) booking, full lifecycle in production, money moved and refunded correctly.

---

## Phase 2 (post-launch, separate planning session)
Group departures UI · saved searches · Tier-2 video pipeline · insurance affiliate integration · airport transfer add-on · guide referral program · Nepali UI

## Standing session ritual
1. Read SESSIONS.md tail + current milestone.
2. State the plan in 3 bullets before coding.
3. Build. Commit small.
4. Run build + relevant tests.
5. Append SESSIONS.md: date, milestone, what shipped, what's next, any 🙋 items pending.
