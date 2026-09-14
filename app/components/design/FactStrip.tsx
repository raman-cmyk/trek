import { cn } from "~/lib/cn";
import { Glyph, type ChipGlyph } from "./Chip";

export interface Fact {
  glyph?: ChipGlyph;
  value: React.ReactNode;
  /** Small word after the value: "days", "m". */
  unit?: string;
  label?: string;
}

/**
 * The conditions strip (docs/07, from reference 4's "Temperature · Wind · UV"
 * block — but with the facts we actually hold: altitude, days, grade, best
 * months, distance).
 *
 * One line of small facts separated by dots, numbers mono. On a photograph it
 * sits in a glass pill; on paper it is a plain line. It answers "what am I
 * looking at" before the reader has read a sentence.
 */
export function FactStrip({
  facts,
  onPhoto = false,
  className,
}: {
  facts: Fact[];
  onPhoto?: boolean;
  className?: string;
}) {
  const shown = facts.filter((f) => f.value !== null && f.value !== undefined && f.value !== "");
  if (shown.length === 0) return null;
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
        onPhoto ? "glass-dark inline-flex rounded-pill px-3 py-1.5" : "text-muted",
        className,
      )}
    >
      {shown.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden="true" className={cn("-ml-1.5 mr-0", onPhoto ? "text-paper/40" : "text-line")}>
              ·
            </span>
          )}
          {f.glyph && <Glyph name={f.glyph} className={onPhoto ? "text-chartreuse" : "text-moss"} />}
          <span className={cn("font-mono", onPhoto ? "text-paper" : "text-ink")}>{f.value}</span>
          {f.unit && <span className={onPhoto ? "text-paper/70" : undefined}>{f.unit}</span>}
          {f.label && <span className={cn("sr-only")}>{f.label}</span>}
        </span>
      ))}
    </p>
  );
}
