# Technical SEO Audit — Trek

Audited 2026-08-12 against the codebase at `claude/app-build-lgnkqo` (57 route
files). Findings only — no code was changed. Method: every route file checked
for a `meta` export, canonical, OG/Twitter tags, loader-vs-client rendering,
JSON-LD, and heading structure; shared meta plumbing read at the source
(`app/lib/seo.ts`); claims spot-verified against rendered HTML where noted.

## How meta works here (context for the table)

Nearly every public route builds its tags through one helper, `pageMeta()` in
`app/lib/seo.ts`, which always emits: unique title, meta description,
`<link rel="canonical">`, `og:title/description/type/url`, and
`twitter:card/title/description` — plus `og:image`/`twitter:image` when an
image is passed. So "uses pageMeta" ⇒ items 1–3 are structurally present; the
per-route questions are whether the *content* is dynamic and whether the image
is usable. JSON-LD is emitted per route via `jsonLd()` helpers, plus a
sitewide `Organization` node rendered from the `_public` layout body.

## Systemic findings (these affect many rows at once)

### S1 — HIGH · og:image URLs are relative on five of six detail page types
`pageMeta` passes the image through verbatim. What arrives is a
database-relative path:

| Page type | Image passed | Example value |
|---|---|---|
| `routes/$slug` | `r.hero_photo_url` | `/img/routes/everest-base-camp.jpg` |
| `guides/$slug` | `g.avatar_url` | `/img/guides/pemba-sherpa.jpg` |
| `journals/$slug` | `j.cover_photo_url` | `/img/journal/dawn.jpg` |
| `treks/$slug` | `o.cover_photo_url` (via `app/features/offering-detail.server.ts:89`) | relative |
| `experiences/$slug` | same | relative |
| `recap/$slug` | `absoluteUrl(env.SITE_URL, …/og)` | **absolute — the only correct one** |

Social scrapers (Facebook, WhatsApp, Slack, X) require absolute `og:image`
URLs; a relative path means **shares of every route, guide, trek, experience
and journal page render with no image**, while `twitter:card` still claims
`summary_large_image`. Fix is one line at the `pageMeta` boundary (wrap in
`absoluteUrl`) or in each caller. `recap/$slug` shows the correct pattern.

### S2 — HIGH (infrastructure, not code) · every canonical points at workers.dev
`SITE_URL` is the temporary domain, so every canonical, `og:url`, sitemap
entry and schema `@id` bakes in `trek.raman-7d9.workers.dev`. Nothing to fix
in code — but all indexing equity accrues to a throwaway domain until the real
one exists. Raised before; still the largest single SEO item on the project.

### S3 — MED · no og:image at all on the homepage and list pages
`home`, `guides`, `experiences`, `routes` (index), `journals` (index),
`events`, `groups`, `stories`, and the static trust pages pass no `image` to
`pageMeta`, so shares of those URLs render as bare text. A single default
site image (the hero) passed as a fallback would cover all of them.

### S4 — OK · zero client-side data fetching
Every route renders its primary content from a loader, server-side. The only
`fetch()` calls in the app are event-handler uploads (photo pickers in
`apply`, `MediaPicker`, `ExperienceForm`, `JournalEditor`) — user actions, not
content hydration. **No route needs flagging under check #4.** Verified
additionally by curling rendered HTML for detail pages: full content present
with JavaScript disabled (including the Langtang climb page).

### S5 — LOW · `/ops` layout has no `noindex` meta
`/g`, `/trips`, `/checkout`, `/messages`, `/login`, `/signup`, `/_dev` all
carry `robots: noindex`; `ops.tsx` relies on the robots.txt `Disallow: /ops`
alone. Disallow prevents crawling but not URL-reference indexing if a link
ever leaks. One line to add.

### S6 — MED (content, not markup) · 21 of 24 route pages have no article
`app/lib/content.ts` carries hand-written articles (with their own FAQs) for
3 routes. The other 21 render real data (itinerary, permits, months, guides)
but no prose targeting question queries. This is the biggest *content* gap;
markup is not the limiter.

## Root files

| File | Status |
|---|---|
| `robots.txt` | ✅ Dynamic route (`robots.txt.tsx`). Wildcard rules + 13 named AI crawlers each with explicit public Allows and auth-path Disallows; points at sitemap and llms.txt. Cache 1h. |
| `sitemap.xml` | ✅ Dynamic route, **built from Supabase** per request: guides, treks, experiences, routes, journals, recaps, events + static pages (154 URLs live). Not static. |
| `llms.txt` | ✅ Dynamic route, built from Supabase — every guide and route listed, cannot drift from live data. |
| `public/` | No static robots/sitemap shadowing the dynamic ones (correct — Workers assets would win). |

## Route-by-route

Severity: 🔴 HIGH (hurts indexing/sharing now) · 🟡 MED · 🔵 LOW · ✅ clean.
"S1/S3" reference the systemic findings above. Private = noindexed and/or
robots-disallowed; SEO checks intentionally n/a there.

### Public — detail pages (the SEO surface)

