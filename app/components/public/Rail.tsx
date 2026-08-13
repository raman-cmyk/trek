import { cn } from "~/lib/cn";

/**
 * A horizontal snap rail — the native way to show a set of cards on a phone.
 *
 * A stack of cards reads like a page; a rail you thumb through card-by-card
 * reads like an app. Cards keep a fixed width, snap to the left edge, and
 * the rail bleeds to the viewport edge so the cut-off next card is the
 * scroll affordance — no arrows, no dots, no visible scrollbar.
 */
export function Rail({
  children,
  itemClassName = "w-[76vw] max-w-[300px] sm:w-[280px]",
  className,
}: {
  children: React.ReactNode[];
  /** Fixed width per card — the snap needs it. */
  itemClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar snap-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1",
        className,
      )}
    >
      {children.map((c, i) => (
        <div key={i} className={cn("shrink-0", itemClassName)}>
          {c}
        </div>
      ))}
    </div>
  );
}
