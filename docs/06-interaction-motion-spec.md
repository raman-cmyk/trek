# 06 — Interaction & Motion Spec (Airbnb-grade feel)

This document specifies the interaction patterns, loading states, transitions, and micro-behaviors that make the app feel as polished and reassuring as Airbnb. Claude Code implements these to the letter.

**Legal guardrail (do not skip):** we replicate Airbnb's *interaction patterns and polish level* — patterns that are industry-standard and unprotectable (skeleton loaders, sticky booking rails, image carousels, bottom sheets, map-search). We do NOT copy their exact spacing scale, typeface, icon set, illustration style, or literal visual skin. Our visual identity stays the earthy Himalayan system in 04-design-system.md. The goal: a trekker who uses Airbnb feels instantly at home here, without it looking like a clone.

---

## 1. First principles of the feel

1. **Nothing ever "pops" into existence.** Content fades and rises in. Every appearance is a transition, never a hard cut.
2. **The interface always tells you it's working.** No dead moments. Skeletons, shimmers, and spinners appear within 100ms of any wait.
3. **Optimistic by default.** User actions reflect instantly in the UI; we reconcile with the server behind the scenes and only surface errors if reconciliation fails.
4. **Motion is soft and quick.** Ease-out curves, 200-350ms. Nothing bounces hard, nothing is slow. It should feel like the interface is calm and confident, not playful.
5. **Touch feels physical.** Press states scale down slightly, sheets drag with the finger, scroll has momentum.

---

## 2. Motion tokens (put in /app/lib/motion.ts and Tailwind config)

```
--ease-out-soft:   cubic-bezier(0.16, 1, 0.3, 1);    /* primary — appearance, expansion */
--ease-in-out-soft: cubic-bezier(0.65, 0, 0.35, 1);  /* movement between states */
--ease-press:      cubic-bezier(0.4, 0, 0.6, 1);     /* tap feedback */

--dur-instant: 120ms;   /* press feedback, hover */
--dur-quick:   220ms;   /* most transitions, fades */
--dur-base:    300ms;   /* card entrance, sheet open */
--dur-slow:    450ms;   /* page-level, hero, modal */

--lift-hover: translateY(-2px) + shadow 0 4px 12px rgb(0 0 0 / 0.10);
--press-scale: scale(0.97);
```

**Respect `prefers-reduced-motion`:** when set, replace all transforms/translates with simple opacity fades at --dur-quick, and disable shimmer (use static muted skeleton). This is mandatory, not optional.

---

## 3. Loading states — the heart of the Airbnb feel

Airbnb almost never shows a blank screen or a raw spinner on content. It shows a **skeleton of the exact layout that's about to load**, with a shimmer sweeping across it. Implement a small skeleton system:

### 3.1 Skeleton components (build in /app/components/skeletons/)
Every real component that loads async has a matching skeleton with identical dimensions, so there is **zero layout shift** when real content replaces it.

- `GuideCardSkeleton` — grey 3:4 photo block, two text lines (name, hook), a short pill (badge), a price line. Matches GuideCard exactly.
- `OfferingCardSkeleton` — 4:3 block, title line, meta line, the small circular guide-avatar block bottom-left.
- `GuideProfileSkeleton` — carousel block, name lines, stat row blocks, then 3 OfferingCardSkeletons.
- `OfferingDetailSkeleton` — big carousel block, title, the guide block, price block, itinerary lines.
- `ReviewSkeleton`, `TripCardSkeleton`, `EnquiryCardSkeleton`.

### 3.2 The shimmer
A single reusable shimmer: a diagonal light gradient sweeping left→right across skeleton blocks, ~1.4s loop, `--ease-in-out-soft`.
```
background: linear-gradient(100deg, var(--skeleton-base) 40%, var(--skeleton-highlight) 50%, var(--skeleton-base) 60%);
background-size: 200% 100%;
animation: shimmer 1.4s infinite;   /* @keyframes shimmer: background-position 200% 0 → -200% 0 */
```
Tokens: `--skeleton-base: #EDEBE8; --skeleton-highlight: #F7F5F3;` (warm greys, never blue-grey).