| Route | meta (dynamic?) | canonical | OG/Twitter | SSR | JSON-LD | h1 | Issues | Severity |
|---|---|---|---|---|---|---|---|---|
| `routes/$slug` | ✅ from loader (name, days, altitude) | ✅ | ⚠️ image relative | ✅ (incl. climb variant) | TouristTrip + itinerary + AggregateOffer + rating, BreadcrumbList, FAQPage | 1 (ClimbRoute or standard hero) | S1 | 🔴 |
| `guides/$slug` | ✅ from loader (name, district, quote) | ✅ | ⚠️ image relative | ✅ | Person (languages, knowsAbout, Offer, rating), BreadcrumbList, FAQPage (from answered AMA) | 1 (trust card) | S1; Person `name` is first-name only (deliberate, per naming rule — noted, not a defect) | 🔴 |
| `treks/$slug` | ✅ from loader | ✅ | ⚠️ image relative | ✅ | Product + Offer (+ rating when reviews), BreadcrumbList | 1 (in `OfferingDetailView`) | S1 | 🔴 |
| `experiences/$slug` | ✅ from loader | ✅ | ⚠️ image relative | ✅ | Product + Offer, BreadcrumbList | 1 (in `OfferingDetailView`) | S1 | 🔴 |
| `journals/$slug` | ✅ from loader | ✅ | ⚠️ image relative | ✅ | Article (author, publisher, about), BreadcrumbList | 1 | S1 | 🔴 |
| `events/$slug` | ✅ from loader | ✅ | ⚠️ no image | ✅ | Event | 1 | S3 | 🟡 |
| `groups/$slug` | ✅ from loader | ✅ | ⚠️ no image | ✅ | none | 1 | S3; no schema (semi-private content — acceptable) | 🔵 |
| `recap/$slug` | ✅ from loader | ✅ | ✅ absolute (own `/og` image route) | ✅ | none | 1 | Article schema would fit; only page doing og:image right | 🔵 |

### Public — index/browse pages

| Route | meta | canonical | OG/Twitter | SSR | JSON-LD | h1 | Issues | Severity |
|---|---|---|---|---|---|---|---|---|
| `home` | ✅ unique | ✅ | ⚠️ no image | ✅ | Organization (layout) | 1 | S3 | 🟡 |
| `guides` (browse) | ✅ dynamic count/intent | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🟡 |
| `experiences` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🟡 |
| `routes._index` | ✅ | ✅ | ⚠️ no image | ✅ | ItemList + Organization | 1 | S3 | 🟡 |
| `journals._index` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🟡 |
| `events._index` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🟡 |
| `groups._index` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |
| `stories` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |
| `match` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |

### Public — static/trust pages

| Route | meta | canonical | OG/Twitter | SSR | JSON-LD | h1 | Issues | Severity |
|---|---|---|---|---|---|---|---|---|
| `trust` | ✅ unique (hardcoded — fine, static page) | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |
| `transparency` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |
| `safety` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |
| `insurance` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3; FAQPage would fit this page well | 🔵 |
| `fund` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |
| `hosts` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |
| `apply` | ✅ | ✅ | ⚠️ no image | ✅ | Organization | 1 | S3 | 🔵 |
| `events.new` | ✅ | ✅ | — | ✅ | — | 1 | public form page; fine | ✅ |
| `groups.new` | ✅ | ✅ | — | ✅ | — | 1 | fine | ✅ |

### Auth/private (noindex intended — checks n/a)

| Route(s) | noindex? | Notes | Severity |
|---|---|---|---|
| `login`, `signup` | ✅ meta noindex | title-only meta, deliberate | ✅ |
| `g.tsx` + all 15 `g.*` children | ✅ layout noindex + robots disallow | — | ✅ |
| `trips._index`, `trips.$bookingId`, `checkout.$bookingId`, `messages*`, `conversations` | ✅ noindex + robots disallow | — | ✅ |
| `ops.tsx` + all 14 `ops.*` children | ⚠️ robots disallow only, **no noindex meta** | S5 | 🔵 |
| `ops.login`, `g.login` | title-only meta; under disallowed paths (`/ops`, `/g`) | — | ✅ |
| `_dev.primitives` | ✅ noindex | — | ✅ |
| `enquiry`, `logout`, `api.*`, `pdf.*`, `trips.$bookingId.doc.$docId`, `recap.$slug.og` | resource/action endpoints, no meta needed; `/api` `/pdf` robots-disallowed | — | ✅ |

### Heading structure note (check #6)

Every public page has exactly one `<h1>` (for `treks/$slug` and
`experiences/$slug` it lives in the shared `OfferingDetailView`; for Langtang
in `ClimbRoute`). Spot-checked order is sane: h1 → h2 sections → h3 items
(e.g. the AMA wall renders questions as h3 under an h2). The climb page keeps
its day headings as visually-hidden h2s, so the outline survives the visual
design. No page with zero or multiple h1s was found.

## Priority order, if/when fixes are commissioned

1. **S1** — absolutize `og:image` (one-line fix at the `pageMeta` boundary;
   restores share previews on the five page types that are the whole SEO
   surface).
2. **S2** — real domain + `SITE_URL` (browser task + redeploy).
3. **S3** — sitewide default og:image fallback in `pageMeta`.
4. **S5** — `noindex` on the ops layout.
5. **S6** — the 21 missing route articles (content work, biggest long-term
   lever).
