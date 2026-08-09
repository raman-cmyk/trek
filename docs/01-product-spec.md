# 01 — Product Spec

## Positioning

**"The only place in Nepal where you pick your guide, not your agency."**

Every competitor sells packages where the guide is an anonymous line item. We sell guides as people — their face, their story, their reviews — and everything they offer (multi-day treks, day hikes, food walks, cultural experiences) hangs off their profile. The guide is the atomic unit of the entire platform.

## Users

### Trekker (buyer)
- **T1 — The Planner (primary).** Foreign, 25-45, books a multi-day trek 2-8 weeks before arrival, from abroad, on desktop or mobile web. Researches obsessively. Reads every review. Ticket $600-2,000. Found via SEO/Reddit/Instagram.
- **T2 — The Arrived (secondary).** Tourist already in Kathmandu/Pokhara wanting a day hike, food walk, or experience tomorrow. Mobile web. Ticket $15-80. Wants 2-tap booking, doesn't want to shop.
- **T3 — The Joiner (Phase 2).** Solo traveler who wants to join a group departure to split guide costs.

### Guide (supplier)
- Licensed trekking guide (multi-day) or experience host (day offerings). Cheap Android phone, 3G, English as 2nd/3rd language. Needs: bookings, fast payout, simple UI, fair reviews.

### Ops (internal)
- Founder + small team in Kathmandu. Verifies guides, files permits, monitors treks, handles incidents, runs payouts. **The ops admin is the real product in Phase 1.**

## The two browse lanes (core IA)

### Lane 1 — "Find your guide" (brand-defining)
Feed of guide cards: photo, first name, home district, one-line personality hook, tier badge, rating, starting price/day, languages. Tap → guide profile.

**Guide profile page:**
- Photo carousel (3-5 real photos: headshot, on-trail, lifestyle)
- Optional voice-note intro (30s audio, play button next to photo)
- First-person bio (~150 words, written by our copywriter from a 10-min interview)
- Verification tier badge with plain-English "what we checked" expander
- Stats: years guiding, treks led, response time, languages with proficiency
- **Their offerings** — every trek and experience they lead, as bookable cards
- Reviews (structured sub-ratings + text), recency-weighted
- Availability calendar (month view, open/booked)
- "Message [name]" and "Book" CTAs

### Lane 2 — "Browse experiences" (transactional)
Grid filtered by category (Multi-day Treks / Day Hikes / Food & Culture / Adventure / City), location, date, price. Each card: cover photo, title, duration, price-from, **and the guide's face in the corner** — always. Tap → offering detail.

**Offering detail page:**
- Photo carousel (guide photos + past-trekker photos, credited)
- Title, duration, difficulty, max altitude (treks), group size, what's included/excluded
- Itinerary (day-by-day for treks, hour-by-hour for experiences)
- Transparent price breakdown: guide fee / permits / platform fee — all visible
- **Guide block:** face, name, mini-bio, rating, link to full profile ("Led by Pemba →")
- Reviews for this offering
- Date picker + party size → Book

Both lanes converge on the same booking flow. Same data, two doors.

## Phase 1 feature list (build in this order — mirrors 05-build-plan.md)

### F1. Ops admin (internal, first thing built)
- Guide verification queue: application list, per-guide checklist (licence lookup, ID match, phone verify, payout account, reference calls, police cert), document viewer, approve/reject with notes, tier assignment
- Booking pipeline board: columns = enquiry / quoted / deposit-paid / balance-paid / permits-filed / active / completed / cancelled
- Permit tracker per booking: status stepper (docs-received → filed → approved → ready), reference number, filing date
- Payout ledger: completed bookings awaiting payout, batch marking (paid via eSewa/bank), amount in NPR, receipt upload
- Incident log: severity L1/L2/L3, booking link, timeline of actions, open/closed
- Message monitor: flagged messages (regex: phone numbers, emails, "whatsapp", "viber", "direct") for off-platform solicitation review
- Review moderation queue

