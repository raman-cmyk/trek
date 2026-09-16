# Bug sweep — 16 September 2026

A deliberate hunt rather than a pass over a diff. What follows is what was
**verified**: reproduced, or confirmed against production data. Candidates that
a regex flagged and reading disproved are in "Checked and clean" at the bottom,
because knowing a class is clean is worth as much as finding one that is not.

## Fixed

| # | What | How it showed up | Severity |
|---|---|---|---|
| 1 | `parseRange` checked a date's shape, never that the date exists. `new Date("9999-99-99")` is Invalid, and `toISOString()` throws. | **`/experiences?from=9999-99-99` returned 500 in production.** Also `?from=2026-13-40`. | High — a pasted link or a crawler took the page down |
| 2 | Same crash on the guides browser. | **`/guides?from=9999-99-99` → 500.** | High |
| 3 | `addDays` threw on an unparseable date. Exported, reachable from a URL, and one of four separate `addDays` implementations in the codebase. | Root cause of 1 and 2. | High |
| 4 | An impossible day silently rolled forward — `2026-02-30` became 2 March. | Results for a date nobody asked for. | Medium |
| 5 | A guide typing "4,200" in a journal day block stored `NaN` as the altitude. | Silent bad data. | Medium |
| 6 | `/match?month=abc` reached the matcher as `NaN`, which compares false against everything. | Results silently emptied while the control still read "any". | Medium |
| 7 | Cached HTML outlived the bundles it references. HTML is cached 300s; client bundles are content-hashed and a deploy deletes the old ones. | **Measured live: the document asked for `root-DletlmBN.js` when the worker had `root-ex2jCeV9.js`.** For five minutes after every deploy, visitors got the page with *no JavaScript at all* — no map, no calendar, no filters, no booking widget — and no visible error. | **Highest** |
| 8 | No favicon, of any kind. | A 404 in the console on **every page load**, and a blank icon in every tab, bookmark and phone home screen. | Medium |
| 9 | No apple-touch-icon and no web manifest. | Blank icon when added to a phone home screen. | Low |
| 10 | The one hand-rolled JSON-LD block was not escaped, while every other goes through React Router's `escapeHtml`. | Not exploitable — a URL origin cannot carry `</script>` — but its safety rested on that argument rather than on escaping. | Low |
| 11–15 | Five writes in the guide's profile editor returned **"Saved."** without checking whether the write worked: skills, emergency contact, rate and payout details, their own words, and the profile patch. | A guide edits their payout account, sees a green tick, and it may not be there. | High |

## Verified, not fixed — these are yours to decide

**A. The fee is 10% in every word and 8% in the code, on 12 live trips.**
`pricing.ts` sets `SERVICE_FEE_RATE = 0.08`. Every multi-day trek carries its
own `trek_pct` of `0.10` in the database and charges 10%. The 12 single-day
experiences have no breakdown, fall through to `pricing.ts`, and are charged
**8%** — while the trip page, `/transparency`, `llms.txt`, the JSON-LD
description and the guide onboarding email all say 10%.

Two honest fixes and I will not pick between them for you: raise the
experiences to 10% so the published number is true, or change the copy. One
raises prices on 12 trips; the other lowers a number you may have set
deliberately. Say which and it is a ten-minute change.

**B. Ten trips share one photograph.** `/img/routes/langtang-valley.jpg` is the
cover for all ten Langtang trips; `mardi-himal.jpg` for all ten Mardi Himal
ones. A browse grid of identical pictures with different titles reads as a
stock listing, which is the opposite of the argument this company makes. This
is content, not code — it needs photographs.

**C. One `active` booking with a start date in the past.** Left alone
deliberately: closing somebody's trip is an operational act, not a cleanup.

## Checked and clean

Worth recording, because these are the classes that usually rot:

- **RLS.** Every sensitive table returns `[]` to an anonymous reader, and every
  anonymous insert is refused with `42501`. Probed across 20 tables. (A first
  probe of mine reported the opposite; it was wrong — PostgREST rejects unknown
  columns before RLS runs, so the test could not see what it claimed to.)
- **Internal links.** Every static `to=`/`href=` in the app resolves to a route
  the app declares. Zero dead links.
- **Rendered garbage.** 133 real detail pages crawled for `NaN`, `undefined`,
  `Invalid Date`, `[object Object]`. None.
- **Mobile.** No horizontal overflow at 360px on any public page.
- **Console.** Clean on every public page after the fixes above.
- **Hostile query parameters.** Party sizes, negative pages, 5,000-character
  queries, SQL-ish strings, reversed date ranges — all handled.
- **Accessibility spot checks.** `target="_blank"` all carry `rel`; icon-only
  buttons all have names; `<img>` alt is threaded through `SmartImage`.

## The big one still outstanding

`docs/MERGE-HANDOVER.md` — 30 commits from the parallel session are still
unported, and §1 is the expensive one: **a booking request is lost when the
trekker signs in.** That loses real bookings, and it is a bigger hole than
anything in the table above.

## On the ask

The request was 100 bugs. This is what a genuine sweep of the listed classes
turned up: 15 fixed, 3 verified and waiting on a decision. Most of what my own
regex sweeps flagged, I disproved by reading it — this codebase is carefully
tended, with 1,287 tests and guard tests already standing over the classes that
bit it before. Padding the list to 100 with false positives would have cost you
more time than it saved.

The genuinely large remaining seam is the ~180 other unchecked writes of the
same class as 11–15. Each is a place something can fail silently; none is
individually dramatic; together they are the most valuable next sweep.
