# Building an ops page

The admin area at `/ops` is 29 screens and about 9,000 lines. This is how to
add the thirtieth in roughly 80 lines, and how not to ship the three silent
failures this area has shipped before.

## The three places

A new page needs three edits. Miss the third and the page exists but nobody
can reach it — so `app/lib/ops-pages.test.ts` fails the build if you do.

1. `app/routes/ops.<thing>.tsx` — the page.
2. `app/routes.ts` — `route("ops/<thing>", "routes/ops.<thing>.tsx")`, inside
   the ops layout block.
3. `NAV` in `app/routes/ops.tsx` — `{ to: "/ops/<thing>", label: "…" }`.

Detail pages (`ops.thing.$id.tsx`) are exempt from the sidebar: you reach them
from the list. Anything else that should not be in the nav goes in the
`NOT_IN_NAV` list in the test, with a reason.

## The rule that matters

**Never destructure `{ data }` on its own, and never fire a write you do not
look at.** Both fail silently, and a silently failing ops page is worse than a
broken one, because it renders. This has happened three times here:

- `/ops/users` said "0 accounts" on a live site with 71.
- `/ops/pipeline` showed nothing with live treks in it.
- Opening a live trek gave a 404.

All three were one embed the database refused, with the error thrown away.

Use `app/lib/ops.server.ts`:

```ts
import { rows, one, write, writeAll } from "~/lib/ops.server";

const guides = await rows<Guide>(
  admin.from("guides").select("user_id, slug, tier").order("slug"),
  "the guides",            // how the failure reads to the person looking
);
// guides.rows  — always an array
// guides.error — a sentence, or null
```

`write()` returns `{ ok, error }` instead of throwing, so an action that does
three things can say which one failed. `writeAll()` runs steps in order and
stops at the first failure, so the screen never shows a half-applied state.
Neither is a transaction — only Postgres gives you that.

Then **render the error**. A stored error nobody displays is still a silent
failure. `app/routes/ops.incidents.tsx` is the worked example, top to bottom.

## The skeleton

```tsx
import { data } from "react-router";
import type { Route } from "./+types/ops.things";
import { Panel, EmptyRow, Badge } from "~/components/ops/ui";
import { StatusTabs } from "~/components/ops/StatusTabs";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { rows, write } from "~/lib/ops.server";
import { applyFilter, countsFor, resolveKey } from "~/lib/status-filter";
import { THING_FILTERS } from "~/lib/ops-filters";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);

  const things = await rows<any>(
    admin.from("things").select("id, name, status").order("created_at", { ascending: false }),
    "the things",
  );

  const filter = resolveKey(THING_FILTERS, new URL(request.url).searchParams.get("status"));
  return data(
    {
      things: applyFilter(things.rows, THING_FILTERS, filter, (t: any) => t.status),
      counts: countsFor(things.rows, THING_FILTERS, (t: any) => t.status),
      filter,
      loadError: things.error,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();

  if (String(form.get("intent")) === "archive") {
    const out = await write(
      admin.from("things").update({ status: "archived" }).eq("id", String(form.get("id"))),
      "the archive",
    );
    if (!out.ok) return data({ error: out.error }, { status: 500, headers });
  }
  return data({ ok: true }, { headers });
}
```

## What you get for free

- `requireOps` — the role gate and the session. Redirects to `/ops/login`.
- `isSuperAdmin(user.email)` — for anything only the founder may do. It is a
  list in code, not a column, because a flag ops can set is a flag ops can set
  on themselves.
- `~/lib/status-filter` + `StatusTabs` — the filter tabs with live counts that
  every list page has.
- `~/components/ops/ui` — `Panel`, `Badge`, `EmptyRow`. `CopyButton` too.
- `~/lib/ops-filters` — the filter definitions, one per table.

## Embeds: the trap

`bookings`, `conversations`, `reviews`, `events`, `account_blocks`,
`booking_documents` and `permit_applications` each have MORE THAN ONE column
pointing at `users`. So this fails:

```ts
.select("trekker:users(full_name)")            // ambiguous — which column?
.select("trekker:users!bookings_trekker_id_fkey(full_name)")   // correct
```

PostgREST returns an error rather than guessing, and if you destructured only
`{ data }` you will never see it. `app/lib/embeds.test.ts` walks every
`.select()` in the codebase and fails on an unqualified embed of an ambiguous
parent — keep it passing.

## Anything dangerous

Setting a password or acting as another user goes through `/ops/users`, is
gated to the super admin, and writes a row to `admin_actions` — who did it, to
whom, when, never the secret. If you add another capability of that kind,
audit it the same way. The helper that writes the note takes no password
argument on purpose.

## Before you push

```
npm run typecheck && npx vitest run && npm run build
```

`app/lib/ops-pages.test.ts` will tell you if the page is unreachable or if a
write is unchecked. It carries an allowlist of pages written before these
helpers existed; that list is a ratchet and is only ever allowed to get
shorter. If you touch one of those pages, convert it and take it off.
