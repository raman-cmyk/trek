import { Form } from "react-router";
import { Panel, Badge, EmptyRow } from "~/components/ops/ui";
import { byStage, dueLabel, isOverdue, taskSummary, type TaskRow } from "~/lib/tasks";
import { OWNER_LABEL, type Owner } from "~/lib/checklists";

/**
 * A checklist being worked, wherever it is being worked.
 *
 * The same panel on a guide, an experience and a booking, because it is the
 * same thing: a list the office wrote at /ops/checklists, run against a
 * subject. Before this, guide verification, trek tasks and "is this experience
 * ready" were three different screens built three different ways.
 *
 * Waiving needs a written reason. A waived step with no reason is a checklist
 * that has quietly stopped being one — six months later nobody can tell
 * whether the reference was skipped because the guide has walked with us for
 * ten years or because somebody was in a hurry.
 */
export function ChecklistPanel({
  tasks,
  title,
  today,
  /** Other lists ops can start on this subject — the picker at the bottom. */
  available = [],
  emptyNote,
}: {
  tasks: TaskRow[];
  title: string;
  today: string;
  available?: Array<{ key: string; name: string }>;
  emptyNote?: string;
}) {
  const s = taskSummary(tasks ?? [], today);

  return (
    <Panel title={tasks.length === 0 ? title : `${title} · ${s.done} of ${s.total}`}>
      {tasks.length === 0 ? (
        <EmptyRow>{emptyNote ?? "No list is running here yet."}</EmptyRow>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 px-4 py-2">
            <div className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-mist">
              <div
                className={`h-full rounded-full ${s.overdue.length > 0 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${s.percent}%` }}
              />
            </div>
            <span className="text-xs text-ink-soft">{s.percent}%</span>
            {s.overdue.length > 0 && <Badge tone="red">{s.overdue.length} past its date</Badge>}
          </div>

          {s.next && (
            <p className="border-t border-border px-4 py-2 text-sm">
              <span className="text-ink-soft">Next:</span>{" "}
              <span className="text-ink">{s.next.label}</span>
              <span className="text-ink-soft">
                {" · "}
                {OWNER_LABEL[s.next.owner as Owner] ?? s.next.owner}
                {s.next.due_on ? ` · ${dueLabel(s.next, today)}` : ""}
              </span>
            </p>
          )}

          {byStage(tasks).map((group) => (
            <div key={group.stage} className="border-t border-border">
              <p className="bg-mist/40 px-4 py-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
                {group.stage}
              </p>
              <ul className="divide-y divide-border">
                {group.tasks.map((t) => {
                  const late = isOverdue(t, today);
                  const settled = t.state === "done" || t.state === "waived";
                  return (
                    <li key={t.id} className="px-4 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm ${settled ? "text-ink-soft line-through" : "text-ink"}`}>
                            {t.label}
                          </p>
                          <p className="text-xs text-ink-soft">
                            {[
                              OWNER_LABEL[t.owner as Owner] ?? t.owner,
                              t.due_on ? dueLabel(t, today) : null,
                              t.done_when,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {t.state === "waived" && (
                            <p className="mt-0.5 text-xs text-ink-soft">
                              <span className="font-medium">Waived:</span> {t.waived_reason}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {late && <Badge tone="red">late</Badge>}
                          <Form method="post">
                            <input
                              type="hidden"
                              name="intent"
                              value={settled ? "task_reopen" : "task_done"}
                            />
                            <input type="hidden" name="task_id" value={t.id} />
                            <button
                              className={`rounded border border-border px-2 py-1 text-xs ${settled ? "hover:bg-mist" : "hover:bg-emerald-50"}`}
                            >
                              {settled ? "Undo" : "Done"}
                            </button>
                          </Form>
                        </div>
                      </div>

                      {!settled && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                            Does not apply…
                          </summary>
                          <Form method="post" className="mt-1.5 flex flex-wrap items-start gap-2">
                            <input type="hidden" name="intent" value="task_waive" />
                            <input type="hidden" name="task_id" value={t.id} />
                            <input
                              name="reason"
                              required
                              placeholder="Why not? Somebody will read this in six months."
                              className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                            />
                            <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                              Waive
                            </button>
                          </Form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      )}

      {available.length > 0 && (
        <Form method="post" className="flex flex-wrap items-end gap-2 border-t border-border px-4 py-3">
          <input type="hidden" name="intent" value="run_checklist" />
          <label className="min-w-0 flex-1 text-xs text-ink-soft">
            <span className="block">Also run</span>
            <select
              name="checklist_key"
              className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
            >
              {available.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded border border-border px-2 py-1.5 text-xs hover:bg-mist">
            Start it
          </button>
        </Form>
      )}
    </Panel>
  );
}