### 3.3 Grid loading behavior
When a list/grid loads: render **8-12 skeleton cards immediately**, in the final grid layout. As real data arrives, cards **cross-fade** from skeleton to real (opacity swap over --dur-quick), and each card is staggered by 30ms in DOM order so the grid "resolves" in a gentle wave rather than all at once. Cap total stagger at ~300ms so it never feels slow.

### 3.4 Route-level loading (React Router)
Use React Router's loader + `useNavigation()` state:
- On navigation with a pending loader, show the **destination's skeleton layout**, not a global spinner. E.g. navigating to a guide profile shows `GuideProfileSkeleton` in the profile layout while the loader runs.
- Keep the previous page's chrome (header, footer) mounted — only the content region swaps to skeleton. This is the "the shell stays, the content fills in" feel.
- Use `<Suspense>` + deferred loaders (`defer()`) so above-the-fold content (guide name, photos) resolves first and reviews/related stream in after with their own inline skeletons.

### 3.5 Image loading — progressive blur-up (critical to the feel)
Every content image:
1. Instantly render a tiny blurred placeholder (either a CSS-blurred low-res thumbnail or a solid average-color block if no thumbnail).
2. Load the full image lazily (below fold) or eagerly (LCP hero).
3. On load, cross-fade full image over the blur (--dur-base) and remove the blur.
4. Explicit width/height always set → no layout shift.
Implement as `<SmartImage>` wrapping this behavior once. Store an average-color hex per photo (compute on upload in ops) for the placeholder block.

### 3.6 Never show
- A raw browser spinner on a content area.
- A blank white screen between routes.
- A layout that shifts when content arrives.
- A spinner where a skeleton could show the shape of what's coming.
Spinners are allowed ONLY inside buttons during a submit (small, inline) and on truly shapeless waits (e.g. Stripe redirect).

---

## 4. Button & action feedback

- **Press:** scale to `--press-scale` over `--dur-instant`, `--ease-press`. Release springs back.
- **Hover (desktop):** primary buttons darken to `--color-primary-hover`; cards lift with `--lift-hover`.
- **Submitting:** button label swaps to an inline spinner + optional text ("Sending…"), button disables, width stays fixed (no reflow). On success, spinner → checkmark for 600ms before navigating/closing.
- **Disabled:** 40% opacity, no pointer.
- Every actionable element has all four states defined. No exceptions.

---

## 5. The booking widget (Airbnb's signature sticky pattern)

### Desktop
- Right-rail card, **sticky** (`position: sticky; top: 96px`) so it follows scroll while itinerary/reviews scroll past on the left.
- Contains: price (large), date picker, party stepper, live-updating total (PriceBreakdown expands on tap), primary CTA.
- When price recalculates (date/party change): the total **counts/fades** to the new number over --dur-quick, never hard-swaps. Small "updating…" text if it involves a server call.
- As the user scrolls past the widget's natural end, it stays pinned until the footer, then releases.

### Mobile
- Collapsed **price bar fixed to bottom** of viewport: left = "$X • 12 days", right = primary CTA button. Always visible.
- Tapping it raises a **bottom sheet** (see §6) containing the full date picker, party stepper, and breakdown. Confirm in the sheet → proceeds to checkout.
- This is the single most Airbnb-defining mobile pattern. Get it exactly right.

---

## 6. Bottom sheets (mobile) & modals (desktop)

The same logical surface renders as a **bottom sheet on mobile** and a **centered modal on desktop**. Used for: date pickers, filters, the booking config, guide "what we checked" details, photo viewer, login.

