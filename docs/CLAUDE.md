# CLAUDE.md — Guide Marketplace (working codename: GMKT — rename before launch)

## What this project is

A guide-first marketplace for Nepal trekking and experiences. **Positioning: "The only place in Nepal where you pick your guide, not your agency."**

- The **guide is the atomic unit**. Every trek, day hike, and experience is an offering that belongs to a specific verified guide. There are no anonymous packages.
- Two browse lanes, one data model: "Find your guide" (guide-first) and "Browse experiences" (offering-first). Both converge on the same booking flow.
- The platform legally operates as a trekking agency (permits for multi-day treks are issued via a partner TAAN agency in Phase 1). Payments are collected in USD via Stripe under a US LLC; guides are paid in NPR by the Nepal entity.

## Who is building this

The founder (Raman) is non-technical. He runs terminal/code work through Claude Code and handles browser tasks (Supabase dashboard, Stripe dashboard, Cloudflare, DNS) himself. When a task requires the browser:
1. Tell him exactly what to click, in order, in simple steps.
2. Never assume he has done a browser step — ask him to confirm before depending on it.
3. Prefer doing things in code/CLI/migrations over dashboard clicks whenever possible.

## Stack (do not deviate without discussing)

- **Framework:** React Router v7, framework mode (Vite-based, SSR). SSR is NON-NEGOTIABLE for public pages — SEO is the primary demand channel.
- **Language:** TypeScript, strict mode.
- **Styling:** Tailwind CSS v4.
- **DB/Auth/Storage:** Supabase (Postgres + RLS, Supabase Auth, Storage buckets).
- **Payments:** Stripe (Payment Intents + manual capture flow for deposit/balance). Stripe Connect deferred — Phase 1 pays guides via manual NPR batch payouts recorded in-app.
- **Hosting:** Cloudflare Workers (via React Router Cloudflare template).
- **Email:** Resend. **SMS to guides:** Sparrow SMS (Nepal) via edge function.
- **Analytics:** PostHog.
- **Maps:** MapLibre GL + OpenStreetMap tiles.

## Repository layout

```
/app                  React Router app (routes, components, loaders/actions)
  /routes             File-based routes
  /components         Shared UI
  /lib                supabase client, stripe helpers, utils
/supabase
  /migrations         SQL migrations — ALL schema changes happen here
  /functions          Edge functions (sms, payout batch, permit reminders)
/docs                 The planning docs (this pack)
/public               Static assets
```

## Hard rules

1. **All schema changes via migration files** in /supabase/migrations. Never tell the founder to edit tables in the Supabase dashboard.
2. **RLS on every table.** Default deny. Policies documented in 03-database-schema.sql comments.
3. **Money is integers.** All amounts stored in cents (USD) or paisa (NPR). Currency column always present. Never float.
4. **Every user-facing string** goes through /app/lib/copy.ts (single file, keyed) — the founder's copywriter will edit copy without touching components.
5. **Public routes must SSR** with meta tags, OpenGraph, and JSON-LD (see 02-architecture.md §SEO). Test with JS disabled.
6. **Mobile-first.** Guides use cheap Android phones on slow connections. The guide dashboard must work on a 360px screen over 3G. Test every guide-facing screen at 360px.
7. **No feature outside the current phase** (see 05-build-plan.md). If the founder asks for a Phase 3 feature mid-Phase-1, build a stub and note it in docs/BACKLOG.md.
8. **Guide-facing UI must be dead simple.** Max 2 taps to accept a booking. Plain words, no jargon. Assume English is a second or third language.
8b. **Airbnb-grade feel is a requirement, not a polish pass.** Every UI screen must meet the loading, motion, and interaction bar in docs/06-interaction-motion-spec.md. A screen is not "done" until it passes that doc's acceptance checklist (§13). Build the motion/skeleton/sheet primitives in M0-M1 before building screens that consume them.
9. **Passport/insurance documents:** private Supabase Storage bucket, signed URLs only, 90-day auto-delete after trek completion (see retention policy in architecture doc). Never log document URLs.
10. **Commit style:** conventional commits. Small, frequent commits. Every session ends with a green build (`npm run build` passes) and a session summary appended to docs/SESSIONS.md.

## Working agreement for Claude Code sessions

- Start every session by reading docs/05-build-plan.md and docs/SESSIONS.md to see current phase and last state.
- One milestone per session where possible. Don't start milestone N+1 if N is broken.
- When ambiguous, choose the simpler thing and note the decision in docs/DECISIONS.md rather than blocking on the founder.
- Seed data lives in /supabase/seed.sql — keep it updated so a fresh clone can demo the app with 12 fake guides and 20 offerings.

## Environment variables (founder sets these in Cloudflare + .dev.vars)

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   (server only, never client)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PUBLISHABLE_KEY
RESEND_API_KEY
SPARROW_SMS_TOKEN
POSTHOG_KEY
SITE_URL
```

## The one-line test for every feature

"Does this help a trekker in Berlin trust and book a specific human being in Nepal?" If a feature doesn't serve that, it waits.
