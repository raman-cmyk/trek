import { cn } from "~/lib/cn";

/**
 * The ":: LABEL" line (docs/07, from reference 1).
 *
 * Small mono capitals with a double-colon mark — the one place uppercase is
 * allowed besides `.label`, and the same thing: an eyebrow above a heading, a
 * heading over a block of facts. The mark is what makes it read as a system
 * rather than a stray caption.
 */
export function Eyebrow({
  children,
  tone = "muted",
  className,
  as: Tag = "p",
}: {
  children: React.ReactNode;
  tone?: "muted" | "moss" | "paper" | "chartreuse";
  className?: string;
  as?: "p" | "span" | "h2" | "h3" | "div";
}) {
  const color = {
    muted: "text-muted",
    moss: "text-moss",
    paper: "text-paper/80",
    chartreuse: "text-chartreuse",
  }[tone];
  return (
    <Tag
      className={cn(
        "flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em]",
        color,
        className,
      )}
    >
      <span aria-hidden="true" className="tracking-[-0.1em] opacity-70">
        ::
      </span>
      <span>{children}</span>
    </Tag>
  );
}
