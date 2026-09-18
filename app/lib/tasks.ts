/**
 * Reading a trip's checklist: what is done, what is late, what is next.
 *
 * Pure, so the trip page, the ops page and the pipeline card all answer the
 * question the same way. The rows come from `checklist_tasks` (0103, 0105);
 * the shapes
 * here are the minimum those rows have to carry.
 */

export type TaskState = "open" | "done" | "waived" | "blocked";
export type TaskOwner = "client" | "guide" | "office" | "system";

export interface TaskRow {
  id: string;
  key: string;
  stage: string;
  label: string;
  owner: TaskOwner;
  due_on?: string | null;
  state: TaskState;
  done_when?: string | null;
  waived_reason?: string | null;
}

const midnight = (iso: string) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);

/** Is this task's date behind us? Undated tasks are never late. */
export function isOverdue(t: TaskRow, todayIso: string): boolean {
  if (t.state !== "open" && t.state !== "blocked") return false;
  if (!t.due_on) return false;
  return midnight(t.due_on) < midnight(todayIso);
}

export interface TaskSummary {
  total: number;
  done: number;
  percent: number;
  overdue: TaskRow[];
  /** The one to do next — soonest dated open task, overdue first. */
  next: TaskRow | null;
  open: TaskRow[];
}

/**
 * The state of the list.
 *
 * A waived task counts as settled, not as done: the bar should reach 100 on a
 * trip where the porter was waived because the trekker carries their own
 * pack, because there is genuinely nothing left to do. Waiving requires a
 * written reason (0103), which is what stops that being a way to cheat it.
 */
export function taskSummary(tasks: TaskRow[], todayIso: string): TaskSummary {
  const total = tasks.length;
  const done = tasks.filter((t) => t.state === "done" || t.state === "waived").length;
  const open = tasks.filter((t) => t.state === "open" || t.state === "blocked");
  const overdue = open.filter((t) => isOverdue(t, todayIso));

  const dated = [...open]
    .filter((t) => t.due_on)
    .sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));

  return {
    total,
    done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    overdue,
    next: dated[0] ?? open[0] ?? null,
    open,
  };
}

/** Grouped for a checklist, keeping the stages in the order they arrive. */
export function byStage(tasks: TaskRow[]): Array<{ stage: string; tasks: TaskRow[] }> {
  const out: Array<{ stage: string; tasks: TaskRow[] }> = [];
  for (const t of tasks) {
    const group = out.find((g) => g.stage === t.stage);
    if (group) group.tasks.push(t);
    else out.push({ stage: t.stage, tasks: [t] });
  }
  return out;
}

/** Whose move it is, for the three columns the office reads. */
export function byOwner(tasks: TaskRow[]): Record<TaskOwner, TaskRow[]> {
  const out: Record<TaskOwner, TaskRow[]> = {
    client: [],
    guide: [],
    office: [],
    system: [],
  };
  for (const t of tasks) out[t.owner]?.push(t);
  return out;
}

export const OWNER_LABEL: Record<TaskOwner, string> = {
  client: "Trekker",
  guide: "Guide",
  office: "Office",
  system: "Automatic",
};

/** "due in 3 days" / "5 days late" / "" — what a person would say out loud. */
export function dueLabel(t: TaskRow, todayIso: string): string {
  if (!t.due_on) return "";
  const days = Math.round((midnight(t.due_on) - midnight(todayIso)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day late";
  if (days < 0) return `${-days} days late`;
  return `in ${days} days`;
}