### F2. Guide onboarding + dashboard
- Application form (public): name, phone, districts, licence number + expiry, routes/experiences they lead, day rate, languages, photos upload
- Status page: applied → in review → verified (or rejected with reason)
- Guide dashboard (mobile-first, 360px, brutal simplicity):
  - Enquiries inbox: accept / decline / message — max 2 taps
  - Upcoming bookings list
  - Availability calendar (tap dates to block)
  - Daily check-in button (during active trek) — one tap, optional note
  - Earnings: pending / paid, per booking, in NPR
  - Profile view (read-mostly; bio and photos are edited by ops to keep quality bar)

### F3. Public site (SSR, SEO-critical)
- Home: hero with positioning line, Lane 1 guide feed, Lane 2 experience grid, trust strip (verification explainer, "0% commission on rescue flights" pledge)
- Guide directory with filters (route, language, tier, price, availability window)
- Guide profile pages — `/guides/{slug}`
- Offering pages — `/experiences/{slug}` and `/treks/{slug}`
- Route landing pages — `/routes/everest-base-camp` etc. (SEO articles + guides who lead it + offerings) — one per major route, content-managed as markdown
- Price transparency page (the radical-transparency moat, publish real cost breakdowns)
- Trust & safety page
- About page

### F4. Booking + payments
- Enquiry: trekker sends dates + party size + message → guide has 24h to respond (auto-reminder SMS at 12h; auto-release to ops at 24h)
- Quote: guide confirms → system computes total (guide fee × days × party + permit fees + service fee)
- Checkout: Stripe deposit 30% now; balance auto-charged T-14 days (saved payment method). Full payment if booking made inside 14 days.
- Document upload post-booking: passport scan + insurance certificate (hard gate for multi-day treks — booking not confirmed to guide until insurance verified by ops)
- Cancellation flows per policy matrix (see 02-architecture.md §Money)
- My Trips (trekker): status timeline, permit status, documents, guide contact (phone released T-48h), pre-trek brief (packing list, altitude notes, meeting point)

### F5. Messaging
- In-app threads scoped to enquiry/booking
- Email notification on new message (Resend); SMS to guide (Sparrow)
- Off-platform-contact regex flagging → ops monitor
- Contact details auto-masked in messages until deposit paid

### F6. Reviews
- Trigger: booking marked complete + 24h
- Double-blind: hidden until both submit or 14 days pass
- Trekker→guide sub-ratings: safety, communication, local knowledge, English, pace, value + text + optional photo upload (opt-in checkboxes: credit me / show on guide profile)
- Guide→trekker: fitness honesty, punctuality, respect + text
- No deletion of negative reviews; guide gets one public reply; moderation only for policy violations

### F7. Check-ins & safety
- Daily check-in during active multi-day bookings: guide taps button (or replies to SMS)
- Missed 24h → ops alert; missed 48h → escalation flow (call guide → call trekker emergency contact)
- Emergency contact captured at checkout for multi-day treks
- SOS info card in trekker's My Trips: ops phone line, insurer hotline, embassy list

## Explicitly OUT of Phase 1 (stub only, log to BACKLOG.md)
- Group departures (Phase 2 — but schema supports it from day 1)
- Video intros (Tier 2 reward, later)
- Native app, offline maps
- Gear rental, transfers, insurance affiliate checkout add-ons (links only in Phase 1)
- Stripe Connect automated payouts
- Nepali-language UI
- Featured placement / subscriptions

## The "feels alive" mechanics (Phase 1 versions)
- **Guide face on every card, everywhere.** No offering ever appears without its human.
- **Voice-note intros** (optional): 30s audio on guide profile.
- **Past-trekker photos** on offerings, credited ("Sarah, Berlin — Oct 2026").
- **"On the trail now" strip** on home: guides with active bookings + their latest check-in photo (opt-in, moderated). Simple version: count + latest 3 photos.
- **Post-trek recap page** (shareable, public URL): route map, dates, elevation, photos, guide credit, brand watermark, "Book {guide} again" CTA. Auto-generated on completion.
- **Response-time badge** on guide cards ("Usually responds in ~1 hour").

## North star metric
**Completed treks/experiences rated 4.5+ with zero safety incidents.** Not signups, not GMV.

## Copy voice
Warm, direct, human, zero tourism-brochure clichés. Never "unforgettable adventure awaits." Always specific: "Pemba knows every teahouse from Lukla to Gorak Shep." All strings in /app/lib/copy.ts.
