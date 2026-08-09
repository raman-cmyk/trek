# 04 — Design System & UI Spec

## Design intent in one line

Airbnb warmth, National Geographic honesty, zero tourism-brochure clichés. The human face is the primary design element on every screen.

> **This doc defines what things LOOK like. `06-interaction-motion-spec.md` defines how they MOVE and LOAD (skeletons, transitions, sticky booking widget, bottom sheets, blur-up images, perceived-performance). A screen is only "done" when it satisfies both. Read them together.**

## Feel

- **Photography-led.** Real photos of real guides and real trails. Never stock. Imperfect but authentic beats polished but generic. If a photo looks like a stock photo, it doesn't ship.
- **Faces everywhere.** Every offering card carries its guide's face. Every screen answers "who is the human here?"
- **Warm, not corporate.** Generous whitespace, soft shadows, rounded-but-not-bubbly corners (radius 12px cards, 8px buttons), photography does the emotional work.
- **Trust rendered visibly.** Verification badges, response times, review counts, "what we checked" expanders — trust signals are first-class UI, not footer links.

## Tokens

```css
/* Color — earthy, Himalayan, warm. NOT the blue every travel site uses. */
--color-primary: #C2410C;        /* burnt saffron — CTAs, active states */
--color-primary-hover: #9A3412;
--color-ink: #1C1917;            /* warm near-black text */
--color-ink-soft: #57534E;       /* secondary text */
--color-surface: #FAFAF9;        /* page background — warm off-white */
--color-card: #FFFFFF;
--color-border: #E7E5E4;
--color-accent: #0F766E;         /* deep teal — verified badges, success */
--color-gold: #B45309;           /* tier 3 elite accents */
--color-danger: #B91C1C;
--color-himalaya: #1E3A5F;       /* deep mountain blue — used sparingly, headers/footer */

/* Type */
--font-display: 'Fraunces', serif;      /* headings — warm, editorial, human */
--font-body: 'Inter', sans-serif;       /* everything else */
/* Scale: 14 base mobile / 16 desktop; h1 clamp(28px, 5vw, 44px); generous line-height 1.6 body */

/* Spacing: 4px grid. Section padding 64px desktop / 40px mobile. */
/* Shadows: cards 0 1px 3px rgb(0 0 0 / 0.08); hover lift 0 4px 12px rgb(0 0 0 / 0.10) */
/* Radius: 12px cards, 8px buttons/inputs, 999px pills/badges */
```

Tier badges: T1 Verified = teal outline pill "✓ Verified". T2 Trusted = solid teal "✓✓ Trusted". T3 Elite = gold "★ Elite". Every badge tappable → plain-English modal listing exactly what was checked, with dates.

## Components (build once, in /app/components)

- **GuideCard** — photo (3:4), name + district, hook line, tier badge, rating + count, "from $X/day", languages row, response-time chip. Whole card tappable.
- **OfferingCard** — cover photo (4:3), kind chip, title, duration + difficulty, "from $X", **GuideChip** bottom-left overlapping the photo edge (avatar 32px + first name) — the signature visual element of the brand.
- **GuideChip** — avatar + name + tier tick, links to profile. Used everywhere an offering appears.
- **TrustExpander** — "What we checked" accordion on profiles.
- **PriceBreakdown** — always itemized: guide fee / permits / service fee / total. Transparency is the brand; never show only a total.
- **StatusTimeline** — booking states as vertical stepper (My Trips + ops).
- **ReviewBlock** — overall + sub-rating bars + text + optional photo + credited name/country/date.
- **AvailabilityCalendar** — month grid; trekker view (pick dates) and guide view (tap to block).
- **CheckinButton** — giant single button, "I'm safe — Day 4", optional note/photo after tap. Must be usable with gloves at 4,000m: 64px min height.
- **AudioIntro** — play pill next to guide name, waveform animation while playing.
- **EmptyStates** — every list has a designed empty state with one clear next action.

## Page specs

### Home `/`
1. Hero: full-bleed trail photo (real, from a guide), H1 = positioning line "Pick your guide, not your agency.", sub: one sentence, two CTAs: [Find your guide] [Browse experiences]
2. "Meet your guides" — horizontal scroll of 8 GuideCards, [See all guides]
3. "Things to do" — category tabs (Treks / Day hikes / Food & culture / Adventure / City) → OfferingCard grid, 6 shown
4. Trust strip — 3 columns: "Every guide verified" / "Transparent pricing" / "0% commission on rescue flights — ever" (each links to detail)
5. "On the trail right now" — strip: N guides currently trekking + latest 3 approved check-in photos
6. How it works — 3 steps with illustrations
7. Recent reviews carousel
8. Footer: routes list (SEO), about, safety, transparency, contact

### Guide directory `/guides`
Filters (sticky top on mobile, sidebar desktop): route/experience type, dates available, language, tier, price range. Grid of GuideCards, 24/page. Sort: recommended (default — tier + rating + response time), price, most experienced. SSR + URL-param filters (shareable, crawlable).

