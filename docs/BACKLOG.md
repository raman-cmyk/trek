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


## Selling travel insurance (the real product behind the stub)

The trip page now has the *place* where trekkers buy cover from us — the
"Don't have insurance yet?" panel on the insurance document slot — but not the
product. Pressing the button emails a human and logs the request under
`insurance_interest` in `email_log`; nothing is quoted, sold, or charged, and
no provider is named, because there is nothing to name yet.

What the real thing needs, roughly in order:

1. **An underwriter or affiliate** who will cover trekking to 5,000m+ with
   helicopter evacuation, and who pays or bills in a way a US LLC can handle.
   Everything below is guesswork until this exists.
2. **A quote** — price by trip length, altitude, age and nationality. Whether
   we can quote in-app or have to hand off to their site decides the whole UI.
3. **Where the money goes.** An affiliate link is a referral fee and almost no
   liability; selling a policy ourselves is regulated in most of the countries
   our trekkers live in. This is a legal question before it is a code one.
4. **The certificate comes back automatically** — a policy bought through us
   should land in the insurance slot already verified, which is the actual
   prize here: it removes the step people get stuck on.

Read the demand first: `select count(*) from email_log where kind =
'insurance_interest'` says how many people asked, before any of the above is
worth paying for.
