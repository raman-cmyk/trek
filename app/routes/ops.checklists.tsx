import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.checklists";
import { Panel, Badge, EmptyRow } from "~/components/ops/ui";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { rows } from "~/lib/ops.server";
import {
  checklistUsage,
  createChecklist,
  deleteChecklist,
  listChecklists,
} from "~/lib/checklists.server";
import {
  SCOPES,
  SCOPE_APPLIES_HINT,
  SCOPE_LABEL,
  checklistProblems,
  type Scope,
} from "~/lib/checklists";

/**
 * The checklists, and the place to write a new one.
 *
 * Three hardcoded lists used to live in three files — the guide verification
 * check types, a trek's thirty tasks, and nothing at all for putting an
 * experience live — and changing any of them meant a deploy. This is that,
 * as data the office owns.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const lists = await listChecklists(admin);
  const usage = await checklistUsage(admin);

  // How many rows each list has, so the page can say "30 steps" rather than
  // making somebody open it to find out.
  const items = await rows<any>(
    admin.from("checklist_items").select("checklist_id, active"),
    "the steps in each list",
  );
  const counts: Record<string, number> = {};
  for (const i of items.rows) {
    if (!i.active) continue;
    const k = String(i.checklist_id);
    counts[k] = (counts[k] ?? 0) + 1;
  }

  return data({ lists, counts, usage, loadError: items.error }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "create") {
    const scope = String(form.get("scope")) as Scope;
    const name = String(form.get("name") ?? "");
    const appliesTo = String(form.get("applies_to") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const problems = checklistProblems({ name, scope, appliesTo });
    if (problems.length > 0) {
      return data({ error: problems.map((p) => p.message).join(" ") }, { status: 400, headers });
    }
    const res = await createChecklist(admin, {
      scope,
      name,
      description: String(form.get("description") ?? ""),
      appliesTo,
      isDefault: form.get("is_default") === "on",
      by: user.id,
      copyFromKey: String(form.get("copy_from") ?? "") || null,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400, headers });
    return data({ ok: res.message }, { headers });
  }

  if (intent === "delete") {
    const res = await deleteChecklist(admin, String(form.get("id") ?? ""));
    if (!res.ok) return data({ error: res.error }, { status: 400, headers });
    return data({ ok: res.message }, { headers });
  }

  return data({ error: "That is not something this page does." }, { status: 400, headers });
}

export default function OpsChecklists({ loaderData, actionData }: Route.ComponentProps) {
  const { lists, counts, usage, loadError } = loaderData as any;
  const error = (actionData as any)?.error as string | undefined;
  const ok = (actionData as any)?.ok as string | undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-ink">Checklists</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Every list the office works from — verifying a guide, putting an
          experience live, running a trek, running a day out. Change one here
          and every trip and guide picks it up on their next page load. No
          deploy, no developer.
        </p>
      </div>

      {loadError && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {ok}
        </p>
      )}

      {SCOPES.map((scope) => {
        const mine = (lists as any[]).filter((l) => l.scope === scope);
        return (
          <Panel key={scope} title={SCOPE_LABEL[scope]}>
            {mine.length === 0 ? (
              <EmptyRow>No list for this yet.</EmptyRow>
            ) : (
              <ul className="divide-y divide-border">
                {mine.map((l: any) => (
                  <li key={l.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/ops/checklists/${l.key}`}
                        className="font-medium text-ink hover:text-primary hover:underline"
                      >
                        {l.name}
                      </Link>
                      <p className="text-xs text-ink-soft">
                        {[
                          `${counts[l.id] ?? 0} step${(counts[l.id] ?? 0) === 1 ? "" : "s"}`,
                          l.applies_to.length > 0 ? l.applies_to.join(", ") : "started by hand",
                          usage[l.id] ? `running on ${usage[l.id]}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {l.description && (
                        <p className="mt-0.5 max-w-2xl text-xs text-ink-soft">{l.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {l.is_default && <Badge tone="blue">default</Badge>}
                      {!l.active && <Badge tone="neutral">off</Badge>}
                      {!usage[l.id] && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={l.id} />
                          <button className="text-xs text-ink-soft underline hover:text-danger">
                            delete
                          </button>
                        </Form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}

      <Panel title="Write a new list">
        <Form method="post" className="space-y-3 px-4 py-3">
          <input type="hidden" name="intent" value="create" />
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-ink-soft">
              <span className="block">What is it about</span>
              <select
                name="scope"
                className="mt-0.5 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[14rem] flex-1 text-xs text-ink-soft">
              <span className="block">Name</span>
              <input
                name="name"
                required
                placeholder="Guide — trekking guide"
                className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Start from</span>
              <select
                name="copy_from"
                className="mt-0.5 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              >
                <option value="">an empty list</option>
                {(lists as any[]).map((l) => (
                  <option key={l.id} value={l.key}>
                    a copy of {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs text-ink-soft">
            <span className="block">Applies to</span>
            <input
              name="applies_to"
              placeholder="trek, day_hike — or a label of your own, separated by commas"
              className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
            />
            <span className="mt-0.5 block max-w-2xl text-[11px]">
              {SCOPE_APPLIES_HINT.booking} For a guide it is a label you choose,
              and ops picks which list to run.
            </span>
          </label>

          <label className="block text-xs text-ink-soft">
            <span className="block">What it is for (optional)</span>
            <input
              name="description"
              className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input type="checkbox" name="is_default" />
            Use this one when nothing else matches
          </label>

          <button className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white">
            Create the list
          </button>
        </Form>
      </Panel>
    </div>
  );
}