### Guide profile `/guides/:slug`
- Header: photo carousel, name + district, tier badge, AudioIntro if present, rating + review count, response-time chip, [Message] [See offerings ↓]
- Bio (first person), languages, stats row (years / treks led / on-platform treks)
- TrustExpander
- **Offerings** — this guide's OfferingCards (no GuideChip here, obviously)
- AvailabilityCalendar (read-only)
- Reviews (paginated, recency first)
- Sticky bottom bar mobile: [Message Pemba] [Book]
- JSON-LD Person + AggregateRating

### Offering detail `/experiences/:slug` or `/treks/:slug`
- Photo carousel (mixed guide + credited trekker photos)
- Title, chips (duration, difficulty, max altitude, group size)
- **Guide block** — large: avatar 64px, name, hook line, rating, [Full profile →] — placed ABOVE the fold, before itinerary. The guide is the product.
- PriceBreakdown
- Itinerary accordion (day-by-day / hour-by-hour)
- Included / excluded two-column
- Meeting point mini-map (MapLibre)
- Reviews for this offering
- Booking widget (sticky right rail desktop / sticky bottom sheet mobile): date picker fed by availability, party size, live price, [Request to book]
- Below widget: "Free cancellation until 30 days before" + insurance requirement notice (treks)

### Booking flow (after guide accepts / instant for experiences)
1. Review: offering + guide + dates + PriceBreakdown + policy summary
2. Details: names of all party members, emergency contact (treks)
3. Pay: Stripe Payment Element, deposit amount prominent, "balance of $X charged automatically on {date}"
4. Confirmation: what happens next timeline + document upload CTA (treks)
One column, max 480px wide, progress dots, no distractions.

### My Trips `/trips`
Cards per booking: offering + guide + dates + StatusTimeline. Detail: permit status, documents (upload/view), pre-trek brief (unlocks T-7d), guide phone (unlocks T-48h), SOS card during active trek, [Confirm completion] after end date, review CTA.

### Guide dashboard `/g` (mobile-first, 360px, ruthless simplicity)
- Top: today's state — active trek? → CheckinButton dominates the screen. Otherwise: enquiry count + next booking.
- Enquiries: card = trekker first name + country flag + offering + dates + party. [Accept] [Decline] — two taps max. Accept → prompt to send one welcome message (template pre-filled).
- Bookings: upcoming list, tap for detail + trekker contact (post-deposit)
- Calendar: month grid, tap day to toggle blocked
- Earnings: payable / paid, per booking, NPR, plain language: "You earn रू 40,800 of रू 48,000 — our 15% covers the customer, permits and payments."
- Profile: read view + request-change flow (edits go through ops)
- All labels ≤ 3 words. Icons + text always. Nothing hidden in menus.

### Ops admin `/ops` (desktop, dense, function over form)
- Verification queue: table → guide detail = checklist with per-item [View doc] [Pass] [Fail + note]; tier assignment; approve → guide goes live
- Pipeline: kanban by booking status, card = trekker/guide/route/dates/paid-state; click → full booking record (payments, docs, permits, messages, checkins)
- Permits: table of open permit_applications by start-date proximity, inline status advance, reference-number field
- Payouts: payable rows, checkbox select → [Mark batch paid] + batch ref + receipt upload
- Incidents: list + create; incident view = severity, linked booking, action timeline (append-only)
- Flags: flagged messages review, [Dismiss] [Warn guide] [Strike]
- Photos: moderation queue for trekker photos + check-in photos → approve = public
- Use plain tables, keyboard-friendly. This is Grey Floor energy — speed over beauty.

### Route pages `/routes/:slug`
Markdown article (hero, TOC, content) + "Guides who lead this route" GuideCard row + offerings grid + FAQ (JSON-LD FAQPage) + permit/cost table auto-rendered from permits data (always current — this is the transparency moat as SEO content).

### Recap page `/recap/:slug` (public, shareable)
Route map with line, dates, stats row (days / max altitude / distance), photo grid, big GuideChip "Guided by Pemba ★4.9" → profile, [Book Pemba] CTA, subtle brand watermark. OG image auto-generated (satori) so it unfurls beautifully on Instagram/WhatsApp.

## Interaction rules

- Every async action: optimistic UI or skeleton within 100ms. Slow connections are the norm (guides on 3G, trekkers on teahouse wifi).
- Photos: blur-up placeholders, explicit dimensions, lazy below fold.
- Forms: inline validation, never lose input, autosave long forms (guide application) to localStorage.
- Dates: always show day-of-week ("Tue, 14 Oct") — trekkers plan around weekdays.
- Currency: trekker-facing USD always with $ symbol; guide-facing NPR always with रू.
- Empty states teach: new guide with no enquiries sees "Your profile went live today. Most guides get their first enquiry within 2 weeks. Here's what helps: …"

## Accessibility bar
Semantic HTML, visible focus states, 4.5:1 contrast minimum, alt text mandatory (enforced at upload), audio intros get transcripts (copywriter writes them — also SEO text).
