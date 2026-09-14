import type { ReactNode } from "react";
import { tripPipeline, type Stage } from "~/lib/pipeline";
import { cn } from "~/lib/cn";

/**
 * The trip's progress track.
 *
 * A vertical rail rather than a horizontal stepper: the labels are sentences,
 * not numbers, and a horizontal track with seven of them either truncates
 * them or scrolls sideways on a 360px phone — which is the screen the guide
 * is holding.
 *
 * The current step is the only one that explains itself. A track where every
 * row carries a paragraph is a wall; the step you are on is the one you need
 * to read.
 */
export function TripPipeline({
  kind,
  groupStatus,
  bookingStatus,
  meetingSettled,
  details,
  className,
  compact = false,
}: {
  kind: string | null | undefined;
  groupStatus?: string | null;
  bookingStatus?: string | null;
  /** Both the meeting place and time are known — completes "Where to meet". */
  meetingSettled?: boolean;
  /**
   * What to show inside a step, by stage key. The meeting details belong
   * under the step that asks for them, ticked or not: an address a trekker
   * has to go and find on another screen is an address they will forget.
   */
  details?: Partial<Record<string, ReactNode>>;
  className?: string;
  /** One line — the step you are on — for headers and cards. */
  compact?: boolean;
}) {
  const { stages, stopped } = tripPipeline(kind, {
    groupStatus,
    bookingStatus,
    meetingSettled,
  });
  const current = stages.find((s) => s.state === "current" || s.state === "waiting");

  if (compact) {
    if (stopped) {
      return (
        <p className={cn("text-caption text-muted", className)}>This trip was called off.</p>
      );
    }
    const doneCount = stages.filter((s) => s.state === "done").length;
    return (
      <p className={cn("flex items-center gap-2 text-caption text-muted", className)}>
        <Dot state={current?.state ?? "done"} small />
        <span className="truncate">
          {current ? current.label : "Finished"}
          <span className="text-muted"> · step {Math.min(doneCount + 1, stages.length)} of {stages.length}</span>
        </span>
      </p>
    );
  }

  return (
    <ol className={cn("space-y-0", className)}>
      {stages.map((s, i) => (
        <li key={s.key} className="flex gap-3">
          {/* Rail: the dot, and the line down to the next step. */}
          <div className="flex w-4 shrink-0 flex-col items-center">
            <Dot state={s.state} />
            {i < stages.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "w-px flex-1",
                  s.state === "done" ? "bg-moss/50" : "bg-line",
                )}
              />
            )}
          </div>

          <div className={cn("min-w-0 pb-4", i === stages.length - 1 && "pb-0")}>
            <p
              className={cn(
                "text-sm leading-5",
                (s.state === "current" || s.state === "waiting") && "font-medium text-ink",
                s.state === "done" && "text-ink-soft",
                (s.state === "upcoming" || s.state === "stopped") && "text-muted",
              )}
            >
              {s.label}
              {s.state === "done" && <span className="sr-only"> — done</span>}
            </p>
            {(s.state === "current" || s.state === "waiting") && (
              <p className="mt-0.5 text-caption text-muted">{s.hint}</p>
            )}
            {details?.[s.key] && <div className="mt-2">{details[s.key]}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Dot({ state, small = false }: { state: Stage["state"]; small?: boolean }) {
  const size = small ? "h-2 w-2" : "h-3.5 w-3.5";
  // Waiting: reached, nothing to do, starts by itself. A hollow moss ring
  // without the halo — it is not where anybody's attention is needed.
  if (state === "waiting") {
    return (
      <span className={cn("shrink-0 rounded-full border-2 border-moss/60 bg-paper", size)} />
    );
  }
  if (state === "done") {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-moss text-paper",
          size,
        )}
      >
        {!small && (
          <svg viewBox="0 0 12 12" aria-hidden="true" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6.2l2.3 2.3L9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    );
  }
  if (state === "current") {
    // A ring rather than a pulse: this sits on a page somebody reads for a
    // while, and a dot that never stops moving is a page you cannot read.
    return (
      <span
        className={cn(
          "shrink-0 rounded-full border-2 border-moss bg-paper ring-4 ring-moss/15",
          size,
        )}
      />
    );
  }
  return <span className={cn("shrink-0 rounded-full border border-line bg-paper", size)} />;
}
