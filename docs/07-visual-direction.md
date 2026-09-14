# 07 — Visual direction: the trail on the picture

The founder sent five references and one instruction: "more of these kind of
vibes, wherever possible, at least a hundred places." This document is what we
took from them, what we did not, and the list of places.

## The direction in one paragraph

Photography or terrain fills the frame, and the interface floats on it as
glass. Every trek is *drawn* — a dotted line across the picture with a few
labelled pins, made from the route's real day stops — so a trip is a picture
of a walk, not a heading over a paragraph. Facts are tiles and strips, not
sentences: a big mono number, a tiny mono-caps label. Filters are pill chips
with a glyph. One lime button per screen says "go". Where we have no
photograph — which is most guides and many trips — the picture is a terrain
drawing built from the same real data, never a blank box. Everything in
04 (the palette, the fonts, "faces everywhere", "zero brochure clichés") and
06 (skeletons, blur-up, sheets, motion) stays.

## Principles, and where each came from

1. **Draw the route.** (Refs 1, 2, 3, 4, 5 — every one.) A dotted line with
   pins over the picture. Made from `day_stops`: real places, real altitudes,
   real day numbers. `TrailScene`, `TrailPin`, `app/lib/trail.ts`.
2. **Glass on a picture, never on cream.** (Refs 1, 2, 5.) `glass` /
   `glass-dark` carry controls and captions on photographs. On paper we keep
   hairlines and mist — glass over cream is a grey box with a blur bill.
