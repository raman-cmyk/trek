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
