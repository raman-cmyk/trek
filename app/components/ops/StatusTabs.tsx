import { Link, useSearchParams } from "react-router";
import { cn } from "~/lib/cn";
import type { StatusFilter } from "~/lib/status-filter";

/**
 * The status filter, in the one place every console page puts it: beside the
 * title, where the question is asked.
 *
 * Links rather than a form, so the choice is a URL — a shift can be handed
 * over with one, and the back button does what it looks like it does. Every
 * other parameter on the page (a search term, which tab of people you are on)
 * is carried through untouched, because losing somebody's search when they
 * click "Verified" is the kind of small rudeness that makes a console tiring.
 */
export function StatusTabs({
  filters,
  current,
  counts,
  param = "status",
  className,
}: {
  filters: StatusFilter[];
  current: string;
  counts: Record<string, number>;
  /** Query parameter to write. Defaults to `status`. */
  param?: string;
  className?: string;
}) {
  const [params] = useSearchParams();

  function hrefFor(key: string): string {
    const next = new URLSearchParams(params);
    // "all" is the default, so it is the absence of the parameter rather than
    // a value — the plain page URL and the All tab are the same address.
    if (key === "all") next.delete(param);
    else next.set(param, key);
    // A filter change starts the list again; leaving a page number behind
    // lands people on an empty page three.
    next.delete("page");
    const q = next.toString();
    return q ? `?${q}` : "?";
  }

  return (
    <nav aria-label="Filter by status" className={cn("flex flex-wrap gap-1", className)}>
      {filters.map((f) => {
        const on = f.key === current;
        const n = counts[f.key] ?? 0;
        return (
          <Link
            key={f.key}
            to={hrefFor(f.key)}
            prefetch="intent"
            aria-current={on ? "page" : undefined}
            className={cn(
              "rounded-pill px-3 py-1.5 text-xs transition-colors",
              on
                ? "bg-ink text-paper"
                : n === 0
                  ? // Nothing in it: still reachable, but it should not look
                    // like work waiting to be done.
                    "border border-border text-ink-soft/60 hover:text-ink"
                  : "border border-border text-ink-soft hover:border-moss hover:text-ink",
            )}
          >
            {f.label} <span className={cn("font-mono", on ? "opacity-70" : "opacity-60")}>{n}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A switch between two or more lanes of a queue — which kind of thing you are
 * looking at, rather than which state it is in.
 *
 * Same pill as the status filter because it behaves the same way: a link, a
 * count, the rest of the URL carried through. It sits above the status filter,
 * since changing lane changes which statuses even exist.
 */
export function LaneTabs({
  lanes,
  current,
  counts,
  param = "who",
  className,
}: {
  lanes: Array<{ key: string; label: string }>;
  current: string;
  counts?: Record<string, number>;
  param?: string;
  className?: string;
}) {
  const [params] = useSearchParams();

  function hrefFor(key: string): string {
    const next = new URLSearchParams(params);
    next.set(param, key);
    // Statuses do not survive the crossing: "applied" means nothing to a
    // passport, and carrying it over would land somebody on an empty list
    // they did not ask for.
    next.delete("status");
    next.delete("page");
    return `?${next.toString()}`;
  }

  return (
    <nav aria-label="Which queue" className={cn("flex flex-wrap gap-1", className)}>
      {lanes.map((l) => {
        const on = l.key === current;
        return (
          <Link
            key={l.key}
            to={hrefFor(l.key)}
            prefetch="intent"
            aria-current={on ? "page" : undefined}
            className={cn(
              "rounded-pill px-4 py-2 text-sm font-medium transition-colors",
              on
                ? "bg-moss text-paper"
                : "border border-border text-ink-soft hover:border-moss hover:text-ink",
            )}
          >
            {l.label}
            {counts?.[l.key] != null && (
              <span className={cn("ml-1.5 font-mono text-xs", on ? "opacity-80" : "opacity-60")}>
                {counts[l.key]}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
