import { Form, Link, data, useNavigation, useSearchParams } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/ops.blocking";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";
import { escapeLike } from "~/lib/browse";
import { fmtDate } from "~/lib/format";
import {
  BLOCK_FILTERS,
  blockStage,
  endOfDayIso,
  filterMatches,
  isBlockFilter,
  type BlockFilter,
  type BlockStage,
} from "~/lib/blocking";
import { blockUser, unblockUser } from "~/lib/blocking.server";
import { describeDeletionBlock, whyNotDeletable } from "~/lib/people";
import { deletePerson } from "~/lib/people.server";
import { createAdminClient, getEnv, requireOps } from "~/lib/supabase.server";

/**
 * Who is kept out, and the lever to keep somebody out.
 *
 * Every row is a block (migration 0060) with its person joined on: suspended
 * for a while or until lifted, banned for good, expired on its own, or
 * lifted by somebody. The filter is the stage. "Block someone" is a search
 * box, because the office knows a name or an email, not an id.
 */

const STAGE_TONE: Record<BlockStage, "amber" | "red" | "neutral" | "green"> = {
  suspended: "amber",
  banned: "red",
  expired: "neutral",
  lifted: "green",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const url = new URL(request.url);
  const rawFilter = url.searchParams.get("f") ?? "active";
  const filter: BlockFilter = isBlockFilter(rawFilter) ? rawFilter : "active";
  const find = (url.searchParams.get("find") ?? "").trim().slice(0, 60);

  const { data: blocks } = await admin
    .from("account_blocks")
    .select(
      "id, kind, reason, starts_at, ends_at, lifted_at, lift_note, created_at, person:users!account_blocks_user_id_fkey(id, full_name, role, email, avatar_url), by:users!account_blocks_blocked_by_fkey(full_name), lifter:users!account_blocks_lifted_by_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  const now = new Date();
  const rows = (blocks ?? [])
    .map((b: any) => ({
      id: b.id as string,
      kind: b.kind as "suspended" | "banned",
      stage: blockStage(b, now),
      reason: b.reason as string,
      since: b.starts_at as string,
      until: b.ends_at as string | null,
      liftedAt: b.lifted_at as string | null,
      liftNote: b.lift_note as string | null,
      by: (b.by?.full_name ?? null) as string | null,
      lifter: (b.lifter?.full_name ?? null) as string | null,
      person: b.person as {
        id: string;
        full_name: string;
        role: string;
        email: string | null;
        avatar_url: string | null;
      } | null,
    }))
    .filter((r) => r.person && filterMatches(filter, r.stage));

  // Delete needs to know who has trips, same rule as the People page.
  const ids = rows.map((r) => r.person!.id);
  const { data: bookings } = ids.length
    ? await admin
        .from("bookings")
        .select("trekker_id, guide_id")
        .or(`trekker_id.in.(${ids.join(",")}),guide_id.in.(${ids.join(",")})`)
        .limit(4000)
    : { data: [] as any[] };
  const trips = new Map<string, number>();
  for (const b of bookings ?? []) {
    for (const k of [b.trekker_id, b.guide_id]) trips.set(k, (trips.get(k) ?? 0) + 1);
  }

  // The search behind "Block someone".
  let found: Array<{
    id: string;
    full_name: string;
    role: string;
    email: string | null;
    phone: string | null;
    blocked: boolean;
  }> = [];
  if (find.length >= 2) {
    const like = `%${escapeLike(find)}%`;
    const { data: people } = await admin
      .from("users")
      .select("id, full_name, role, email, phone")
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .neq("id", user.id)
      .order("full_name")
      .limit(10);
    const openOn = new Set(
      (blocks ?? [])
        .filter((b: any) => ["suspended", "banned"].includes(blockStage(b, now)))
        .map((b: any) => b.person?.id),
    );
    found = (people ?? []).map((p: any) => ({ ...p, blocked: openOn.has(p.id) }));
  }

  return data(
    {
      filter,
      find,
      found,
      me: user.id,
      counts: {
        active: (blocks ?? []).filter((b: any) => filterMatches("active", blockStage(b, now)))
          .length,
      },
      rows: rows.map((r) => ({ ...r, trips: trips.get(r.person!.id) ?? 0 })),
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return data({ error: "Nobody picked." }, { status: 400, headers });
  }
  if (id === user.id) {
    return data({ error: "That's your own account." }, { status: 400, headers });
  }

  if (intent === "block" || intent === "ban") {
    const kind = intent === "ban" || form.get("kind") === "banned" ? "banned" : "suspended";
    const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
    if (reason.length < 3) {
      return data({ error: "Say why, in a few words. The person will ask." }, { status: 400, headers });
    }
    const untilRaw = String(form.get("until") ?? "").trim();
    const endsAt = kind === "suspended" && untilRaw ? endOfDayIso(untilRaw) : null;
    if (kind === "suspended" && untilRaw && !endsAt) {
      return data({ error: "That date doesn't look right." }, { status: 400, headers });
    }
    if (endsAt && new Date(endsAt) <= new Date()) {
      return data({ error: "Pick a day that hasn't happened yet." }, { status: 400, headers });
    }
    const r = await blockUser(admin, {
      userId: id,
      kind,
      reason,
      endsAt,
      byId: user.id,
      replaceNote: intent === "ban" ? "Made permanent" : undefined,
    });
    if (!r.ok) return data({ error: "Couldn't block them." }, { status: 400, headers });
    return data(
      {
        ok:
          kind === "banned"
            ? `${r.name} is banned.`
            : endsAt
              ? `${r.name} is suspended until ${fmtDate(endsAt)}.`
              : `${r.name} is suspended until somebody lifts it.`,
      },
      { headers },
    );
  }

  if (intent === "unblock") {
    const r = await unblockUser(admin, {
      userId: id,
      byId: user.id,
      note: String(form.get("note") ?? ""),
    });
    if (!r.ok) return data({ error: "Couldn't unblock them." }, { status: 400, headers });
    return data({ ok: `${r.name} can sign in again.` }, { headers });
  }

  if (intent === "delete") {
    const result = await deletePerson(createAdminClient(env), id);
    if (result.ok) return data({ ok: `${result.name} deleted.` }, { headers });
    if (result.reason === "has_history") {
      return data({ error: describeDeletionBlock(result) }, { status: 400, headers });
    }
    if (result.reason === "not_found") {
      return data({ error: "They're already gone." }, { status: 404, headers });
    }
    return data({ error: "Couldn't delete them. Try again." }, { status: 500, headers });
  }

  return data({ error: "Nothing to do." }, { status: 400, headers });
}

export default function OpsBlocking({ loaderData, actionData }: Route.ComponentProps) {
  const { filter, find, found, me, rows, counts } = loaderData;
  const [params] = useSearchParams();
  const nav = useNavigation();
  const said = actionData as { ok?: string; error?: string } | undefined;
  const [blocking, setBlocking] = useState(Boolean(find));
  const [confirming, setConfirming] = useState<string | null>(null);
  const busyOn =
    nav.state === "submitting" ? `${nav.formData?.get("intent")}:${nav.formData?.get("id")}` : "";

  const filterHref = (key: string) => {
    const p = new URLSearchParams(params);
    p.set("f", key);
    p.delete("find");
    return `/ops/blocking?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Blocking</h1>
          <p className="text-sm text-ink-soft">
            {counts.active === 0
              ? "Nobody is blocked right now."
              : `${counts.active} blocked right now.`}
          </p>
        </div>
        <Button size="sm" variant={blocking ? "secondary" : "danger"} onClick={() => setBlocking((v) => !v)}>
          {blocking ? "Done" : "Block someone"}
        </Button>
      </div>

      {said?.ok && (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{said.ok}</div>
      )}
      {said?.error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">{said.error}</div>
      )}

      {blocking && (
        <Panel title="Block someone">
          <Form method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="f" value={filter} />
            <input
              name="find"
              defaultValue={find}
              type="search"
              autoFocus
              placeholder="Name, email or phone"
              className="w-64 rounded border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <Button size="sm" variant="secondary" type="submit">
              Find
            </Button>
          </Form>
          {find.length >= 2 && found.length === 0 && (
            <p className="mt-3 text-sm text-ink-soft">Nobody matches “{find}”.</p>
          )}
          {found.length > 0 && (
            <ul className="mt-3 divide-y divide-border">
              {found.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Link to={`/ops/people/${p.id}`} className="font-medium hover:underline">
                      {p.full_name}
                    </Link>
                    <Badge tone={p.role === "guide" ? "teal" : p.role === "ops" ? "blue" : "neutral"}>
                      {p.role === "ops" ? "office" : p.role}
                    </Badge>
                    <span className="text-ink-soft">{p.email ?? p.phone ?? ""}</span>
                    {p.blocked && <Badge tone="red">already blocked</Badge>}
                  </div>
                  <BlockForm id={p.id} busy={busyOn === `block:${p.id}`} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {BLOCK_FILTERS.map((f) => (
          <Link
            key={f.key}
            to={filterHref(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              filter === f.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-ink-soft hover:bg-black/5",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Panel>
        {rows.length === 0 ? (
          <EmptyRow>
            {filter === "active" ? "Nobody is blocked." : "Nothing here."}
          </EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-soft">
              <tr className="border-b border-border">
                <th className="pb-2 font-medium">Who</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Why</th>
                <th className="pb-2 font-medium">When</th>
                <th className="pb-2 font-medium">By</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.person!;
                const open = r.stage === "suspended" || r.stage === "banned";
                const noDelete = whyNotDeletable({ isSelf: p.id === me, trips: r.trips });
                return (
                  <tr key={r.id} className="border-b border-border/60 align-top hover:bg-black/[0.02]">
                    <td className="py-2.5">
                      <Link to={`/ops/people/${p.id}`} className="font-medium hover:underline">
                        {p.full_name}
                      </Link>
                      <div className="text-xs text-ink-soft">
                        {p.role === "ops" ? "office" : p.role}
                        {p.email ? ` · ${p.email}` : ""}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <Badge tone={STAGE_TONE[r.stage]}>{r.stage}</Badge>
                    </td>
                    <td className="max-w-xs py-2.5 text-ink-soft">
                      <div>{r.reason}</div>
                      {r.liftNote && <div className="mt-1 text-xs">Lifted: {r.liftNote}</div>}
                    </td>
                    <td className="py-2.5 text-ink-soft">
                      <div>from {fmtDate(r.since)}</div>
                      <div className="text-xs">
                        {r.liftedAt
                          ? `lifted ${fmtDate(r.liftedAt)}`
                          : r.until
                            ? `until ${fmtDate(r.until)}`
                            : r.kind === "banned"
                              ? "for good"
                              : "until lifted"}
                      </div>
                    </td>
                    <td className="py-2.5 text-ink-soft">
                      <div>{r.by ?? "—"}</div>
                      {r.lifter && <div className="text-xs">lifted by {r.lifter}</div>}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {open && (
                          <Form method="post">
                            <input type="hidden" name="intent" value="unblock" />
                            <input type="hidden" name="id" value={p.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="secondary"
                              loading={busyOn === `unblock:${p.id}`}
                            >
                              Unblock
                            </Button>
                          </Form>
                        )}
                        {r.stage === "suspended" && (
                          <Form method="post">
                            <input type="hidden" name="intent" value="ban" />
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="reason" value={r.reason} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              loading={busyOn === `ban:${p.id}`}
                            >
                              Make permanent
                            </Button>
                          </Form>
                        )}
                        {!open && (
                          <Link
                            to={`/ops/blocking?f=${filter}&find=${encodeURIComponent(p.email ?? p.full_name)}`}
                            className="text-sm font-medium text-primary hover:underline"
                            onClick={() => setBlocking(true)}
                          >
                            Block again
                          </Link>
                        )}
                        {noDelete ? (
                          <span className="text-xs text-ink-soft">{noDelete}</span>
                        ) : confirming === p.id ? (
                          <Form method="post" className="flex items-center gap-2">
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="id" value={p.id} />
                            <span className="text-xs text-ink-soft">For good?</span>
                            <Button
                              type="submit"
                              size="sm"
                              variant="danger"
                              loading={busyOn === `delete:${p.id}`}
                              loadingText="Deleting…"
                            >
                              Yes, delete
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                              Keep
                            </Button>
                          </Form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirming(p.id)}
                            className="text-sm font-medium text-ember hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="text-xs text-ink-soft">
        A suspended guide is hidden from the site and put back as they were when
        lifted. A banned account stays banned until somebody here lifts it.
        Deleting is the People page rule: anyone with trips stays.
      </p>
    </div>
  );
}

/** Kind, until, why — and one button. */
function BlockForm({ id, busy }: { id: string; busy: boolean }) {
  const [kind, setKind] = useState<"suspended" | "banned">("suspended");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Form method="post" className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="intent" value="block" />
      <input type="hidden" name="id" value={id} />
      <label className="text-xs text-ink-soft">
        <span className="mb-1 block">How</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "suspended" | "banned")}
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
        >
          <option value="suspended">Suspend</option>
          <option value="banned">Ban for good</option>
        </select>
      </label>
      {kind === "suspended" && (
        <label className="text-xs text-ink-soft">
          <span className="mb-1 block">Until (leave empty for “until lifted”)</span>
          <input
            type="date"
            name="until"
            min={today}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
      )}
      <label className="min-w-[16rem] flex-1 text-xs text-ink-soft">
        <span className="mb-1 block">Why</span>
        <input
          name="reason"
          required
          minLength={3}
          maxLength={500}
          placeholder="Shared a phone number in chat, twice"
          className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary"
        />
      </label>
      <Button type="submit" size="sm" variant="danger" loading={busy} loadingText="Blocking…">
        {kind === "banned" ? "Ban" : "Suspend"}
      </Button>
    </Form>
  );
}
