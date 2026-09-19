# Decisions log

Judgment calls made without blocking the founder (per CLAUDE.md working
agreement). Newest first.

---

## 2026-08-09

- **React Router v8, not v7.** The docs specify "React Router v7, framework
  mode." `react-router@latest` is now **8.x** — the direct continuation of the
  v7 framework-mode line, and the version all current tooling/templates target.
  Pinning the superseded v7 would fight the ecosystem. Adopted v8; the stack
  intent (Vite-based, SSR, Cloudflare) is unchanged. Notable v8 API shift wired
  in: the load context is a typed `RouterContextProvider` (see `app/context.ts`)
  instead of the v7 `AppLoadContext` module augmentation.

- **Package manager: npm.** Matches the React Router Cloudflare template default
  and keeps CI simple. (pnpm is available but not adopted.)

- **Test runner: Vitest**, with a dedicated `vitest.config.ts` that omits the
  React Router / Cloudflare Vite plugins so pure `app/lib` unit tests
  (pricing, policy, mask) run without the framework loading.

- **Fonts self-hosted** via `@fontsource-variable/*` rather than Google Fonts
  CDN — avoids a runtime external request (CSP/Cloudflare-friendly, faster LCP).

- **`worker-configuration.d.ts` is gitignored and regenerated.** It's a 549KB
  generated file that tracks the wrangler/compat-date. `npm run typecheck` runs
  `wrangler types` first so local and CI always have fresh Cloudflare types.

- **Tailwind v4 duration utilities.** Named durations are registered under the
  `--transition-duration-*` theme namespace (aliasing the canonical
  `--duration-*` tokens) so `duration-quick` / `duration-base` utilities resolve;
  v4 has no `--duration-*` → `duration-*` mapping.

- **Scope of this session: M0 + M1 only.** Both are pure-code and need no
  founder browser tasks. M2+ begins to require live Supabase/Stripe/Cloudflare
  credentials, so stopping at a green, demoable M0+M1 is the correct first slice.

## 2026-08-09 (M2)

- **Ops auth = Supabase email+password** (not magic-link/OTP). M2 only needs a
  role gate; full trekker/guide auth is M4. Email+password is the simplest thing
  that's verifiable headlessly. `@supabase/ssr` handles cookie sessions; a
  service-role admin client does the privileged ops reads/writes.

- **Adopted Supabase's grant model (`0010_grants.sql`).** Roles hold broad table
  privileges and RLS is the only gate — matching how Supabase cloud is
  configured — so `service_role` (and `authenticated`/`anon`) behave locally
  exactly as in production. Our tables are RLS-enabled default-deny, so this
  doesn't widen exposure.

- **Guard triggers allow `service_role`/`postgres`.** The column-guard and
  publish-guard triggers key off `is_ops()` (which needs `auth.uid()`); the ops
  console writes as the service role, so the guards now also pass privileged DB
  roles. End-user (authenticated) guides are still fully guarded.

- **Local verification stack is partial by necessity.** The sandbox can't run
  the full `supabase start` (an rlimit restriction kills analytics/edge-runtime),
  so we run db+kong+rest+auth via `supabase start -x …`. That covers everything
  M2 needs. The `@supabase/pg-delta` TLS warning during `db reset` is non-fatal
  (migration-catalog caching only) — migrations and seed apply fine.

## 2026-08-09 (M4)

- **Email OTP (6-digit code), not magic-link redirect, for trekkers.** Same
  friction class, but stateless to verify (no PKCE code-exchange callback),
  Workers-friendly, and testable headlessly. The spec said "magic link"; OTP is
  the simpler equivalent and can switch later. Guides use phone OTP (spec).
- **The guide application creates the auth user up front** (phone-keyed, via the
  admin API) so the applicant has an identity to sign in with later and ops has a
  real row to verify. The guides insert is rolled back (auth user deleted) on
  failure so a phone can retry.
- **Guide photos/bio stay ops-authored** (per docs/01) — the application collects
  facts (licence, rate, languages, hook line), not media; ops adds photos/bio to
  keep the quality bar. Photo upload is therefore not in the application form.

## 2026-08-09 (M5)

- **Guide dashboard verified via an injected `@supabase/ssr` session**, not a
  real phone-OTP login, because phone OTP needs an SMS provider enabled
  (`GOTRUE_EXTERNAL_PHONE_ENABLED`), which requires committing dev-only SMS
  config. Rather than pollute `config.toml`, the test signs Pemba in through the
  same `@supabase/ssr` client the app uses (email+password set via admin) and
  injects the resulting cookies — a library-accurate session. Real guide login
  works once the founder enables an SMS provider.
- **Bottom tab bar for the guide app** (Home/Enquiries/Trips/Calendar/Earnings)
  — native-feeling on the cheap Android phones guides use; Profile is reached
  from Home to keep the bar to five items.
- **Guide-editable fields limited to rate + payout** in `/g/profile`; bio/photos
  stay ops-authored (docs/01), surfaced as a change-request. Enforced by the
  action whitelist + the `guard_guide_columns` trigger.

## 2026-08-09 (M6)

