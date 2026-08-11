# Backlog — parked, not built in Phase 1

Out-of-phase ideas. When the founder asks for one mid-Phase-1, build a stub and
note it here (per CLAUDE.md hard rule #7). Source: `docs/01-product-spec.md`
"Explicitly OUT of Phase 1" + `docs/05-build-plan.md` Phase 2 list.

## Explicitly out of Phase 1 (stub only)

- **Group departures** — Phase 2. Schema already supports it from day 1
  (`departures`, `departure_members` tables land in M1); UI is deferred.
- **Video intros** — Tier-2 guide reward, later. Phase 1 uses the optional 30s
  audio `voice_intro_url` only.
- **Native app / offline maps** — not in Phase 1.
- **Gear rental, airport transfers, insurance affiliate checkout add-ons** —
  links only in Phase 1, no in-app checkout.
- **Stripe Connect automated payouts** — Phase 1 pays guides via manual NPR
  batches recorded in the payout ledger.
- **Nepali-language UI** — English only in Phase 1.
- **Featured placement / subscriptions** — not in Phase 1.

## Phase 2 (separate planning session)

Group departures UI · saved searches · Tier-2 video pipeline · insurance
affiliate integration · airport transfer add-on · guide referral program ·
Nepali UI · map view (list+map split, "search as I move the map" — interaction
spec'd in `docs/06` §8 so it isn't retrofitted).

## M3 follow-ups (public site polish)

- **MapLibre meeting-point mini-map** on offering detail — currently the meeting
  point is shown as text. Wire MapLibre GL + OSM tiles in a polish pass.
- **Full-screen photo viewer** ("see all photos" mosaic → swipe) — cards have the
  carousel; the full-screen gallery (docs/06 §7) is deferred.
- **Expanding search** (docs/06 §8) — header has direct lane links for now.
- **"On the trail now"** live check-in feed is built in M8; M3 shows approved
  trekker photos as a seasonal teaser.

## guide_tags — proper intent filtering (from the homepage-rework session)

The homepage "browse by intent" rows currently match keywords against the
guide's own text (`only_with_me`, `hook_line`, `bio`) — see `app/lib/intents.ts`.
That is honest scaffolding, not the end state: it means "Photographers" is a
substring search for "camera", and a guide who writes their promise a different
way is invisible to the row that was built for them.

Properly this is a `guide_tags` table: the guide ticks "I host you in my
village" / "I shoot photos" / "I go slow with first-timers" in /g/profile, and
the rows filter on a column. Deliberately deferred until enough guides have
written `only_with_me` lines that we can read the real tags off them rather
than inventing a taxonomy first and asking guides to squeeze into it.

Also deferred with it: the `region` facet on an intent runs a second query per
request (`guideIdsMatchingText`), which is fine at 48 guides and wants a
materialised guide↔region view at 4,800.
