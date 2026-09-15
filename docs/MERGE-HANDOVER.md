# Handover: the 25 commits on `claude/new-session-vereu4`

Two Claude sessions built this project in parallel on 14–15 September 2026 and
deployed over each other all day. This is everything on the smaller branch
(`claude/new-session-vereu4`, 25 commits) written so the other branch
(`claude/new-session-p6r3mp`, 84 commits, which owns the design system and the
`Guides of Nepal` identity) can absorb it.

Measured, not guessed: a real trial merge conflicts in **46 files, 119 hunks**.
It is not a textual merge, because both sides rewrote the same surfaces —
`ops.verifications.tsx` is +393/−59 on one side and +466/−66 on the other, and
`app/components/design/` (ten components, including a `FactStrip`) exists only
on the larger branch. Each shared surface needs one design chosen and the
other side's substance re-applied inside it.

Ordered by what it costs to leave out.

## 1. A request to book is lost when the trekker signs in

**Highest priority. This one loses bookings.**

`/enquiry` did `throw redirect("/login?next=" + return_to)` and dropped the
form. After signing in the trekker landed on the trip with an empty form and
had to choose the date, the party size and the extras again. On a phone the
form is a bottom sheet that closes behind them, so the tap looked like it had
done nothing — which is how it was reported, as a mobile-only bug. Desktop lost
it too; it just left the filled form on screen.

- `app/lib/pending-enquiry.ts` — pure: what may be parked, for how long
  (30 min), and every field revalidated on the way back (ids that are not ids,
  a party of 900, a `returnTo` pointing off-site, a stamp from the future).
- `app/lib/pending-enquiry.server.ts` — the cookie: HMAC-SHA256 with the
  service-role key, HttpOnly, Secure, SameSite=Lax so it survives the redirect
  back. Max-Age matches the payload's own expiry so neither outlives the other.
- `app/lib/enquiry.server.ts` — `submitEnquiry`, the single path a fresh POST
  and a replay both take. **This is the part that matters**: a replay is not
  more trusted than a fresh request, so a trip whose party limits moved while
  somebody was signing up fails with the same message.
- `app/routes/enquiry.resume.tsx` — replays it once a session exists, clears
  the cookie whatever happened, lands on `/trips?sent=1`.
- `app/routes/trips._index.tsx` — the outcome banner (`?sent=1` / `?sent=0`).

Verified end to end against production: POST `/enquiry` signed out → 302 to
`/login?next=/enquiry/resume` with the cookie; login → 302 to the resume
route; that → `/trips?sent=1`; and the row in the database with the date, the
party size and the message intact.

## 2. Error 1102 — "Worker exceeded resource limits"

6% of requests (32 of 499 in six hours) returned a blank page. Successful
renders burned 13 ms CPU at the median, 178 ms at p99, on pages of 250–354 KB.
After the four changes below: **zero failures in 70 minutes over 197 requests.**

- `app/lib/cache-headers.ts` — 30 minutes instead of 5, plus
  `stale-while-revalidate` and `stale-if-error` for a day. This is the half
  that matters to a visitor: a cached page is handed over instantly and the
  refresh happens behind them, so a slow or failed render is not something
  anybody waits for.
- `app/lib/card-offering.ts` — `toCardOffering` reduces a row to the fifteen
  fields a card draws and computes the from-price once. React Router
  serialises every loader return into the document, and 42% of the homepage
  was that payload: 56 summaries no card renders and 56 `price_breakdown`
  objects shipped so the browser could recompute a number the server had.
  Applied in `home.tsx`, `experiences.tsx`, `routes.$slug.tsx`.
- `app/components/public/Footer.tsx` — the face wall capped at 24 avatars. At
  48 it was 38 KB of markup on **every** public page.
- `app/components/public/cards.tsx` — the three fact icons as one sprite
  (`CardIconSprite`, rendered once in `_public.tsx`) instead of 168 inline
  SVGs on the browse page.

**Still worth doing regardless of this merge:** Workers Paid ($5/month) raises
the CPU ceiling from 10 ms to 30 s. At 14 ms medians the site is one busy
afternoon from this returning.

## 3. Things with nowhere to store them (migrations 0066–0068)

- **0066** `offerings`: `activity_level`, `transport` + note, `accessibility` +
  note, `languages`, `faqs` (jsonb, validated by `faqs_well_formed()` because
  a check constraint may not hold a subquery), `ref_code` (derived from the id
  by `offering_ref_code()`, with a trigger and a unique index).
  Codes live in the database so they stay filterable; the words live in
  `app/lib/offering-details.ts` so copy changes need no migration.
- **0067** backfill: facts we already held (a trek is walked; difficulty comes
  off the route grading), then demo content so no section renders empty.
- **0068** adopts the `notifications` table into migrations. **Note: this and
  your `0079_notifications.sql` produce an identical table** — same columns,
  same order — and `create table if not exists` meant whichever ran first won
  with no damage. The production database has both forks' schemas already
  (`account_blocks`, `notifications`, `admin_actions`, `trip_intents`).

