# Guide Marketplace — Claude Code Doc Pack

**Positioning: "The only place in Nepal where you pick your guide, not your agency."**

Drop this folder into the repo root as `/docs` (CLAUDE.md goes to repo root). Then open Claude Code and say: *"Read CLAUDE.md and docs/05-build-plan.md, then start M0."*

## Files

| File | What it is | Who edits it |
|---|---|---|
| **CLAUDE.md** | Standing instructions Claude Code reads every session — stack, hard rules, working agreement | Rarely touched |
| **01-product-spec.md** | Positioning, users, the two browse lanes, full Phase 1 feature spec, what's explicitly out | You, when scope changes |
| **02-architecture.md** | Stack decisions, money/fees/refunds, SEO architecture, security, notifications | Claude Code proposes changes via DECISIONS.md |
| **03-database-schema.sql** | Full reference schema with RLS notes — migrations derive from this | Claude Code, keeping it in sync with migrations |
| **04-design-system.md** | Tokens, components, page-by-page UI specs — what things *look* like | You + Claude Code |
| **06-interaction-motion-spec.md** | Airbnb-grade loading states, skeletons, transitions, sticky booking widget, bottom sheets, blur-up images, perceived-performance — how things *move and load* | You + Claude Code |
| **05-build-plan.md** | M0-M9 milestones with done-criteria and your 🙋 browser tasks | Claude Code checks boxes |

## Files Claude Code creates in the repo
- `docs/SESSIONS.md` — running log, one entry per session
- `docs/DECISIONS.md` — every judgment call made without you
- `docs/BACKLOG.md` — out-of-phase ideas parked, not built

## Before M0, you need (in this order)
1. **A name** + .com + Instagram handle (see plan doc §16 — test pronunciation on 10 foreigners)
2. Supabase project (free tier fine to start)
3. Cloudflare account (you have one)
4. Stripe account under the Wyoming LLC (test mode is enough until M6)
5. GitHub repo

## What the docs deliberately do NOT cover
- The business plan (entity setup, agency partnership, guide recruitment, unit economics) — that's in the separate `trekking-marketplace-plan.md`. **Path B agency partnership and the first 20 guide conversations are still the critical path — the code is not.** Build M0-M3 in parallel with those conversations, but do not let coding become the way to avoid making the phone calls.