3. **Terrain, not blank.** (Our own rule; ref 1's 3D terrain is the spirit.)
   No photo → contour pattern + the ground under the route line, from the
   same stops. Every card and hero has a designed empty state.
4. **Facts as tiles.** (Refs 1, 4, 5 — "$5,000 BUDGET", "2.8 km DISTANCE",
   "Activities 32".) `StatTile`/`StatRow` for the numbers a person compares;
   `FactStrip` for the one-line "what am I looking at". Mono numbers, always.
5. **The `::` eyebrow.** (Ref 1.) Small mono capitals with a double-colon
   mark, replacing the plain `.label` eyebrow on public pages. One system
   glyph, so it reads as a system.
6. **Chips with glyphs are the filter vocabulary.** (Refs 1, 4.) `Chip` is a
   link on server-rendered pages (every filter is a URL), a button in a form,
   a span on a card. Inline SVG glyphs — nothing waits on an icon font.
7. **One lime per viewport.** (Refs 1, 5 — the single "PLAN MY TRIP" / "Start
   walk".) `Button variant="lime"`. It marks the one thing to do here.
8. **Photo cards with a panel.** (Refs 4, 5.) `PhotoCard`: rounded 20px,
   photo fills, words on a dark glass panel at the foot, small pills in the
   top corners. Cards keep the guide's face; the face is still the product.
9. **Photographs pinned to the profile.** (Ref 3.) `ProfileWithPhotos`: the
   trek's elevation line with the journal's own pictures pinned where they
   were taken. The truest picture of a trek we can make.
10. **The moment at the end.** (Ref 5's "Walk complete".) A finished trek gets
    its tiles — days, highest point, photographs — not just a status word.

## Two radii now

`rounded-card` (6px) stays for dense, data-shaped UI: tables, forms, ops.
`rounded-photo` (20px) is for photographs and anything that floats on one.
Auth cards use 28px. Nothing sits in the 12–14px middle.

## Primitives (built; the code is the spec)

| Primitive | File | Used for |
|---|---|---|
| `TrailScene`, `TrailPin` | `design/TrailScene.tsx` | Heroes on route, trek, trip, journal, event, group, guide-active; the auth picture |
| `layoutTrail`, `pickPins`, `trailPath`, `trailArea` | `lib/trail.ts` | The geometry, in percent, tested |
| `PhotoCard` | `design/PhotoCard.tsx` | Offerings, journals, routes, trips, regions |
| `ProfileWithPhotos` | `design/ProfileWithPhotos.tsx` | Journal page; route page when journals exist |
| `Glass`, `GlassPill` | `design/Glass.tsx` | Panels and pills on photographs |
| `Eyebrow` | `design/Eyebrow.tsx` | Every section heading on public pages |
| `Chip`, `ChipRow`, `Glyph` | `design/Chip.tsx` | Filters, tags, routes walked |
| `StatTile`, `StatRow` | `design/StatTile.tsx` | Guide stats, trip stats, the Fund, earnings |
| `FactStrip` | `design/FactStrip.tsx` | Under every title: days · altitude · km · grade |
| `AuthSplit` | `design/AuthSplit.tsx` | All sign-in and sign-up screens |
| `Button variant="lime"` | `Button.tsx` | The one action per screen |

Fallback rule for all of them: no photo → `placeholder-contour` plus
whatever real drawing the data allows. Never `bg-wheat` alone.

## The places (★ = highest impact)

### Shared components
1. ★ `SmartImage` — photographs were invisible without JS / before hydration. Fixed; every picture on the site.
2. ★ `cards.tsx` OfferingCard → PhotoCard shape: rounded-photo, glass kind pill, glass price pill, dark panel; terrain fallback.
3. ★ `cards.tsx` GuideCard → rounded-photo, glass tier pill, glass response pill on the photo; no-photo state carries the guide's initial on contour, not a blank.
4. `JournalCard` → PhotoCard shape: dark panel with meta line, title, guide chip.
5. `RouteCard` → rounded-photo; region/altitude pills become GlassPill.
6. `bits.tsx` ResponseChip/TierBadge → glass variants for use on photos.
7. `skeletons` → radii match the new cards (zero layout shift rule).
8. `Button` → `lime` variant.
9. `app.css` → `.glass`, `.glass-dark`, `rounded-photo`, `.trail-line` draw.
10. `Header` → sign-up pill stays pine (lime is for the page's one action).
11. `Footer` → "Where to walk" region labels become Eyebrows.

### Home
12. ★ Hero: glass search stays; "Find your guide" becomes the page's lime.
13. ★ Stats band → StatRow of tiles with glyphs (verified guides, districts, treks led, the Fund, rescue flights).
14. Section labels → Eyebrow throughout.
15. Intent rows ("Who's free", "Guides who host you…") → Eyebrow + chip "see all".
16. "Where do you want to go?" category tabs → Chip with glyphs (mountain, walk, spark, city, tent).
17. ★ "Browse by region" tiles → PhotoCards on the route photographs, terrain fallback.
18. "Treks, as they happened" → JournalCards (photo cards).
19. "The routes people actually walk" rows → altitude mono + GradeGlyph.
20. Guide call ("Your name on the work") → lime button, FactStrip of what you keep.
21. Review pull-quote → glass-dark on the pine band.

### Guides index
22. ★ Quick filters → ChipRow with glyphs (women guiding, Elite, speaks German/French/Japanese, free this week) as URL chips above the grid.
23. Selects fold into a "More filters" details.
24. Count line → Eyebrow.
25. ★ Grid of GuideCards in the new shape.
26. "Not sure who fits?" bar → glass pill bar, lime "Match me".

### Guide profile
27. ★ Header numbers (years, treks led, rating, responds in) → StatRow with glyphs.
28. "Routes X has walked" → Chips with the route glyph and the count.
29. Verification facts → FactStrip.
30. Offerings → PhotoCards.
31. Journals → JournalCards.
32. Photographs → rounded-photo tiles.
33. Availability header → StatTiles (free / taken).
34. Every section heading → Eyebrow above.
35. ★ Sticky mobile bar → glass, lime "Message".
36. Booking rail → rounded-photo, lime "Message — free".

### Experiences index
37. Kind tabs → Chips with glyphs.
38. Count → Eyebrow.
39. ★ OfferingCards in the new shape.
40. "See all" links → chips.

### Trek / experience detail
41. ★ Cover → TrailScene with the route's day stops over the cover photo; terrain fallback for the many trips with no cover.
42. ★ Under the title → FactStrip (days · up to N people · highest point · route).
43. "Led by" block → rounded-photo with StatTiles (rating, responds in).
44. Backup guide line → GlassPill on paper? No — plain chip.
45. ★ Booking widget → rounded-photo card; "Request to book" is the page's lime.
46. "What happens when you send this" → keeps the tick list; Eyebrow header.
47. Itinerary rows → day number mono, altitude mono where known.
48. Included / not included → chips with check/×.
49. Meeting point → FactStrip line.
50. Section headings → Eyebrow.

### Routes index
51. Intro → Eyebrow; "Match me to a route" lime.
52. Region and grade filter rows → Chips with glyphs.
53. ★ RouteCards: rounded-photo, glass pills; the profile-over-photo stays.
54. Sort tabs → chips.

### Route detail
55. ★ Hero → TrailScene: hero photo, dotted route, pins at start / summit / end.
56. ★ FactStrip in the hero (days · altitude · km · grade · best months).
57. "The shape of it" → keeps the scrubber; Eyebrow.
58. ★ Photographs pinned to the profile where journals for this route exist.
59. Day by day → altitude mono, up/down delta.
60. Permits → StatTiles (each permit's cost).
61. "When to walk it" → Eyebrow, month chips.
62. "Book this route" → PhotoCards of offerings.
63. FAQ → Eyebrow.

### Journals index
64. Filter chips → Chips with glyphs (region mountain, season calendar).
65. ★ JournalCards in the new shape; feature card keeps the split.
66. Count → Eyebrow.

### Journal
67. ★ Hero → TrailScene over the cover with the route's stops.
68. Sticky guide bar → glass.
69. ★ "How high, and when" → ProfileWithPhotos: the trek line with this journal's photographs pinned by day.
70. Stats → StatTiles (days, highest, km).
71. Day headings → Eyebrow "Day N · place · altitude".
72. Closing "Trek X with Y" band → lime button.

### Events
73. Index intro → Eyebrow; "Organise one" lime.
74. Empty state → terrain PhotoCard, not a bordered box.
75. Event cards → PhotoCards.
76. ★ Event hero → TrailScene with FactStrip (dates · days · places left).
77. Join box → rounded-photo, lime "Join".

### Groups
78. Index cards → PhotoCards (cover or terrain).
79. ★ Group hero → TrailScene band with the trek's stops.
80. "Ask Pemba to take us" → lime (moved up last session; now the lime).
81. Roster → avatar chips.
82. Money split → StatTiles.

### Match
83. ★ Question rows → Chips with glyphs (region mountain, month calendar, budget, language, difficulty).
84. "Match me" → lime.
85. Results → GuideCards in the new shape with a FactStrip "why".

### Stories, Safety, Trust, Fund, Insurance
86. Page intros → Eyebrow + light/heavy display heading.
87. Safety sections → rounded-photo cards with glyph.
88. Trust tiers → chips.
89. Fund numbers → StatTiles.
90. Insurance checker result → chip states.

### Auth (all done)
91. ★ Login → AuthSplit.
92. Guide login → AuthSplit.
93. Ops login → AuthSplit.
94. ★ Signup → AuthSplit, progress bar kept.
95. Forgot → AuthSplit.
96. Reset → AuthSplit.
97. Apply → AuthSplit wide.

### My trips
98. ★ Booking rows → PhotoCards (cover or terrain) with glass status pill and the compact pipeline line.
99. "Waiting for you" proposal → lime.
100. Empty state → terrain PhotoCard "Find your guide".

### Trip detail
101. ★ Header → TrailScene band with the route's stops; FactStrip (dates · days · party).
102. Documents / insurance → rounded-photo cards.
103. "View permit" → GlassPill link.
104. ★ Finished trek → "Home safe" StatTiles: days walked, highest point, check-ins sent, photographs.
105. Group link → chip.

### Trekker profile
106. Header → StatTiles (treks with us, guides' rating).
107. Sections → Eyebrow.

### Guide dashboard (360px)
108. ★ Home: active trek → TrailScene band with today's pin; the check-in is the lime.
109. Home: setup checklist → rows with check chips.
110. Home: work levers → StatTiles (open days, unreplied reviews, response).
111. Home: journal feed → small PhotoCards.
112. ★ Safety check-in: each trip a StatTile row (day N of T, sent) + the lime button.
113. Bookings: glass status pill, permits line.
114. Requests: FactStrip (dates · party · country) on each card; Accept lime.
115. Calendar: legend → chips.
116. Earnings → StatTiles in NPR.
117. Experiences list → PhotoCards.
118. Journals list → PhotoCards; editor day headers Eyebrow.
119. Active trek → TrailScene with day pins, glass "Day N of T".
120. Profile: photographs → rounded-photo tiles; routes walked → chips.

### Messages
121. Thread header → glass sticky.
122. Package card → rounded-photo.

## What not to do

- No stock photographs, ever. A guide's own picture or a terrain drawing.
- No weather, temperature, UV or "species". We do not hold it; we do not show it.
- No 3D terrain. The real profile is the terrain.
- Glass on cream. Never.
- Two lime buttons on one screen. The second one is moss.
- 12–14px radii. Either 6 or 20 (28 for the auth card).
- Pins on every day. Start, summit, end, and at most one or two more.
- Losing the face. A photo card of a trip still carries the guide's chip.

## Verification

Every screen at 1280 and 400; every `/g/*` screen at 360 over throttled 3G.
JavaScript off once per screen: images visible, filters still URLs, forms
still post. `npm run typecheck`, `vitest`, `npm run build` green.
