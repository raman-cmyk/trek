# Two sessions, one repo, one worker, one database

**Found 2026-09-15.** Written by the `claude/new-session-p6r3mp` session after
the founder asked why the live site was showing an old design.

## What happened

Two Claude Code sessions have been building this repository at the same time,
from a common ancestor (`96a2429`), and both deploy to the same Cloudflare
worker and run migrations against the same Supabase project.

| Line | Branch(es) | Head at time of writing | Roughly |
|---|---|---|---|
| Map & onboarding | `claude/new-session-p6r3mp` | `a3e0f63` (+91) | ops fixes, moderation, in-app notifications, date picking, filters, cancellation copy, the trail atlas, the trip-intent popup |
| Checkout & trips | `claude/app-build-lgnkqo`, `claude/new-session-vereu4` | `96eda59` (+28) | checkout holds, the twelve regions, trip-page sections, notification bell, verification queues |

Neither contains the other. The live site is simply whichever deployed last.
On the day this was written that was the checkout line, at 23:57 UTC, four
minutes after the map line deployed at 23:53 — which is why the homepage was
showing the pre-rename "Trek." wordmark and the old count-bubble map.

## What is protected

Both heads are pinned as branches that no session writes to:

- `backup/2026-09-15-map-and-onboarding` → `a3e0f63`
- `backup/2026-09-15-checkout-and-trips` → `96eda59`

They exist so a force-push, a deleted branch or a bad merge cannot lose
either line. Do not commit to them. (Annotated tags were the first choice;
the session token is scoped to its own branch and cannot push tags, so
branches created through the GitHub API stand in.)

Cloudflare also keeps every deployed version, so the live site can be rolled
back to either line with `wrangler rollback <version-id>` regardless of git.

## The part git does not protect

**Migration numbers 0059–0068 are each used twice, for different migrations.**

Both lines kept numbering from `0058`, so the repository now has two `0060`s,
two `0061`s, and so on, with unrelated contents. Because the filenames differ,
all of them would run — in alphabetical order within each number — so this is
survivable, but a fresh clone can no longer be read as a single history.

Worse, the same feature was built twice on both sides with different numbers:

| Feature | Map line | Checkout line |
|---|---|---|
| `account_blocks` | `0078` | `0060` |
| document rejection | `0073` | `0065` |
| in-app notifications | `0079` | `0068` |

### Why the database is nevertheless intact

Checked against production on 2026-09-15:

- There is exactly **one** `notifications` table, with the columns both
  sides' code writes. Both migrations used `create table if not exists`, so
  the second to run was a no-op rather than a conflict.
- `account_blocks` ended up a workable hybrid: its `kind` check allows
  `warned`, `suspended` and `banned`, so the moderation feature that offers a
  warning still works even though the other line's version of the table only
  contemplated two kinds.

This was luck, not design. Two sessions writing DDL to one database is not
safe in general — the next collision may not be two `if not exists` blocks.

## Before merging these two lines

1. Renumber one side's migrations rather than interleaving them, and check
   each renumbered file against what production actually has — several have
   already been applied, so they must be idempotent or skipped.
2. Reconcile the duplicated features deliberately: one `account_blocks`
   contract, one notifications implementation, one deposit-and-cancellation
   block under the calendar. Both sides built each of those.
3. Expect real conflicts in `app/routes/home.tsx`, the experience page, and
   anything touching notifications.

## The rule this is here to establish

One line of work per repository at a time, or one deploy target per line.
Two agents deploying to a single worker means the site shows whoever
finished last, and neither is wrong about having shipped.
