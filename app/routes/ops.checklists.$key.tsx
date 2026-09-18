import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.checklists.$key";
import { Panel, Badge, EmptyRow } from "~/components/ops/ui";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { rows } from "~/lib/ops.server";
import {
  addItem,
  deleteItem,
  getChecklist,
  moveItem,
  updateChecklist,
  updateItem,
} from "~/lib/checklists.server";
import {
  ANCHORS,
  ANCHOR_LABEL,
  OWNERS,
  OWNER_LABEL,
  SCOPE_APPLIES_HINT,
  SCOPE_LABEL,
  checklistProblems,
  itemProblems,
  type Anchor,
  type Owner,
  type Scope,
} from "~/lib/checklists";

/** One list, and the rows on it. This is the builder. */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { list, items } = await getChecklist(admin, params.key!);
  if (!list) throw new Response("Not found", { status: 404 });

  const running = await rows<any>(
    admin.from("checklist_tasks").select("subject_id").eq("checklist_id", list.id),
    "who is running this list",
  );
  const subjects = new Set(running.rows.map((r) => String(r.subject_id))).size;

  return data({ list, items, subjects, loadError: running.error }, { headers });
}

function offsetFrom(form: FormData): number | null {
  const raw = String(form.get("offset_days") ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const { list } = await getChecklist(admin, params.key!);
  if (!list) throw new Response("Not found", { status: 404 });

  if (intent === "save_list") {
    const name = String(form.get("name") ?? "");
    const appliesTo = String(form.get("applies_to") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const problems = checklistProblems({ name, scope: list.scope, appliesTo });
    if (problems.length > 0) {
      return data({ error: problems.map((p) => p.message).join(" ") }, { status: 400, headers });
    }
    const res = await updateChecklist(admin, {
      id: list.id,
      name,
      description: String(form.get("description") ?? ""),
      appliesTo,
      isDefault: form.get("is_default") === "on",
      active: form.get("active") === "on",
    });
    return data(res.ok ? { ok: res.message } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  if (intent === "add_item" || intent === "save_item") {
    const anchor = String(form.get("anchor") ?? "none");
    const problems = itemProblems({
      label: String(form.get("label") ?? ""),
      stage: String(form.get("stage") ?? ""),
      owner: String(form.get("owner") ?? ""),
      anchor,
      offsetDays: String(form.get("offset_days") ?? ""),
      doneWhen: String(form.get("done_when") ?? ""),
    });
    if (problems.length > 0) {
      return data({ error: problems.map((p) => p.message).join(" ") }, { status: 400, headers });
    }
    const shared = {
      label: String(form.get("label") ?? ""),
      stage: String(form.get("stage") ?? ""),
      owner: String(form.get("owner") ?? "office"),
      doneWhen: String(form.get("done_when") ?? ""),
      anchor,
      offsetDays: offsetFrom(form),
      required: form.get("required") === "on",
    };
    const res =
      intent === "add_item"
        ? await addItem(admin, { checklistId: list.id, ...shared })
        : await updateItem(admin, {
            id: String(form.get("item_id") ?? ""),
            active: form.get("active") === "on",
            ...shared,
          });
    return data(res.ok ? { ok: res.message } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  if (intent === "move_item") {
    const res = await moveItem(admin, {
      checklistId: list.id,
      itemId: String(form.get("item_id") ?? ""),
      dir: String(form.get("dir")) === "up" ? -1 : 1,
    });
    return data(res.ok ? { ok: res.message } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  if (intent === "delete_item") {
    const res = await deleteItem(admin, String(form.get("item_id") ?? ""));
    return data(res.ok ? { ok: res.message } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  return data({ error: "That is not something this page does." }, { status: 400, headers });
}

const input =
  "mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink outline-none focus:border-primary";

export default function OpsChecklist({ loaderData, actionData }: Route.ComponentProps) {
  const { list, items, subjects, loadError } = loaderData as any;
  const error = ((actionData as any)?.error ?? loadError) as string | undefined;
  const ok = (actionData as any)?.ok as string | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <Link to="/ops/checklists" className="hover:underline">
          Checklists
        </Link>
        <span>/</span>
        <span className="text-ink">{list.name}</span>
      </div>

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

      <Panel title={`${SCOPE_LABEL[list.scope as Scope]} · ${subjects} running this`}>
        <Form method="post" className="space-y-3 px-4 py-3">
          <input type="hidden" name="intent" value="save_list" />
          <div className="flex flex-wrap gap-3">
            <label className="min-w-[14rem] flex-1 text-xs text-ink-soft">
              <span className="block">Name</span>
              <input name="name" defaultValue={list.name} required className={input} />
            </label>
            <label className="min-w-[14rem] flex-1 text-xs text-ink-soft">
              <span className="block">Applies to</span>
              <input
                name="applies_to"
                defaultValue={(list.applies_to ?? []).join(", ")}
                className={input}
              />
              <span className="mt-0.5 block max-w-xl text-[11px]">
                {SCOPE_APPLIES_HINT[list.scope as Scope]}
              </span>
            </label>
          </div>
          <label className="block text-xs text-ink-soft">
            <span className="block">What it is for</span>
            <input name="description" defaultValue={list.description ?? ""} className={input} />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" name="is_default" defaultChecked={list.is_default} />
              Use this one when nothing else matches
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" name="active" defaultChecked={list.active} />
              In use
            </label>
            <button className="rounded border border-border px-3 py-1 text-xs hover:bg-mist">
              Save
            </button>
          </div>
        </Form>
      </Panel>

      <Panel title={`Steps · ${items.length}`}>
        {items.length === 0 ? (
          <EmptyRow>Nothing on this list yet. Add the first step below.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it: any, i: number) => (
              <li key={it.id} className="px-4 py-3">
                <Form method="post" className="space-y-2">
                  <input type="hidden" name="intent" value="save_item" />
                  <input type="hidden" name="item_id" value={it.id} />
                  <div className="flex flex-wrap items-end gap-2">
                    <span className="w-6 pb-1.5 text-xs text-ink-soft">{i + 1}.</span>
                    <label className="min-w-[16rem] flex-1 text-xs text-ink-soft">
                      <span className="block">What has to be done</span>
                      <input name="label" defaultValue={it.label} required className={input} />
                    </label>
                    <label className="text-xs text-ink-soft">
                      <span className="block">Under</span>
                      <input
                        name="stage"
                        defaultValue={it.stage}
                        className={`${input} w-32`}
                      />
                    </label>
                    <label className="text-xs text-ink-soft">
                      <span className="block">Whose job</span>
                      <select name="owner" defaultValue={it.owner} className={`${input} w-28`}>
                        {OWNERS.map((o) => (
                          <option key={o} value={o}>
                            {OWNER_LABEL[o as Owner]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-ink-soft">
                      <span className="block">When</span>
                      <select name="anchor" defaultValue={it.anchor} className={`${input} w-44`}>
                        {ANCHORS.map((a) => (
                          <option key={a} value={a}>
                            {ANCHOR_LABEL[a as Anchor]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-ink-soft">
                      <span className="block">Days</span>
                      <input
                        name="offset_days"
                        defaultValue={it.offset_days ?? ""}
                        placeholder="-30"
                        className={`${input} w-16`}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-end gap-2 pl-6">
                    <label className="min-w-[16rem] flex-1 text-xs text-ink-soft">
                      <span className="block">Done when</span>
                      <input name="done_when" defaultValue={it.done_when ?? ""} className={input} />
                    </label>
                    <label className="flex items-center gap-1.5 pb-1.5 text-xs text-ink-soft">
                      <input type="checkbox" name="required" defaultChecked={it.required} />
                      Required
                    </label>
                    <label className="flex items-center gap-1.5 pb-1.5 text-xs text-ink-soft">
                      <input type="checkbox" name="active" defaultChecked={it.active} />
                      In use
                    </label>
                    <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                      Save
                    </button>
                  </div>
                </Form>

                <div className="mt-1 flex flex-wrap items-center gap-3 pl-6 text-xs text-ink-soft">
                  <span className="font-mono text-[11px]">{it.key}</span>
                  {!it.active && <Badge tone="neutral">off</Badge>}
                  {!it.required && <Badge tone="neutral">optional</Badge>}
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="move_item" />
                    <input type="hidden" name="item_id" value={it.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button className="underline hover:text-ink" aria-label="Move up">
                      up
                    </button>
                  </Form>
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="move_item" />
                    <input type="hidden" name="item_id" value={it.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button className="underline hover:text-ink" aria-label="Move down">
                      down
                    </button>
                  </Form>
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="delete_item" />
                    <input type="hidden" name="item_id" value={it.id} />
                    <button className="underline hover:text-danger">remove</button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Form method="post" className="space-y-2 border-t border-border px-4 py-3">
          <input type="hidden" name="intent" value="add_item" />
          <p className="text-xs font-medium text-ink">Add a step</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[16rem] flex-1 text-xs text-ink-soft">
              <span className="block">What has to be done</span>
              <input name="label" required className={input} />
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Under</span>
              <input name="stage" defaultValue="General" className={`${input} w-32`} />
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Whose job</span>
              <select name="owner" defaultValue="office" className={`${input} w-28`}>
                {OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {OWNER_LABEL[o as Owner]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">When</span>
              <select name="anchor" defaultValue="none" className={`${input} w-44`}>
                {ANCHORS.map((a) => (
                  <option key={a} value={a}>
                    {ANCHOR_LABEL[a as Anchor]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Days</span>
              <input name="offset_days" placeholder="-30" className={`${input} w-16`} />
            </label>
            <label className="min-w-[12rem] flex-1 text-xs text-ink-soft">
              <span className="block">Done when</span>
              <input name="done_when" className={input} />
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-ink-soft">
              <input type="checkbox" name="required" defaultChecked />
              Required
            </label>
            <button className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white">
              Add
            </button>
          </div>
          <p className="text-[11px] text-ink-soft">
            Days counts from whatever “when” says — negative is before, positive
            is after. Leave “when” on “no date” for anything that happens daily
            or as needed; a made-up date only shows up red for no reason.
          </p>
        </Form>
      </Panel>
    </div>
  );
}