The guide-facing form for all of section 3 is a "Who it suits" step in
`app/components/ExperienceForm.tsx` (radios, checkboxes and paired inputs, so
it still posts with no JavaScript), parsed in `app/lib/offerings.server.ts`
(`zipFaqs`, `parseCodes`), and recorded in the edit audit trail.

## 4. Pure modules that carry decisions, each with tests

Take these wholesale — they are self-contained and have no design surface.

| Module | What it settles | Tests |
|---|---|---|
| `app/lib/regions.ts` | The twelve trekking regions, and that a region is a *group* of `routes.region` values — Everest/Khumbu holds both `Khumbu` and `Solukhumbu`, Western & Far-Western holds `Karnali` and `Sudurpashchim` | 14 |
| `app/lib/hold.ts` | The deposit hold as a countdown from `hold_expires_at`, urgent in the last half hour, and what to say when it has gone | 13 |
| `app/lib/offering-details.ts` | The codes and words for §3, and that accessibility *cautions* sort last with a different mark — "not suitable if you have limited mobility" as a green tick beside "service animals welcome" is how somebody books a trip they must cancel | 19 |
| `app/lib/availability.ts` | "The guide is free" and "this trip can start" are different questions; a 14-day trek needs fourteen consecutive days | 12 |
| `app/lib/payment-policy.ts` | The deposit and refund bands in the words the policy means, and `CANCELLATION_TEASER` derived from the first band so the summary cannot contradict it | 11 |
| `app/lib/party.ts` | "Private trip for 1 to 8 people", said identically on the card and the page | 5 |
| `app/lib/card-offering.ts` | §2 above | 7 |
| `app/lib/pending-enquiry.ts` | §1 above | 10 |
| `app/lib/inapp.ts` | The bell's badge, and `hrefFor` accepting own-paths only so a stored destination cannot become an open redirect | 13 |
| `app/lib/calendar.ts`, `meeting.ts`, `cancellations.ts`, `arrival.ts`, `blocking.ts`, `guide-setup.ts`, `verification-queue.ts`, `people.ts` | Earlier work, same pattern | — |

`app/lib/embeds.test.ts` is the one to take even if nothing else is taken: it
scans every `select()` string and fails when an unnamed `users` embed sits on a
table with two foreign keys to it. That bug (PGRST201) silently returned
`{data: null}`, which every loader read as `?? []`, so `/g/bookings` showed an
empty page to a guide with ten bookings — on a green build.

## 5. Design-led changes that need porting, not merging

These conflict with the larger branch's own work on the same surfaces. The
*intent* is what to carry across; the markup should be yours.

- **Card facts** — rating with its count (the trip's own, via
  `offeringRatings()`, not its guide's: a guide at 4.9 across six trips says
  nothing about which to book), duration, transport, party range. A trip with
  no reviews says "No reviews yet" out loud, because a blank where a rating
  belongs reads as a bad one. Your `design/FactStrip.tsx` looks like the right
  home for this.
- **The availability calendar key** was three kinds of wrong. The swatch was a
  sample cell reading "12", so all three rows showed the same number and read
  as three counts. "Free, but too close to the next booking" was false on every
  day trip — nothing is near a booking, the day is simply too soon — so the
  reason must follow the trip's length. And "Already booked, or kept free"
  called a day unavailable and free in one breath. Now: a blank pill, the real
  count per state, and "Not available".
- **The trip page's missing tier of fact** — getting there and around, how hard
  it is in words, languages on the trip, who it suits, the trip reference, the
  questions people ask (plus `FAQPage` structured data, emitted only when a
  guide has answered something), the rating spread, the guide's numbers, a
  breadcrumb a person can climb, and two rails at the foot.
- **Checkout** — `HoldTimer` (server clock, not page load, so a tab left open
  shows the real time left) and `BookWithConfidence`, which deliberately makes
  only claims this platform can keep: no "lowest price guarantee", no "24/7
  global support", no unlimited rescheduling.
- **`/match`** offered four regions; it offers all twelve now, the two with no
  routes marked "soon" rather than leading nowhere.

## 6. Notifications — we both built this

Both branches built a bell because **email and SMS have never sent anything**:
the live worker has no `RESEND_API_KEY` and no `SPARROW_SMS_TOKEN`, and
`email_log` holds 39 rows all reading `skipped · no_api_key`.

Keep yours. Two details from mine worth checking you have:

1. The writer sits at the email funnel in `send.server.ts` **before the gate**,
   so a notification is recorded whether Resend is configured or not and
   whether the address is blocked or not — those are exactly the cases where
   the bell is the only channel left.
2. Three notifications send only SMS and so reach nobody at all without it: a
   new request, a verification result, and a public question. They need an
   explicit in-app write (`inApp()` in `notify.server.ts`).

## 7. One operational rule

One deployer. Two sessions on one worker and one database produced this all
day: five deploys reverted each other, and the site flipped between two
different applications depending on who pushed last.