- **Stripe behind an interface with a mock default.** No `STRIPE_SECRET_KEY` →
  `MockStripe` (deterministic fake intents, auto-succeed) so the whole booking→
  payment flow is buildable/testable now; real keys switch to `RealStripe`
  (Stripe REST via fetch — the Node SDK doesn't run on Workers) with identical
  fulfillment. Real webhook-signature verification is stubbed until keys land.
- **Booking is created at guide-accept, not at payment.** Accept snapshots the
  quote into a `pending_deposit` booking and holds the calendar (24h TTL), so
  ops sees the pipeline immediately and the trekker checks out against a fixed
  price. Deposit fulfillment flips it to `deposit_paid` + books the days.
- **`fulfillDeposit` is idempotent two ways:** dedupe by PaymentIntent AND a
  "only from `pending_deposit`" status guard, so a duplicate/stray webhook
  (even with a different PI) never double-records a deposit.
- **Crons are HTTP endpoints, not Supabase edge functions.** Hosting is
  Cloudflare Workers, so Cron Triggers hitting `/api/cron/:job` (secret-gated)
  is the natural fit; the sweep logic lives in `booking.server.ts` and is unit-
  testable.

## 2026-08-09 (M7)

- **Documents are server-mediated, not client-RLS.** The `documents` bucket has
  NO storage policies (service-role only); uploads and views go through server
  actions that check ownership, and views return a short-lived signed URL whose
  access is logged. Simpler and stricter than per-object RLS, and it guarantees
  URLs are never logged.
- **Permit applications auto-create via a DB trigger** on the `→ confirmed`
  transition (not app code), so they appear no matter which path confirms a
  booking (ops doc-verify, or a future flow).
- **Unlocks are pure functions of (start_date, now)** — no scheduled state — so
  the brief (T-7) and guide phone (T-48h) are correct without a cron and are
  trivially unit-tested by varying `now`.
- **Local stack now includes storage-api + imgproxy.** They start fine in the
  sandbox with `--ignore-health-check`; a fresh clone's `supabase start`
  includes them by default. (The `-x` exclusions are only this sandbox's
  workaround for the analytics/vector rlimit crash.)

## 2026-08-09 (M8)

- **Double-blind release is a pure function of the booking's review set + now**
  (`reviewsToRelease`), applied both on submit (`releaseForBooking`) and by a
  daily cron (`releaseStaleReviews`). No scheduled per-review state; the 14-day
  boundary is "≥ 14 days elapsed" (release on day 15+ / exactly 14, not day 13).
- **Messaging is one thread per booking, server-mediated.** Masking happens at
  write time: we store the raw `body` plus a `body_rendered` (masked pre-deposit)
  and the loader shows `body_rendered` while `status = pending_deposit`, the raw
  `body` after. Ops never needs to re-mask; the flag is computed once.
- **OG images embed the font in the bundle** (`og-font.ts`, base64 Liberation
  Sans) rather than fetching one at render. Cloudflare Workers have no
  filesystem and outbound fetch at render is a latency/CSP risk; a ~550KB module
  constant is the reliable trade. Rendered via `workers-og` (satori + resvg wasm).
- **Trekker review photos are untrusted** → inserted as `offering_photos` with
  `source='trekker', approved=false` and surfaced only after ops approval
  (`/ops/moderation`). Recaps only ever show `approved=true` photos.

## 2026-08-10 (M9 security pass)

- **RLS is verified by an executable audit, not by reading policies.**
  `scripts/rls-audit.mjs` connects as anon and asserts deny-reads / allow-views /
  no-private-columns / published-only / deny-writes. It gates releases (exits
  non-zero) and already caught three real defects. Kept as a script (not a Vitest
  test) so `npm test` stays hermetic and Docker-free; run it against a live stack.
- **Verification checks in RLS policies must not depend on the querying role's
  own RLS.** A policy that did `EXISTS (select 1 from guides …)` silently failed
  for anon because `guides` denies anon. Rule going forward: gate cross-table
  policy checks through a `security definer` helper (`is_verified_guide`,
  `is_ops`), never a bare subquery over an RLS-protected table.
- **Public review exposure is view-only.** Anon reads published reviews solely
  through the security-definer `public_reviews` view; the base `reviews` table is
  author/subject/ops only. One projection to maintain, no accidental column leak.
- **Webhook signatures are verified with Web Crypto, not the Stripe SDK.** Keeps
  the no-Node-SDK, Workers-friendly stance; HMAC + constant-time compare +
  timestamp tolerance is the whole contract and is unit-tested with an injected
  clock.

## only_with_me is published unedited (2026-08-11)

Guides write their own `only_with_me` line and it goes live with no ops
review and no copy pass. The action validates length and nothing else.

The obvious objection is quality control — some lines will be weak, and some
will have imperfect English. Accepted deliberately: the entire positioning is
"you are booking a person, not an agency", and second-language English from a
named guide is the strongest available evidence that this is true. A queue
between a guide and their own sentence would also break rule 8 (max two taps)
and would, in practice, mean the founder rewriting 48 sentences into one
voice — which is exactly the agency product we are replacing.

If abuse appears, the answer is a report path and ops takedown, not
pre-moderation.

## Map geometry lives in code, not PostGIS (2026-08-11)

`app/lib/geo.ts` holds district centroids and simplified route lines as
constants. They are approximate by design (a pin means "works out of
Solukhumbu", not "lives here"), they change roughly never, and shipping them
in the bundle means the homepage map renders without a round trip.

Real GPX tracks — actual trekked lines pulled off recaps — are a different
thing and would belong in the database. Basemap is OpenStreetMap raster;
swapping in Baato when the founder has a key is one line in `GuideMap.tsx`.

## Journals are written after the trek, not during it (2026-08-12)

Founder: guides cannot edit while they are on the trail — they write the trek
up once they are back and on wifi.

So the journal editor assumes a connected browser. No offline drafts, no
service-worker queue, no sync-conflict resolution, no autosave against a lost
signal. That is a large amount of work this product does not need, and the
"Save day" button flagged as missing autosave is not a gap.

What the flow does imply: the write-up happens in one long sitting, not in
fourteen two-minute sessions on a ridge. The editor should be built for
somebody working down a list of days at a desk — which is a much easier
target than the one we were designing against.

## First names only, everywhere in the app (2026-08-12)

Founder's rule: no guide's and no trekker's family name appears in the app,
ever. In Nepal a surname is an ethnicity — Sherpa, Tamang, Gurung, Thapa —
and a marketplace that prints it on every card invites people to choose a
guide by caste. A trekker's surname is simply nobody's business.

Enforced in the public views (migration 0042), so a public surface cannot
leak a surname even by accident; signed-in surfaces that read base tables
use firstName() from app/lib/names.ts.

Deliberate exceptions, because they are legal documents rather than UI: the
ops console, contracts, TIMS cards and permit applications keep full legal
names. Guide profile URLs keep their existing slugs (changing them would
break every link and ranking the pages have). Person JSON-LD now carries the
first name only — accepted cost: "Pemba Sherpa" as a search phrase will not
match the structured data, but the rule outranks the ranking.

## The guide is in the group chat; the group's money is not their business (2026-09-06)

Migration 0039 made a trip group private to its members on purpose: four
friends deciding whether to add a rest day is not a conversation the guide
needs. In practice the first thing a group does is ask a question only the
guide can answer, and the organiser ends up relaying it through the booking
thread. So the guide the group is planning with (`trip_groups.guide_id`) now
reads the group and posts in its chat (migration 0056).

Where the line is: the guide talks, and changes nothing. No inviting, no
removing, no payment mode, no cancelling, no joining (joining would put them
on the roster and hand them a share of the bill). They see who is coming,
because that is the party they are guiding — but not each person's share or
what they still owe. Who owes their friend $40 is not a fact a guide needs
in order to guide, and putting it in front of them changes the trip for
everybody.

Not built with it: notifying a group when somebody posts. Every other thread
notifies by SMS to guides and email to trekkers, and fanning that out to a
whole group is a per-message cost decision (Sparrow SMS is metered) rather
than a technical one. Logged in BACKLOG.

## The pipeline is per experience, and it is not the ops board (2026-09-06)

"Pipeline" already meant one thing here — `/ops/pipeline`, a kanban of
booking statuses for the office. This is the other thing it should mean: the
trip's own progress track, for the people on the trip.

One track per kind of experience (`app/lib/pipeline.ts`), because the trips
differ. A trek runs through passports, insurance and permits; a food tour has
a table and an address. The trip page used to show all six ops statuses to
everyone, so a half-day food tour was told it was waiting on "Documents" and
had a permit step it would never reach — a step nobody can take is noise, and
noise in a status track is what makes people stop reading it.

The stages are pinned to the booking statuses we already store rather than a
new column, so nothing can drift: a shorter track just skips positions, and a
day hike sitting at `docs_pending` reads as "Paid" instead of falling off the
end of its own track. Pure and tested, so the group page, the chat, the trip
page and the guide's list cannot disagree about where a trip is.

## Group chat notifies by email only, in bursts, and can be muted (2026-09-06)

The reason group chat shipped silent was cost: every other thread texts the
guide through Sparrow, which is metered per message, and one person typing
"morning!" into a group of six is five texts. Email is not metered per
recipient, so the fan-out is email for everybody — the guide included, who is
the one exception to "guides get SMS" everywhere else in the app. A guide who
misses a group message loses nothing urgent; the booking thread still texts
them.

Three rules keep it from becoming the thing people mute on day one:

- **Never mail the person who just typed.** Obvious, and the bug every group
  chat ships with once.
- **One email per person per group per 30 minutes.** A group agreeing on a
  date sends fifteen messages in four minutes. The window makes that one
  email carrying the last five lines, not fifteen interruptions.
- **Only what they have not seen.** The catch-up starts at the later of their
  last read (`thread_reads`) and their last email, so an email never quotes
  lines they read on the site an hour ago. System lines alone ("Marie
  joined") never earn an email — they ride along inside one a real message
  has already justified.

Muting lives in its own table (`trip_group_mutes`, migration 0057) rather
than a column on the roster, because the guide is in the chat without being
on the roster. It is yours alone: no organiser and no ops policy touches it,
and muting never removes you from the trip.

These are transactional, not marketing: it is a message on a trip you joined,
so it ignores marketing consent and honours the block list — which is exactly
the line drawn in 0055.

## A trip is a package that gets negotiated, not a listing you say yes to (2026-09-06)

The booking flow had one shape: a trekker asked for a date and a party size,
and the guide could answer yes or no. Every real conversation about a trek
ends somewhere else — "add a day at Namche", "skip the flight, we'll bus it",
"there are three of us now" — so the actual agreement happened on WhatsApp and
the booking quietly stopped describing the trip.

Three pieces, one idea:

**Optional lines are choices now.** A guide has always been able to mark a
price line "optional extra", and it did nothing: excluded from the headline,
impossible to tick, never sent anywhere. They are tick boxes on the offering
page, and what a trekker ticks travels with the enquiry
(`enquiries.selected_options`), so the guide answers the trip somebody
actually asked for.

Removed with it: `STANDARD_ADDONS`, a hardcoded two-item catalogue (gear
rental, airport hotel) that moved the total on screen and was never charged
for by anything. A guide who rents gear can price a "Gear hire" line, which is
the same feature without the lie.

**A proposal is the negotiation, written down** (`package_proposals`, 0058).
The guide adjusts days, party, which options are in, and can add one line of
their own; it is priced live in front of them and sent. The trekker sees what
changed in words ("2 days longer — 15 days instead of 13", "Added: gear
hire"), what it costs against what they asked for, and one button that
approves and pays. Approving is what creates the booking — nothing is held and
no money moves before it.

**The proposal snapshots its own price breakdown** in the same shape an
offering carries, so `quote()` prices it with the identical function and every
reader downstream — checkout, the contract, the payout — needs no special
case. It is a snapshot rather than a reference on purpose: editing the listing
next month must not change what somebody already agreed to.

**Deposit is 20%**, down from 30% (founder's call). One constant,
`DEPOSIT_RATE` in pricing.ts; docs/02 §Payment flow still says 30% and wants
updating when the payment docs are next revised.

## The guide form was a trek form with other kinds squeezed in (2026-09-06)

Listing anything but a trek meant answering a step headed "The route" that
contained nothing, starting from 12 days, and reading a price preview split
into "Permits (TIMS + park)" and "Porters" — for a food tour. Steps are now
derived from the kind (no route step where there is no route), the length
defaults to what that kind usually is, and a price row worth nothing is not
shown at all.

## The name is Guides of Nepal, and it lives in one file (2026-09-06)

The working name was "Trek" — in a hundred and thirty-odd places: two
wordmarks, the email from-line, every SMS prefix, schema.org publisher, the
contract, the TIMS card, the price breakdown's fee row. It is now Guides of
Nepal, which is what the domain has said all along.

`app/lib/brand.ts` holds it. Anything that composes a string imports `BRAND`
(or `COMPANY_NAME`, or `SMS_PREFIX`); prose in a page says the name plainly,
because a paragraph built out of constants is unreadable. The next rename is
an afternoon, not a week.

**"trek" the noun did not move.** A trek is a walk in the mountains: "Trek
stories", "a trek from before", `kind: "trek"`, "Trek Manaslu with Binod" —
that last one is a verb — all stayed. Only the capitalised brand changed, which
is why this was done by hand, one occurrence at a time, rather than with a
find-and-replace that would have produced "a Guides of Nepal from before".

**The fee line is now "Our fee (10%)"**, not "Guides of Nepal fee". It sits in
a column beside "Teahouse, food & logistics" and reads better in the first
person, which is also what it is: the platform, talking about itself, on a bill
the platform issued.

**Two SMS templates were trimmed.** The prefix went from 6 characters to 17,
which pushed the welcome and the listing-updated messages past 160 — a second
segment, billed again, on every send. The listing title is now cut to 28
characters (the link survives, because that is the part a guide taps) and the
licence sentence moved to the welcome email, which has room.

**Not renamed, deliberately:** the Cloudflare worker (`trek`), the repository,
the package name, and the workers.dev subdomain. Renaming the worker changes
the live URL, which is a deployment decision and not a branding one.

## `cn` does not resolve Tailwind conflicts, and the calendar proved it (2026-09-06)

A guide selected ten days on `/g/calendar` and saw two of them highlighted.
The cause was not the colour: the day button stacked `st === "open" && "ring-1
ring-inset ring-border"` with `picked && "ring-2 ring-accent"`, and `cn` is a
six-line joiner that puts both in the class attribute. Two utilities setting
the same property, equal specificity — the winner is whichever Tailwind emitted
later in the stylesheet, not whichever was written last. Grey won.

The fix is not to reach for tailwind-merge. It is that a thing with five
mutually exclusive states should say so: `dayLook(state, picked)` returns one
string, chosen by one branch, and the precedence — booked outranks selection,
selection outranks blocked and free — is now readable in five lines instead of
being an accident of CSS order.

Selection is a green **outline** on a pale fill; booked stays a solid green
fill. Two greens meaning different things was the other half of the confusion.

Worth knowing for the rest of the app: any `cn(...)` that conditionally
overrides a utility already in the base string has the same hazard. This was
the only one stacking ring widths; the pattern to avoid is layering, not `cn`
itself.

## The super admin is a list in code, not a column (2026-09-09)

The founder wants to see every account and be able to step into any of them.
That is more than ops: there are several ops accounts, and a flag that ops can
set is a flag ops can set on themselves. So `SUPER_ADMIN_EMAILS` in
`app/lib/super-admin.ts` holds one address, changes with a deploy, and every
page it gates checks the signed-in auth email against it — never a profile
field.

"Copy their password" was the ask, and it does not exist: Supabase keeps a
hash, and nobody can read a password back. The two honest versions are on
`/ops/users`: a one-time sign-in link minted on the spot (`generateLink` →
our own `/ops/users/enter`, which verifies it and sets the session), and a
new password set on the account and shown once. The second replaces the
person's real password and says so before it does.

## Two radii, not three (2026-09-14)

`rounded-card` stays 6px for dense, data-shaped UI; `rounded-photo` is
20px for photographs and anything that floats on one; the auth card is
28px. The 12–14px middle is the template tell and is not used.

## One lime per viewport (2026-09-14)

Chartreuse marks the single thing to do on a screen — match me, request to
book, I'm safe, accept. A second call to action on the same screen is moss.

## Terrain, never blank (2026-09-14)

Most guides and many trips have no photograph yet. Every card and hero has
a designed no-photo state made from real data — the contour pattern with
the route's own line and pins, or a guide's initial — rather than a tan
box. No stock photography, ever.

## The shape of the walk decides the shape of the page (2026-09-16)

A journey page is fifteen days long and was fifteen identical blocks — day
numeral, title, paragraph, one photograph — which reads as a filing cabinet
however well each block is set. The variety had to come from somewhere, and
the only thing on that page we can trust is the altitude the guide wrote
down. So `app/lib/journal-reading.ts` derives it: where the trek breaks into
chapters (the walk in, going higher, the high days, the way down), which days
get a photograph you can see into (the hard day, the highest day, a chapter's
first day), and how far down a reader has to be before the trip is offered.

Derived, never random: the same journal always reads the same way, and a
journal with no altitudes recorded gets the plain treatment rather than a
guessed chapter heading. Three chapters is the floor — two headings are not a
structure.

## One width for a page, not four (2026-09-16)

The journey page was built out of a `max-w-4xl` cover, a `max-w-4xl` guide
strip, a `max-w-6xl` article and a `max-w-4xl` closing panel, and a day
numeral hanging in a 4.5rem margin on top of that. Nothing lined up with
anything: the title started 128px right of day one and the elevation graphic
96px left of it. Any page with bands in it gets one shell constant and every
band uses it.

## A document belongs to a person, not to a booking (2026-09-18)

`docsSettled` was `live.length > 0 && live.every(verified)` — no document
type, no head count — so one verified passport and no insurance at all
confirmed a booking for six and fired the permit trigger. Production held one
party of 1 with three passports and three insurance files, filed under "xyz",
"XYZ" and "INS", because every upload asked "whose is it?" as free text typed
fresh on the day.

Counting could not fix it: "Jon Smith" and "jon smith" are two people to a
count. So `booking_travellers` (0099), and the confirmation rule became "every
named traveller has a verified passport AND a verified insurance certificate,
and the roster covers the whole party". `docsSettled` is deleted rather than
deprecated — the old answer is not a fallback, it is a hole.

And "replaced" is not "rejected" (0101). A second document of the same type
for the same person replaces the first, which the partial unique index
requires — but a rejection is something the office says to a trekker, and the
trekker's page was about to read it back as "your passport needs redoing"
above a reason saying it did not.

## Facts stay derived; the checklist carries what nothing else knows (2026-09-18)

The ops spec asks for thirty tasks per trek with owners and dates, and the
plan had `trip-readiness.ts` read those rows instead of deriving its steps.
Half the spec's tasks are facts this database already holds — the deposit is
in `payments`, the permits are in `permit_applications` — and a row copied
from a fact goes stale the moment the fact changes.

So both, with a seam. `trip_tasks` (0103) carries the work nothing else knows
about: flights booked, porter accepted, hotel confirmed, briefing pack sent,
cash advance handed over. `trip-readiness.ts` keeps deriving the rest.
`syncDerivedTasks` ticks the overlap off the rows and never un-ticks it, so
the two cannot disagree and a task somebody deliberately marked done is not
something a query argues with.

## The board may be overridden, and the override is kept (2026-09-18)

`/ops/pipeline` wrote whatever status the form carried; the only bound was the
database check constraint, so a card could go from "pending deposit" to
"completed" in one drag. The fix is not to forbid it — the office does know
things the system does not, like a deposit paid in cash in Thamel. The facts'
own answer is allowed, anything behind it is allowed (putting a card back is
how a mistake is undone), and moving ahead of the facts needs a written reason
stored on the booking (0104). In six months the question will be who did that.

## A sweep notices the calendar; it does not re-litigate (2026-09-18)

`runStatusSweep` is forward-only. Walking a confirmed trip backwards is a real
move — a passport sent back does un-confirm a trek — but it belongs to the
event that caused it, where the caller knows what changed. A nightly job that
re-derives every booking in the database would have pulled thirteen confirmed
trips back on its first run, on the strength of paperwork rules that were
written after those trips were confirmed.

## Checklists are data the office owns, not code we ship (2026-09-18)

Three lists had grown up in three shapes — the guide verification check types
in `guide-checks.ts`, a trek's thirty tasks in `task-template.ts`, and nothing
at all for putting an experience live — and changing any of them meant a
deploy by somebody who cannot deploy. They are now templates at
`/ops/checklists` (0105) and a new list is a form, not a commit.

Three decisions inside that one:

**One task model, not one per area.** `trip_tasks` was a day old and was
generalised into `checklist_tasks` with a subject rather than copied. Two task
models is exactly the split that let TIMS be issued for routes with no TIMS
permit (0102).

**Guide verification splits into three lists, not one.** A guide walking a
party to 5,364m is asked for altitude training, their own helicopter cover and
a reference somebody actually rang; a host running a momo crawl in Thamel is
asked for the languages on their profile, heard. One flat list for both was
either too much for the host or too little for the guide, and in practice it
was too little.

**Nothing in the data says what kind of guide somebody is.** `guides` carries
a tier and a list of regions and no type. So the core list starts itself and
ops picks the trekking or day one; `applies_to` on a guide list is a label the
office sorts by rather than a rule. When guides carry a type it becomes the
automatic match and nothing else changes. Inventing a guide type to make the
builder tidier would have been a schema decision taken for the sake of a
dropdown.

**The seam from 0103 holds.** Facts stay where they are and tick themselves:
the six papers `guide_verifications` already holds tick the guide's list, and
an experience's photographs and capacity tick its own. What is left is the
work nothing else knows about — the introduction call, the reference, the
test booking — which is what a checklist is actually for.

---

## A guide is free unless they say otherwise

`availability` records what happened to a day, never that a day is free. Four
writers touch it and every one is a reaction: a guide blocking a stretch, a
booking holding days, a deposit confirming them, a cancellation releasing
them. Nothing in the application has ever inserted a row meaning "open".

The two halves of the product read that silence in opposite directions.
`clashingDays` asks only for held/booked/blocked and treats everything else as
free — its docblock says so outright. Every page that displays or searches
guides asked for `status = 'open'` and considered only the rows that came
back, so a day with no row was a day the guide was busy.

What that cost, checked against production: **every guide who joined through
the real application form had zero availability rows.** A verified guide with
a live trip therefore had zero open days, so his own trek page rendered "No
open dates right now" *instead of* the request form — no booking request could
be sent to him at all — and he was absent from every dated search. The 49
guides whose calendars worked were seed data. `supabase/seed.sql` handed each
demo guide 271 open rows, which is exactly why this looked healthy in
development for months.

**The decision: absence means open, derived on read, out to a one-year
horizon** (`app/lib/open-days.ts`, migration 0111). Every reader now queries
the taken days and subtracts — a few hundred rows across the roster instead of
thirteen thousand.

The alternative was to materialise the rows: a trigger on verification plus a
rolling job, mirroring what the seed does by hand. Rejected because it needs a
backfill, needs a job that must never fail, stores ~365 rows per guide to say
nothing, and ends in a horizon that runs out in silence — the same bug again,
a year later. Deriving it has no state to go stale.

Two things fell out of it. `/match` was scoring availability off a truncated
set: `.limit(5000)` against roughly 17,500 open rows, silently. And the seed
now stores only blocked days, so a fresh clone has production's shape rather
than one that hides this class of bug.

Rows with `status = 'open'` remain valid and mean the same as no row, so the
guide's own calendar screen and the 13,000 seeded rows needed no migration.

## The guide's home screen is a list, not a menu

The founder, on a phone: *"Your experiences → Your journeys → Booked trips →
Block dates → Your money → Reviews → these areas look confusing as hell to the
guide."*

The styling was not the problem. Home had four shapes competing to be the
list — a 2×3 grid of six nouns with arrows, a full-width card for questions,
another for writing up a trek, and a pair of stat tiles — pointing at the same
handful of screens, three of them twice. Two labels were actively misleading:
"Your experiences" is the trips a guide sells, "Booked trips" is the trips
they lead, and nothing in either phrase says which is which to somebody
reading English as a third language. They are **"Trips you offer"** and
**"Trips you're leading"** now.

One list, built from data (`app/lib/guide-home.ts`) rather than six
hand-written `<Link>`s with their hrefs typed into the JSX, which is how the
screen drifted out of step with itself in the first place.

The tab bar went back to five. Its own docblock said five was the 360px
ceiling and it had grown to six; "Experiences" is the longest word on it and
does not fit in sixty pixels. It is also the odd one out in kind — the other
four are places a guide goes because somebody is waiting.

And "Journeys from other guides" is gone from `/g`, as asked. It was built so
a guide could learn what a good write-up looks like; the "Write up a trek" row
keeps that door open without giving a guide's own admin screen over to other
people's work.

---

## A guide's money gets its own screen

The founder: *"Fix the guide payout bank info talking area, upload your QR
too."*

The payout fields were a card on the profile page sharing a `<Form>` with the
day rate, under the heading "Rate & payout". One free-text box called "Payout
account" served an eSewa number and a bank account alike, with nowhere to
record which bank or which branch — which is most of what a Nepali transfer
needs. Every field was skip-if-blank, so a wrong number could be overwritten
but never cleared. The method `<select>` had no empty option, so a guide who
had chosen nothing saw "eSewa" selected and reasonably believed it was set:
**4 of 56 guides have no method on file, 5 have no account number and no name.**

**The split is by kind, not by page length.** A day rate is a *price* and
stays on the profile. An account number is a *payment instruction* and moves
to `/g/payout` with the QR and the PAN. Both being one form behind one heading
is the confusion he was pointing at.

**Blank now clears**, and switching from a bank to a wallet nulls the bank
fields rather than leaving a stale bank name attached to an eSewa number.

## The guide's first upload

`uploadGuideDocument` had exactly one caller and it was an ops route, so no
guide had ever uploaded anything: a guide proving their wallet WhatsApped a
screenshot to the office and somebody there filed it. **There were 0
`payout_proof` documents in the database.**

Reused rather than rebuilt: the private `documents` bucket, the existing
`payout_proof` kind (0048), `signedGuideDocumentUrl`'s ten-minute links and
access log. Two things added from the `api.avatar` / `api.journal-photo`
precedent, because `uploadGuideDocument` validates on `file.type` and that is
**routinely empty for a screenshot shared out of another app** — which is
exactly what a payout QR is:

- the bytes are sniffed (`sniffImage`) and the file handed on with a type that
  matches them, so the stored object and its content type always agree;
- JPEGs go through `stripGps`, because a QR is photographed at home.

Verified against production: a JPEG posted as `application/octet-stream` was
stored as `image/jpeg`.

**A guide can read their own papers back.** `/g/doc/:docId` is the ops route's
twin — signed URL, redirect not a rendered link (rule 9), access log — with
one rule of its own: the row must belong to the guide asking, and a document
that is not theirs answers 404 exactly as a missing one does, so the endpoint
cannot be used to discover which ids exist.

## The payout ledger shows where the money goes

`/ops/payouts` is the screen where a person types a number into a banking app.
It showed the guide's name, the trek, the amount, and the word "esewa" —
nothing else. Whoever ran the batch opened each guide's profile in another tab
to find the account, for every line. **Twelve payouts outstanding, none ever
marked paid**, which is not a coincidence.

Each row now carries the full instruction, what is missing from it, whether
anybody has ever checked it, and a link to the QR. A row we cannot pay is not
ticked by default — default-checking one is how a batch gets marked paid that
never went out.

It found two immediately: **Binod Tamang and Lakpa Sherpa hold `bank` accounts
with no bank name**, three payable rows between them, unpayable as recorded.

**Checks are created by the guide, not by a backfill.** Not one of the eight
guides owed money had a `payout_account` check row at all — the rows are made
at application time and these guides predate it. Submitting details or a QR
now creates the row as `pending`, so the office's job appears because somebody
did something, rather than dropping fifty pending items into the queue at once.

## PAN, finally wired to something

`AFTER_VERIFIED` was added with `0109` and read by nothing, so the second half
of *"let them only be able to add that after being verified"* did not exist. A
verified guide now sees a PAN field on the money page — where a tax number
belongs — validated as nine digits, and blocking nothing. Supplying one moves
the check off the `not_required` that 0109 left it at; clearing it does not
drag the office back into reviewing something that is no longer there.

---

## Three fields nobody was filling in

Four of the five screenshots in this round were separate complaints. Three of
them turned out to be the same thing, and the production numbers say it
better than the screenshots did:

| Field | What its own copy claims | Guides who had filled it in |
|---|---|---|
| Trails you have led | "the first thing a trekker reads on your page" | **5 of 56** |
| Your voice | "the strongest thing on your profile" | **4 of 56** |
| Regions you work in | — (no hint at all) | 48 of 56, averaging **0.9 each** |

A multi-select where almost everybody picks exactly one is not a multi-select
anybody understood.

**Regions.** The field had no explanatory line while the one directly below it
did. It now says to tick every region you would *take work in*, not the one
you live in, and says what that buys. Worth knowing and not fixed here: the
field does less than a guide assumes — it feeds `/nepal/:region`, the atlas
and one profile line, but not `/guides` search, not the matcher, and the
office never sees it when deciding to verify somebody.

**Solukhumbu was missing from the list**, which `guide-regions.ts` claimed was
"the regions that actually exist on the routes table". Pikey Peak is filed
under it and `atlas.ts` matches by exact string, so that route could never
have a guide attached — no guide had a box to tick.

**Trails.** A flat A–Z `<select>` over 24 routes, with the region fetched from
the database and never rendered. Now typed, grouped by region, in a shared
`RouteField` used by both the application form and the profile, which had
grown *two separate* pickers. A native `<datalist>` rather than a hand-rolled
combobox, for the reason `DistrictPicker` already gives about the 77
districts: it is the Android keyboard's own filter and it needs no JavaScript.

**The draft bug behind the regions confusion.** Ticking five regions and
coming back gave you none. Two causes, both found by driving a real browser:
`readForm` collapsed the repeated `regions` field to its last value, and the
save effect did not depend on the form snapshot at all — so a tick, which
changes no controlled field, never wrote a draft. And the restore then handed
the values to components that read them only at mount, so they had to be
remounted with a key. Three bugs in a row, each hidden behind the one before.

## The chip limit was one pool, not one per group

`MAX_SKILLS = 8` was shared across all five groups and counted in page order,
so a guide who ticked generously in "What you know" was locked out of "What
you bring" before scrolling to it — with a single counter that gave no clue
that was what had happened. The founder diagnosed it exactly.

Now three per group, each group carrying its own live allowance where the
group is. Fifteen possible instead of eight, and the reason the cap exists
survives: *"the honest guide ticks four and the optimistic one ticks
twenty-three, and the twenty-three-tick guide wins every filter."*

The save also **stopped truncating in silence**. These chips are built to work
with JavaScript off, so a guide could tick fifteen, press Save, be told it
worked, and lose seven without a word. It says what it kept.

## Recording a voice, and the codec parameter that broke it

"Record one" was the label on a file picker. The recorder is an addition, not
a replacement: the file picker opens the phone's own voice-memo app, needs no
microphone permission, and is the only path left when permission is refused —
so it is never hidden, and the recorder renders nothing at all on a browser
that cannot record.

No migration was needed: the upload route and the `guide-audio` bucket already
allow `audio/webm` (Chrome/Android) and `audio/mp4` (Safari).

**Which is exactly where it broke.** Chromium reports its recording as
`audio/webm;codecs=opus`, and both allow-lists hold *bare* types — so the
first real recording came back `400 Sound files only`. The tests passed; the
browser did not. The codec parameter is stripped before the blob becomes a
file, and a test now pins the difference between what a browser reports and
what the server accepts.

## A way back to the site from the sign-in pages

Every sign-in screen had the wordmark as plain text. The one link on the page
lived on the photograph and was `hidden md:block`, so on a phone there was
nothing at all. One `<Link>` in `AuthSplit` fixes all six screens.

---

## A guide is licensed for what they lead, not licensed full stop

The founder, on the application form:

> "I think we need to first ask what are they filling form for, because we
>  need different licence for different things. For example, trek different;
>  we don't need licence for day hikes and all, but anything involved with
>  national heritage Pashupati and all should be done by licenced guides."

Every applicant was asked for a trekking licence number, its expiry and a
photograph of the card, and could not advance without all three. So a
momo-crawl host had to produce a trekking licence they have no reason to
hold, and a heritage walk through Pashupatinath — which *does* need a
licensed guide — was being checked against the wrong card entirely.

**The rule is his, and it lives in a table** (`app/lib/guide-licence.ts`), not
in a condition buried in a form: treks need a trekking guide licence, city and
heritage walks need a tour guide licence, day hikes, food walks and adventure
days need none. When the rule changes, one file changes.

**The vocabulary is `offerings.kind`**, not a new one. What a guide says they
will run and what they can then list are the same five words, so the booking
pipeline, the pricing components and the per-kind checklists all agree without
translation. Migration **0113** adds `guides.guide_kinds` — a column two
earlier migrations explicitly predicted and worked around ("nothing in the
data says what kind of guide somebody is", 0105 and 0106). Every existing
guide is backfilled to `{trek}`, which is a statement of what happened: all 56
applied under a flow that demanded a trekking licence.

**A guide who needs no licence still gets a `licence` check row**, as
`not_required` rather than omitted. The office checklists tick themselves off
these rows by name, so an omitted row would leave "Trekking licence seen"
sitting open forever with nothing able to close it.

**The office checklist now picks itself.** `guide_trek` and `guide_day` have
existed since 0106 and had never been matched automatically for want of this
column. `runChecklist` gets an `appliesTo` and `pickChecklist` does the rest.

### The public copy this made untrue

Fourteen places promised something the rule no longer supports — and
`standards.ts` says of itself that *"nothing here is aspirational, and that is
the whole point"*. Rewritten rather than left overclaiming:

- trust: "a named human with a licence we've seen" → *"licensed for what they
  lead — and we have seen the card"*
- homepage recruitment: "Licensed guides only" → *"Verified guides only"*
- tier 1: "Government licence…" → *"The licence their work needs, photo ID
  against it, and a working phone"*; the bullet now names which card for which
  work
- the guide card's fallback line: "Licensed, and we have met them" →
  *"Checked, and we have met them"*
- and the same in `safety.tsx`, `guides.tsx`, `routes._index.tsx`, `Footer.tsx`

## The reply-time chip was never measured

The founder asked for "~42 min" off the guide card. It should never have been
on it: **nothing in the codebase has ever computed `median_response_mins`.**
Every value on the site was typed into the seed file, and Pemba's was
literally `42`. A number a trekker weighs a person by has to be measured or
absent.

In its place the card now says **what the guide actually runs** — "Treks · Day
hikes · Food & culture" — which is the thing somebody is choosing between and
which the card had never carried. It costs no extra query on the homepage or a
region page (both already load the catalogue) and one batched select on
`/guides`. Reviews moved down beside the rate, which is the pair somebody
weighs at the end of reading a card.

Five copies of the offering-kind labels collapsed into `app/lib/offering-kinds.ts`.

## The trek page: an overview that existed and was never read

`routes.overview` and `routes.highlights` have been there since 0076, rendered
on `/routes/:slug` only. The trek page — where somebody is actually deciding
whether to spend a fortnight — showed one unheaded sentence. It reads them
now; the loader change is two words in a `.select()`.

**"What's included" was unclear for a findable reason: there were two of
them.** A heading in the price box and a section a hundred lines below, saying
almost the same words. The price-box one is "Add to your quote" now, and the
section is one titled block with both columns always drawn — a trip that
listed only exclusions used to render a lone "Not included" and read as a
warning.

**The hero no longer has the walk drawn over it.** A trek opened on
`TrailScene`, which put a white elevation curve and up to four "Day 4 ·
5,364 m" pins across the photograph — obscuring the one thing somebody came to
look at, and limiting a trek to a single image. Every kind of trip now opens
on the carousel, which rotates on its own (paused on hover, focus and touch,
and never for `prefers-reduced-motion`). The day-by-day is still further down,
where it belongs.
