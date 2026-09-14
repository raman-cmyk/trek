import { cn } from "~/lib/cn";
import { Glyph, type ChipGlyph } from "./Chip";

/**
 * A fact as a tile: the big number, the tiny label (docs/07, from references
 * 1, 4 and 5 — "$5,000 BUDGET", "2.8 km Distance", "Activities 32").
 *
 * Numbers are mono by house rule; the label is the eyebrow style. Three
 * surfaces: on paper (a mist tile), on a photograph (glass), and bare (no box
 * — for a row inside a card that is already a box). The unit rides beside the
 * number at body size so "5,545 m" reads as one thing.
 */
export function StatTile({
  value,
  unit,
  label,
  glyph,
  surface = "paper",
  className,
}: {
  value: React.ReactNode;
  unit?: string;
  label: string;
  glyph?: ChipGlyph;
  surface?: "paper" | "glass" | "glass-dark" | "bare";
  className?: string;
}) {
  const box = {
    paper: "rounded-photo bg-mist px-4 py-3",
    glass: "glass rounded-photo px-4 py-3 text-ink",
    "glass-dark": "glass-dark rounded-photo px-4 py-3",
    bare: "",
  }[surface];
  const dark = surface === "glass-dark";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", box, className)}>
      {glyph && (
        <span
          className={cn(
            "mb-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full",
            dark ? "bg-paper/15 text-chartreuse" : "bg-card text-moss",
          )}
        >
          <Glyph name={glyph} />
        </span>
      )}
      <p className={cn("truncate font-mono text-2xl leading-none", dark ? "text-paper" : "text-ink")}>
        {value}
        {unit && (
          <span className={cn("ml-1 font-sans text-sm", dark ? "text-paper/70" : "text-muted")}>
            {unit}
          </span>
        )}
      </p>
      <p
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.12em]",
          dark ? "text-paper/70" : "text-muted",
        )}
      >
        {label}
      </p>
    </div>
  );
}

/** Tiles in a row — two-up on a phone, all in one row where they fit. */
export function StatRow({
  children,
  className,
  cols,
}: {
  children: React.ReactNode;
  className?: string;
  /** Desktop column count; defaults to one per child. */
  cols?: 2 | 3 | 4 | 5;
}) {
  const desktop = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" };
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2",
        cols ? desktop[cols] : "sm:auto-cols-fr sm:grid-flow-col",
        className,
      )}
    >
      {children}
    </div>
  );
}
