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

## guide_tags — proper intent filtering ✅ done (0062, 2026-09-06)

Shipped as `guide_skills`: a closed vocabulary in `app/lib/guide-skills.ts`,
ticked in /g/profile (max 8), shown as chips on the public profile, and the
filter behind `?skill=` and four of the homepage intent rows. Keywords survive
as the fallback for a guide who has ticked nothing, so nobody vanishes from a
row they belong in while the claims fill up.

Still open from the original note: the `region` facet on an intent runs a
second query per request (`guideIdsMatchingText`), which is fine at 48 guides
and wants a materialised guide↔region view at 4,800.

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

## The other eighteen ops pages still swallow their errors

`app/lib/ops.server.ts` (`rows`, `one`, `write`) was written after the second
time this area shipped a silently-empty screen, and applied to one page. It is
now on `/ops/pipeline` and `/ops/bookings/:id` too, and
`app/lib/ops-pages.test.ts` has grown a read-side ratchet to match its
write-side one: `LEGACY_SILENT_READS` records every remaining page's count of
`const { data } = await admin...`, the test fails if any goes up, and a new
ops page cannot swallow an error at all. That file's own header listed the
swallowed read as failure #1 and never checked for it.

Eighteen pages are still on the old pattern — the budget list in that test is
the worklist, worst first:

    ops.people.$id.tsx           5     ops.routes.$slug.page.tsx    5
    ops.experiences.$id.tsx      3     ops.journals.$id.tsx         3
    ops.people.tsx               2     ops.routes.$slug.tsx         2
    …and ten list pages with one each.

Converting one is a ten-minute job: swap the destructure for the helper,
**render** the error it returns, lower the number, delete the entry at zero.
The detail pages matter most — a refused read there shows an empty Documents
panel on a real trek, which is the passport check silently not happening.

`ops.login.tsx`, `ops.users.tsx` and `ops.users.enter.tsx` read the auth
server rather than a table and already branch on failure; their counts are
shape, not bug.

## Referrals and gift cards: what a 5.9% margin can actually pay

Pratik suggested a gift-card block on the home page, to pull in referrals from
friends and family. The founder's instinct was right — "we dont have massive
margins so we need to figure out what we can give out". Here are the numbers,
from `TREK_FEE_PCT`, `FUND_PCT` and `estimateStripeFeeUsdCents` in this repo:

    package                     we charge   our fee    Fund    Stripe   NET TO US
    Momo crawl (day)               $50.85     $4.50   $1.35     $1.77       $2.73
    Poon Hill, 5 days             $621.50    $55.00  $16.50    $18.32      $36.68
    Annapurna Circuit, 14 days   $1297.33   $114.81  $34.44    $37.92      $76.89
    Everest Base Camp, 14 days   $1469.00   $130.00  $39.00    $42.90      $87.10

**Net is ~5.9% of gross on every trek**, because the fee is 10% and Stripe
takes 2.9% + 30¢ of the whole charge, not of our slice. The package is the
guide's in full and the Fund's 3% is not ours to spend.

So the Withlocals-style €50 gift card is **65% of the entire margin** on a
fortnight in the Khumbu, and **eighteen times** the margin on a momo crawl. A
$25/$25 two-sided referral is 65% of a trek's margin. Even $15/$15 is 39%.
Cash referrals do not fit in this business as priced.

What does fit, roughly in order of how cheap it is:

1. **Credit, not cash, and only on completion.** A $20 credit redeemable on a
   future booking costs nothing unless it produces a second booking — which
   earns another ~$77. Pay it when the referred trek *completes*, so a
   cancellation never costs us. This is the recommendation.
2. **A Fund donation in their name.** We already collect 3% for the Guide
   Emergency Fund. "We put $20 in the Fund in your friend's name" is on-brand,
   is a real thing happening, and reads better than a discount code.
3. **Guide-funded.** The guide holds the $1,148, not us. A guide may well give
   2% for a seat they would not have filled — but that is their decision to
   offer, not ours to spend, and it has to be opt-in per guide.
4. **Non-cash and ours to give**: first refusal on a specific guide's dates, a
   free insurance check, the printed day-by-day map.

**Gift cards are blocked regardless**, and not on margin: the worker has no
`STRIPE_*` secrets, so nothing on this platform can take money yet. A "Buy a
gift card" button would be a form that cannot charge. Sequence is Stripe
first, then credits (which need a ledger — issue, balance, expiry, and a
redemption that cannot go negative), then gift cards on top of that ledger.

---

## From the "Trek Ops" spec — phases 2 to 5 (2026-09-18)

Raman's ops document describes the whole operation. Phase 1 — "fix the trip
page, staff must trust the numbers first" — is what this session built. The
rest is his own phases 2 to 5, each its own build, and CLAUDE.md rule 7 says
they wait rather than growing quietly out of Phase 1.

**The slot/product model for experiences.** The whole Experiences Desk rests
on it, and nothing of it exists: no slot, no vehicle, no driver, no pickup
point anywhere in the schema (`departures` is dead schema). Every screen the
spec draws for that desk — Today's run sheet, Tomorrow's evening check,
Calendar fill rates, capacity and waitlists, merge-and-move-a-slot — needs it
first. This is the biggest single item in the document.

**Two desks.** Trek Desk and Experiences Desk as separate homes with separate
navigation. Deliberately not built: there is one ops team, and splitting the
screens before the second desk exists makes two half-empty rooms. Revisit when
the Experiences Desk has its own people.

**The guide app in two modes.** One app opening in trek mode or day mode by
the job assigned, with offline taps, an SMS fallback for check-ins and an
emergency button. Today's guide pages are web screens that need signal.

**Customer portals.** The trekker's half largely exists now (roster, papers,
"Before you go"). The guest portal for experiences — pay, waiver, pick a
pickup point, confirm the night before, cancel within the rules — needs the
slot model above.

**Exception playbooks as code.** Charge declined at T-14, guide drops out,
weather cancels a slot, altitude evacuation. Each is a sequence of messages,
refunds and reassignments the spec spells out and nothing automates.

**The two spec tasks that are not a booking's.** Creating an experience
product and generating a month of slots belong to the product, not to whoever
books it first, so `EXPERIENCE_TASKS` has thirteen rows rather than fifteen.
They come back with the slot model.
