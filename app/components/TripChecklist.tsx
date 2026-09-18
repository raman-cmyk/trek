import { byOwner, dueLabel, isOverdue, taskSummary, type TaskRow } from "~/lib/tasks";
import { Badge } from "~/components/ops/ui";

/**
 * What is left before the trek, from the trekker's side.
 *
 * The spec asks for "4 of 6 things left before your trek", and the point of
 * saying it out loud is that the trekker can see the office working too. Their
 * own rows come first and carry a date; ours sit underneath so "are my permits
 * done?" is answered without an email.
 *
 * Read-only. Every one of the trekker's tasks is done somewhere else on this
 * page — upload a passport, check a policy, pay a balance — and a tick box
 * beside it would be a second, lying answer.
 */
export function TripChecklist({ tasks, today }: { tasks: TaskRow[]; today: string }) {
  if ((tasks ?? []).length === 0) return null;
  const s = taskSummary(tasks, today);
  const split = byOwner(tasks);
  const mine = split.client.filter((t) => t.state === "open" || t.state === "blocked");
  // "Automatic" is us as far as the trekker is concerned — they do not care
  // which of it is a person and which is a cron job.
  const ours = [...split.office, ...split.guide, ...split.system].filter(
    (t) => t.state === "open" || t.state === "blocked",
  );

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">Before you go</h2>
        <span className="text-sm text-ink-soft">
          {mine.length === 0
            ? "Nothing left on your side."
            : `${mine.length} thing${mine.length === 1 ? "" : "s"} left for you.`}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${s.percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {s.done} of {s.total} done between you, your guide and our office.
      </p>

      {mine.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-card">
          {mine.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 text-sm text-ink">{t.label}</span>
              {t.due_on && (
                <Badge tone={isOverdue(t, today) ? "red" : "amber"}>
                  {dueLabel(t, today)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {ours.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-ink-soft hover:text-ink">
            What we are doing ({ours.length})
          </summary>
          <ul className="mt-2 divide-y divide-border rounded-card border border-border bg-card">
            {ours.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="min-w-0 flex-1 text-sm text-ink-soft">{t.label}</span>
                {t.due_on && (
                  <span className="text-xs text-ink-soft">{dueLabel(t, today)}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
