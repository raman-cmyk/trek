import { Form, data } from "react-router";
import type { Route } from "./+types/ops.moderation";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { SmartImage } from "~/components/SmartImage";
import { ACTION_KINDS, MAX_SUSPENSION_DAYS, REASON_MAX, actionLabel, splitBySide } from "~/lib/moderation";
import { liftBlock, takeAction } from "~/lib/moderation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const [{ data: flagged }, { data: photos }, { data: changeRequests }] = await Promise.all([
    admin
      .from("messages")
      .select("id, body, flagged_reason, created_at, sender_id, sender:users(id, full_name, role)")
      .not("flagged_reason", "is", null)
      .order("created_at", { ascending: false }),
    admin
      .from("offering_photos")
      .select("id, url, alt_text, credit_name, offering:offerings(title)")
      .eq("approved", false)
      .eq("source", "trekker"),
    admin
      .from("guide_change_requests")
      .select("id, note, created_at, guide:guides(slug, users(full_name))")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ]);
  // What has already been done, so the same person is not warned four times
  // by four different people who each thought they were the first.
  const { data: actions } = await admin
    .from("account_blocks")
    .select("id, user_id, kind, reason, starts_at, ends_at, lifted_at, created_at, by:users!account_blocks_blocked_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const { guides, clients } = splitBySide(flagged ?? [], (m: any) => m.sender?.role);
  return data(
    {
      flaggedGuides: guides,
      flaggedClients: clients,
      actions: actions ?? [],
      photos: photos ?? [],
      changeRequests: changeRequests ?? [],
      now: new Date().toISOString(),
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "take_action") {
    const res = await takeAction(env, admin, {
      userId: String(form.get("user_id") ?? ""),
      kind: String(form.get("kind") ?? "") as any,
      reason: String(form.get("reason") ?? ""),
      days: Number(form.get("days") ?? 0) || null,
      byId: user.id,
    });
    if (res.error) return data({ error: res.error }, { status: 400, headers });
    // The message that prompted it is dealt with — leaving it flagged would
    // have the next person act on the same thing all over again.
    const messageId = String(form.get("message_id") ?? "");
    if (messageId) {
      await admin.from("messages").update({ flagged_reason: null }).eq("id", messageId);
    }
    return data({ ok: res.ok }, { headers });
  }

  if (intent === "lift_block") {
    const res = await liftBlock(env, admin, {
      blockId: String(form.get("id") ?? ""),
      byId: user.id,
      note: String(form.get("note") ?? ""),
    });
    return data(res.error ? { error: res.error } : { ok: res.ok }, {
      status: res.error ? 400 : 200,
      headers,
    });
  }

  if (intent === "dismiss_flag") {
    await admin.from("messages").update({ flagged_reason: null }).eq("id", String(form.get("id")));
  } else if (intent === "approve_photo") {
    await admin.from("offering_photos").update({ approved: true }).eq("id", String(form.get("id")));
  } else if (intent === "reject_photo") {
    await admin.from("offering_photos").delete().eq("id", String(form.get("id")));
  } else if (intent === "done_change_request") {
    await admin
      .from("guide_change_requests")
      .update({ status: "done", handled_at: new Date().toISOString() })
      .eq("id", String(form.get("id")));
  }
  return data({ ok: true }, { headers });
}

export default function OpsModeration({ loaderData, actionData }: Route.ComponentProps) {
  const { flaggedGuides, flaggedClients, actions, photos, changeRequests, now } =
    loaderData as any;
  const act = (actionData ?? {}) as any;
  // What is standing against each person right now, so a row can say "already
  // warned" instead of letting four admins warn the same guide four times.
  const standing = new Map<string, any[]>();
  for (const a of actions as any[]) {
    standing.set(a.user_id, [...(standing.get(a.user_id) ?? []), a]);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Moderation</h1>

      {act.ok && typeof act.ok === "string" && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{act.ok}</p>
      )}
      {act.error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">{act.error}</p>
      )}

      <Panel title={`Guide change requests (${changeRequests.length})`}>
        {changeRequests.length === 0 ? (
          <EmptyRow>No open requests.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {changeRequests.map((r: any) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.guide?.users?.full_name ?? "Guide"}{" "}
                    <a href={`/guides/${r.guide?.slug ?? ""}`} className="text-primary">
                      (profile)
                    </a>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-ink-soft">{r.note}</p>
                </div>
                <Form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="done_change_request" />
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-sm text-primary hover:underline">Mark done</button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Two sections, as asked: "flagged messages originating from guides
          should appear in the guide section, and flagged messages from
          clients should appear in the client section." They are genuinely
          different problems — a guide steering a booking off-platform is a
          livelihood question; a trekker pasting their number is usually just
          impatience — and mixing them made every row look the same. */}
      <FlaggedList
        title="Flagged — guides"
        rows={flaggedGuides}
        standing={standing}
        now={now}
        empty="No guides flagged."
      />
      <FlaggedList
        title="Flagged — clients"
        rows={flaggedClients}
        standing={standing}
        now={now}
        empty="No clients flagged."
      />

      <ActionsTaken actions={actions} now={now} />

      <Panel title={`Photos awaiting approval (${photos.length})`}>
        {photos.length === 0 ? (
          <EmptyRow>No photos to moderate.</EmptyRow>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {photos.map((p: any) => (
              <div key={p.id} className="rounded-card border border-border p-2">
                <SmartImage src={p.url} alt={p.alt_text} width={300} height={225} className="aspect-[4/3] w-full rounded" />
                <p className="mt-1 text-xs text-ink-soft">{p.credit_name} · {p.offering?.title}</p>
                <div className="mt-2 flex gap-2">
                  <Form method="post" className="flex-1">
                    <input type="hidden" name="intent" value="approve_photo" />
                    <input type="hidden" name="id" value={p.id} />
                    <button className="w-full rounded bg-accent px-2 py-1 text-xs text-white">Approve</button>
                  </Form>
                  <Form method="post" className="flex-1">
                    <input type="hidden" name="intent" value="reject_photo" />
                    <input type="hidden" name="id" value={p.id} />
                    <button className="w-full rounded border border-border px-2 py-1 text-xs">Reject</button>
                  </Form>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function FlaggedList({
  title,
  rows,
  standing,
  now,
  empty,
}: {
  title: string;
  rows: any[];
  standing: Map<string, any[]>;
  now: string;
  empty: string;
}) {
  return (
    <Panel title={`${title} (${rows.length})`}>
      {rows.length === 0 ? (
        <EmptyRow>{empty}</EmptyRow>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((m: any) => (
            <FlaggedRow
              key={m.id}
              m={m}
              history={standing.get(m.sender?.id ?? m.sender_id) ?? []}
              now={now}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * One flagged message, and the two things you can do about it.
 *
 * Dismiss was the only one. "There needs to be a Take action button ... Once
 * clicked, it should open an option allowing you to choose between blocking,
 * banning, or issuing a warning." A <details> rather than a dialog, so it
 * works with JavaScript off like the rest of the console and so the form
 * opens inside the row it belongs to.
 */
function FlaggedRow({ m, history, now }: { m: any; history: any[]; now: string }) {
  const userId = m.sender?.id ?? m.sender_id;
  const open = history.find(
    (h: any) =>
      h.kind !== "warned" &&
      !h.lifted_at &&
      (!h.ends_at || Date.parse(h.ends_at) > Date.parse(now)),
  );
  const warnings = history.filter((h: any) => h.kind === "warned").length;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{m.sender?.full_name ?? "Unknown"}</span>
            <Badge tone="red">{m.flagged_reason}</Badge>
            {/* Form matters: somebody already warned twice is a different
                decision from a first offence, and the person deciding should
                not have to go and look it up. */}
            {open && (
              <Badge tone="neutral">
                already {open.kind}
              </Badge>
            )}
            {!open && warnings > 0 && (
              <Badge tone="amber">
                warned {warnings === 1 ? "once" : `${warnings} times`}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 break-all text-sm text-ink-soft">"{m.body}"</p>
        </div>
        <Form method="post" className="shrink-0">
          <input type="hidden" name="intent" value="dismiss_flag" />
          <input type="hidden" name="id" value={m.id} />
          <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
            Dismiss
          </button>
        </Form>
      </div>

      {userId && (
        <details className="mt-2">
          <summary className="inline-block cursor-pointer list-none rounded border border-ember/40 px-2 py-1 text-xs font-medium text-ember hover:bg-ember/5">
            Take action
          </summary>
          <Form method="post" className="mt-2 max-w-md space-y-2 rounded-md border border-line bg-paper p-3">
            <input type="hidden" name="intent" value="take_action" />
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="message_id" value={m.id} />

            <fieldset>
              <legend className="text-xs font-medium text-ink">What are you doing?</legend>
              <div className="mt-1.5 space-y-1.5">
                {ACTION_KINDS.map((k) => (
                  <label key={k} className="flex items-start gap-2 text-xs">
                    <input
                      type="radio"
                      name="kind"
                      value={k}
                      required
                      defaultChecked={k === "warned"}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-ink">{actionLabel(k)}</span>
                      <span className="text-muted">
                        {k === "warned"
                          ? " — nothing is restricted. They are told, and it is on the record."
                          : k === "suspended"
                            ? " — they cannot sign in. A guide's listings come down."
                            : " — the same, and it does not end."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block text-xs">
              <span className="font-medium text-ink">Days, if suspending</span>
              <input
                type="number"
                name="days"
                min={1}
                max={MAX_SUSPENSION_DAYS}
                defaultValue={14}
                className="mt-1 w-24 rounded border border-line bg-card px-2 py-1"
              />
            </label>

            <label className="block text-xs">
              <span className="font-medium text-ink">Why</span>
              <textarea
                name="reason"
                rows={2}
                required
                maxLength={REASON_MAX}
                placeholder="Gave a trekker their WhatsApp number before the deposit."
                className="mt-1 w-full rounded border border-line bg-card px-2 py-1.5"
              />
            </label>
            <p className="text-caption text-muted">
              They are sent this, word for word. Write it to them.
            </p>

            <button className="w-full rounded bg-ember px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
              Do it
            </button>
          </Form>
        </details>
      )}
    </li>
  );
}

/**
 * What has been done, and the way back.
 *
 * Every suspension needs somebody able to undo it, or the first mistake is
 * permanent. Shown newest first, with the reason that was given, because the
 * person lifting it is rarely the person who imposed it.
 */
function ActionsTaken({ actions, now }: { actions: any[]; now: string }) {
  const live = actions.filter(
    (a) =>
      a.kind !== "warned" &&
      !a.lifted_at &&
      (!a.ends_at || Date.parse(a.ends_at) > Date.parse(now)),
  );
  const past = actions.filter((a) => !live.includes(a)).slice(0, 12);

  return (
    <Panel title={`Accounts on hold (${live.length})`}>
      {live.length === 0 && past.length === 0 ? (
        <EmptyRow>Nobody has been warned, suspended or banned.</EmptyRow>
      ) : (
        <ul className="divide-y divide-border">
          {live.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="red">{actionLabel(a.kind)}</Badge>
                  {a.ends_at && (
                    <span className="text-caption text-muted">
                      until{" "}
                      {new Date(a.ends_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  )}
                  <span className="text-caption text-muted">
                    by {a.by?.full_name ?? "the office"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-ink-soft">{a.reason}</p>
              </div>
              <details className="shrink-0">
                <summary className="cursor-pointer list-none rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                  Lift
                </summary>
                <Form method="post" className="mt-2 w-64 space-y-2 rounded-md border border-line bg-paper p-3">
                  <input type="hidden" name="intent" value="lift_block" />
                  <input type="hidden" name="id" value={a.id} />
                  <label className="block text-xs">
                    <span className="font-medium text-ink">Note (for the record)</span>
                    <textarea
                      name="note"
                      rows={2}
                      maxLength={500}
                      placeholder="Spoke to him; it was a misunderstanding."
                      className="mt-1 w-full rounded border border-line bg-card px-2 py-1.5"
                    />
                  </label>
                  <button className="w-full rounded bg-moss px-3 py-1.5 text-xs font-medium text-white hover:bg-pine">
                    Let them back in
                  </button>
                </Form>
              </details>
            </li>
          ))}

          {past.length > 0 && (
            <li className="py-3">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  Earlier actions ({past.length})
                </summary>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {past.map((a) => (
                    <li key={a.id} className="py-2">
                      <p className="flex flex-wrap items-center gap-2 text-ink">
                        <span className="font-medium">{actionLabel(a.kind)}</span>
                        <span className="text-caption text-muted">
                          {new Date(a.created_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {a.lifted_at ? " · lifted" : a.ends_at ? " · expired" : ""}
                          {" · by "}
                          {a.by?.full_name ?? "the office"}
                        </span>
                      </p>
                      <p className="text-ink-soft">{a.reason}</p>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
