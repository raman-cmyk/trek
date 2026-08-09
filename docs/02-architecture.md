# 02 — Architecture

## Stack summary

| Layer | Choice | Why |
|---|---|---|
| Framework | React Router v7 (framework mode, SSR) on Cloudflare Workers | Vite-based (founder's familiar ecosystem), true SSR for SEO, deploys to Cloudflare like Grey Floor |
| DB / Auth / Storage | Supabase | Founder already operates it daily |
| Payments | Stripe Payment Intents (US LLC account) | Nepal entities can't hold Stripe; Wyoming LLC collects USD |
| Guide payouts | Manual NPR batches (eSewa/Khalti/bank), recorded in payout ledger | Stripe Connect can't reach Nepali banks; manual is fine at Phase 1 volume |
| Email | Resend | Simple API, good deliverability |
| SMS (guides) | Sparrow SMS via Supabase edge function | Local Nepal provider; intl SMS to Nepal is unreliable/expensive |
| Analytics | PostHog | Product analytics + session replay |
| Maps | MapLibre + OSM tiles | Free; Google Maps pricing punishes map-heavy travel sites |
| Media | Supabase Storage (public bucket for photos, private for documents) | One less vendor; images served via Cloudflare-cached transform URLs |

## App architecture

- **SSR everything public.** Loaders fetch from Supabase server-side with the service key where needed (read-only public data uses anon key + RLS).
- **Auth:** Supabase Auth. Email magic-link for trekkers (lowest friction for foreigners), phone OTP for guides (they live on their phone number). Roles in `users.role`: trekker / guide / ops.
- **Sessions:** Supabase SSR cookie helpers.
- **Route groups:**
  - `/` `/guides` `/guides/:slug` `/experiences` `/experiences/:slug` `/treks/:slug` `/routes/:slug` `/transparency` `/safety` — public, SSR, cached
  - `/trips/*` — trekker auth
  - `/g/*` — guide auth (short path, mobile-first)
  - `/ops/*` — ops auth (role-gated)
  - `/api/webhooks/stripe` — webhook handler
- **Edge functions (Supabase):** `send-sms`, `enquiry-expiry-sweep` (cron 15min), `balance-charge-sweep` (cron daily: charge T-14 balances), `checkin-alert-sweep` (cron hourly), `document-retention-sweep` (cron daily)

## Money

### Currency & storage
- Trekkers pay **USD**. Guides earn **NPR**. FX rate snapshotted at booking time into `bookings.fx_rate_npr` — guide's NPR earning is fixed at booking, platform carries FX drift (small at Phase 1 volume; revisit at scale).
- All amounts integer cents/paisa. `amount_usd_cents`, `amount_npr_paisa`.

### Fee math (single source of truth: /app/lib/pricing.ts)
```
guide_fee      = guide_day_rate × days × party_size        (multi-day)
               = offering_price × party_size                (experiences)
porter_fee     = porter_day_rate × days × porters           (optional)
permit_fees    = Σ permits for route × party_size
service_fee    = 8% of (guide_fee + porter_fee)             (charged to trekker)
permit_handling= $25 flat (multi-day only)
platform_commission = 15% of (guide_fee + porter_fee)       (deducted from guide payout)

trekker_pays   = guide_fee + porter_fee + permit_fees + service_fee + permit_handling
guide_receives = (guide_fee + porter_fee) × 0.85            → converted to NPR at booking fx_rate
```
Commission shown openly on guide dashboard: "You earn $306 of $360."

### Payment flow
1. Deposit: Stripe PaymentIntent for 30% at booking; card saved (SetupIntent alongside).
2. Balance: cron charges saved method at T-14 days. Failure → email+dashboard warning, retry T-13, T-12; unpaid at T-10 → auto-cancel per policy.
3. Inside-14-day bookings: 100% upfront.
4. Refunds via Stripe refund API per policy matrix below; every refund row recorded in `payments` with type=refund.

### Cancellation policy matrix (encode in /app/lib/policy.ts)
| Trekker cancels | Refund to trekker | Guide compensation |
|---|---|---|
| ≥30 days | 100% − Stripe fees | 0 |
| 15-29 days | 50% | 25% of guide fee |
| 7-14 days | 25% | 50% of guide fee |
| <7 days | 0% | 50% of guide fee |
| Force majeure (route closure, disaster) | 100% | 0 (platform absorbs fees) |

Guide cancels: trekker 100% refund always; platform rebooks at platform cost; guide penalty ladder (strike 1 warning, strike 2 ranking penalty 90 days, strike 3 removal) tracked in `guide_strikes`.

### Payouts
- Trigger: trekker confirms completion, or auto 72h after scheduled end.
- Weekly batch: ops filters payable rows → marks batch → pays via eSewa/bank outside the app → records reference + uploads receipt. Full ledger, no money movement in-app for Phase 1.

## SEO architecture (this is the demand engine — treat as a feature, not a chore)

- SSR + streaming; public pages must render complete HTML without JS.
- Per-page: title, meta description, canonical, OpenGraph + Twitter cards with real guide/offering photos.
- **JSON-LD:** `Person` on guide profiles, `Product` + `AggregateRating` + `Offer` on offerings, `TouristTrip` on route pages, `FAQPage` where applicable, `BreadcrumbList` everywhere.
- Route landing pages content-managed as markdown in /content/routes/*.md, rendered SSR with frontmatter (title, meta, hero image, related route slugs). Copywriter edits markdown, never components.
- Slugs immutable once published; 301 table in DB for renames.
- Sitemap.xml generated per-request from DB (guides + offerings + routes + articles), cached 1h.
- Image alt text mandatory (enforced in ops photo upload form).
- Core Web Vitals budget: LCP < 2.5s on 4G. Images via Cloudflare Image Resizing, lazy-loaded below fold, explicit dimensions.

## Security & privacy

- RLS default-deny on all tables. Trekkers see own rows; guides see own + their bookings' trekker names (not documents); ops role sees all.
- **Documents bucket (passports/insurance):** private; signed URLs 10-min TTL; access only via ops UI and the owning trekker; access logged to `document_access_log`; auto-delete 90 days post-trek-completion (`document-retention-sweep`).
- Phone numbers and emails masked in messages pre-deposit (`/app/lib/mask.ts` regex; store original, render masked).
- Stripe webhooks signature-verified; idempotency keys on all charge/refund calls.
- Rate limiting on auth + enquiry endpoints (Cloudflare).
- PII in logs: never. Log IDs only.

## Notifications matrix

| Event | Trekker | Guide | Ops |
|---|---|---|---|
| New enquiry | — | SMS + email | — |
| Enquiry 12h unanswered | — | SMS reminder | — |
| Enquiry 24h unanswered | email (we're on it) | — | dashboard alert |
| Quote sent | email | — | — |
| Deposit paid | email receipt | SMS confirmed | pipeline moves |
| Insurance verified | email | — | checklist tick |
| Balance charged / failed | email | — | alert on fail |
| T-48h | brief email + guide phone released | SMS reminder | — |
| Missed check-in 24h | — | SMS | dashboard alert |
| Missed check-in 48h | — | — | escalation task |
| Completion | review request | review request + payout ETA | payout queue |
| Payout sent | — | SMS | ledger row |

## Environments
- `dev` (local, .dev.vars + supabase local), `production` (Cloudflare + Supabase cloud). No staging in Phase 1 — seed data + preview deployments cover it.
- Preview deployments on every PR via Cloudflare.

## Testing bar (pragmatic, not dogmatic)
- Unit tests required for: pricing.ts, policy.ts, mask.ts, fee math, cancellation refund calculator.
- One Playwright happy-path: browse → enquire → quote → pay (Stripe test mode) → ops pipeline reflects it.
- Everything else: manual against seed data.