### Bottom sheet behavior
- Slides up from bottom over --dur-base, --ease-out-soft.
- **Draggable:** a grab handle at top; dragging down past ~40% of its height or with sufficient velocity dismisses it (finger-tracked, not just a close button). Dragging is physical — the sheet follows the finger 1:1.
- Backdrop fades in to `rgb(0 0 0 / 0.4)`; tapping backdrop dismisses.
- Sheet has rounded top corners (20px), subtle top shadow.
- Body scrolls inside the sheet if content overflows; the sheet itself doesn't move once the scroll region takes over (standard nested-scroll handling).
- On dismiss: slides down + backdrop fades, --dur-quick.

### Desktop modal
- Fades + scales from 0.96→1 over --dur-base.
- Backdrop blur (`backdrop-filter: blur(4px)`) + dim.
- Esc + backdrop-click close; focus trapped; returns focus to trigger on close.

Build one `<Sheet>` primitive that switches presentation by breakpoint. Don't build two.

---

## 7. Image carousel / photo viewer

### On cards
- Photos swipeable on touch, arrow buttons on desktop hover.
- **Dot indicators** at bottom (max 5 dots; if more photos, the dots shrink at the edges — Airbnb's exact dot-pagination feel).
- Rounded corners match card radius; images fill via object-cover.
- Swipe is finger-tracked with rubber-band resistance at the ends.

### Full-screen viewer (offering/profile "see all photos")
- Opens as a full-screen overlay, image fades up.
- Grid gallery on open ("show all photos" → mosaic grid), tap any → single-image view with swipe.
- Pinch-zoom on mobile, click-zoom on desktop.
- Photo credit ("Sarah, Berlin — Oct 2026") shown subtly bottom-left.
- Close returns to scroll position.

---

## 8. Search & filter interactions

### Search entry (home)
- The search control expands on focus: on desktop it grows and reveals fields (where / when / who) with a soft expansion (--dur-base, --ease-out-soft) and a backdrop dim behind it. This is Airbnb's expanding-search feel — adopt the *behavior*, keep our own layout and labels.
- On mobile, tapping search opens a full-screen search surface (not a cramped inline field).

### Filters
- Filter changes update results **live** (no "apply" needed for simple filters), with the grid cross-fading to the new set and a skeleton flash only if the fetch exceeds ~200ms.
- A filter bar shows active filters as removable pills; a "Filters" button opens the full filter sheet/modal for advanced options.
- Result count updates with a soft number transition: "218 guides" → "44 guides".
- Clearing filters animates removed cards out and new ones in (stagger, --dur-quick).

### Map view (Phase 2 — spec now so it's not retrofitted)
- Split view: list left, map right (desktop); toggle on mobile.
- Map markers show price/rating; hovering a card highlights its marker and vice versa.
- "Search as I move the map" — panning refetches results for the new bounds (debounced 400ms), grid updates with cross-fade.
- Selected marker lifts and shows a mini-card popover.

---

## 9. Page transitions

- **Within the app (client nav):** content region cross-fades; the header/footer shell persists. No full white flash. Scroll resets to top on new route (except back-navigation, which restores prior scroll position — use React Router's scroll restoration).
- **Card → detail:** the tapped card's image can act as the entry anchor — at minimum, the detail hero fades up while the rest of the page streams in beneath it. (Shared-element transition is a nice-to-have, not required; if implemented, keep it under --dur-slow.)
- **Back navigation:** instant from cache where possible (React Router keeps loader data); restore scroll position.

---

## 10. Micro-interactions & delight (subtle, never gimmicky)

- **Favorite/save (heart):** tap fills with a soft pop (scale 1→1.2→1 over --dur-base) — Airbnb's exact heart feel. Optimistic; syncs after.
- **Stepper (party size):** +/- buttons; number rolls up/down on change.
- **Toasts:** slide in from bottom (mobile) / bottom-right (desktop), auto-dismiss 4s, one line, with an optional action ("Booking sent — View"). Never stack more than 2; queue the rest.
- **Verification badge tap:** the "what we checked" list items check-mark in sequence (staggered 40ms) when the sheet opens — makes trust feel earned, not asserted.
- **Check-in success (guide):** on tap, the big button fills with color and a checkmark draws in; a quiet "You're checked in — see you tomorrow" line appears. This moment matters emotionally for guides on the mountain; make it feel solid and reassuring.
- **Empty states:** a simple line illustration + one sentence + one action. Calm, not cute.
- **Pull-to-refresh** on mobile list screens (guide dashboard, My Trips): standard elastic pull + spinner.

---

## 11. Forms & checkout (calm, confidence-building)

- Multi-step checkout uses a **progress indicator** (dots or a thin bar) — the user always knows how many steps remain. Airbnb's checkout feels short because it's chunked; chunk ours the same way (Review → Details → Pay).
- Inline validation: validate on blur, show success ticks on valid fields, errors appear beneath the field in `--color-danger` without shifting layout (reserve the space).
- The pay step: Stripe Payment Element themed to match tokens; the CTA shows the exact amount ("Pay $360 deposit"); on submit, button → spinner → on success a full-screen soft success state (checkmark draws in, "You're booked!") before revealing next steps. Never dump the user on a raw confirmation with no moment of arrival.
- Autosave long forms (guide application) to localStorage; show "Saved" quietly.

---

## 12. Perceived-performance rules (make it FEEL instant)

1. **Prefetch on intent:** on hover (desktop) or touchstart (mobile) of a guide/offering card, prefetch that route's loader data (React Router `prefetch="intent"`). By the time the tap completes, data is often already there.
2. **Optimistic navigation:** show the destination skeleton immediately on tap, don't wait for the fetch to start rendering.
3. **Stream above-the-fold first:** defer reviews, related guides, and below-fold sections so the hero + guide identity + price render fast; lower sections fill in with their own skeletons.
4. **Cache loader data:** back-navigation is instant from cache.
5. **Debounce, don't block:** filter/search refetches are debounced and never block the UI; the current results stay interactive while new ones load.
6. **Skeleton budget:** if real data arrives within 120ms, skip the skeleton entirely (avoid a flash). Only show skeleton if the wait exceeds ~120ms.

---

## 13. What "done" looks like (acceptance checklist)

A screen matches the Airbnb-grade bar when:
- [ ] It never shows a blank area or raw spinner where a skeleton fits.
- [ ] Its skeleton has identical dimensions to the real content (zero layout shift).
- [ ] Images blur-up; nothing hard-pops.
- [ ] Every button has press/hover/loading/disabled states.
- [ ] On mobile, the primary action is a fixed bottom bar; config happens in a draggable bottom sheet.
- [ ] The booking widget is sticky on desktop and a bottom-sheet on mobile.
- [ ] Navigation keeps the shell, swaps content with a fade, restores scroll on back.
- [ ] Cards prefetch on hover/touch intent.
- [ ] `prefers-reduced-motion` is honored (fades only, no transforms, no shimmer).
- [ ] Nothing takes longer than --dur-slow; nothing is a hard cut.

---

## 14. Implementation order (fold into the M-milestones)

- **M0/M1:** motion tokens, `<SmartImage>`, shimmer + skeleton primitives, `<Sheet>` primitive, `<Button>` with all states. Build these FIRST — everything else consumes them.
- **M3 (public site):** skeletons per page, blur-up images, sticky booking widget, carousels, expanding search, route-level loading with deferred loaders, prefetch-on-intent.
- **M5 (guide dashboard):** pull-to-refresh, check-in success moment, bottom sheets for actions.
- **M6 (booking/checkout):** chunked checkout with progress, themed Stripe element, success-arrival moment, optimistic states.
- **M8:** favorite/heart, toasts, recap share moment.
- **M9:** reduced-motion audit, layout-shift audit (CLS ~0), skeleton-flash audit across the whole app.

Reference this document in every milestone that touches UI. The design system (04) defines *what things look like*; this document defines *how they move and load*. Both are required for a screen to be "done."
