import { formatUsd } from "~/lib/pricing";
import { cn } from "~/lib/cn";

/**
 * The Split (Feature Pack v3 §0, on Brand v1 tokens). Two modes:
 *  - "guide": how a day rate splits (Guide 90% · Trek 10%). Thin bar.
 *  - "experience": the full package breakdown from explicit amounts. Amounts
 *    MUST sum to the total; on mismatch we render in --ember, never silently
 *    normalise a money figure. Transaction layer — plain, mono amounts.
 */

type SliceKey = "guide" | "permits" | "porters" | "logistics" | "trek" | "fund";

// v1 token per slice (v2's --field/--deep/--sky/--signal mapped to Brand v1).
const SLICE: Record<SliceKey, { color: string; label: string }> = {
  guide: { color: "var(--color-moss)", label: "Guide fees" },
  permits: { color: "var(--color-pine)", label: "Permits" },
  porters: { color: "var(--color-fern)", label: "Porters" },
  logistics: { color: "var(--color-sage)", label: "Teahouse, food & logistics" },
  trek: { color: "var(--color-wheat)", label: "Trek fee" },
  fund: { color: "var(--color-chartreuse)", label: "The Fund" },
};

function Bar({ slices, className }: { slices: { color: string; pct: number }[]; className?: string }) {
  return (
    <div className={cn("flex h-2.5 w-full overflow-hidden rounded-full bg-line", className)}>
      {slices.map((s, i) => (
        <div key={i} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
      ))}
    </div>
  );
}

export function GuideSplit({
  guide = 90,
  trek = 10,
  showLabels = true,
}: {
  guide?: number;
  trek?: number;
  showLabels?: boolean;
}) {
  return (
    <div>
      <Bar
        slices={[
          { color: SLICE.guide.color, pct: guide },
          { color: "var(--color-muted)", pct: trek },
        ]}
      />
      {showLabels && (
        <div className="mt-1.5 flex justify-between text-xs text-muted">
          <span>
            <span className="font-mono text-ink">{guide}%</span> to your guide
          </span>
          <span>
            Trek <span className="font-mono text-ink">{trek}%</span>
          </span>
        </div>
      )}
    </div>
  );
}

export interface SplitAmounts {
  guide: number;
  permits: number;
  porters: number;
  logistics: number;
  trek: number;
  fund: number;
}

export function ExperienceSplit({
  amounts,
  total,
  showAmounts = false,
  perLabel = "per person",
}: {
  amounts: SplitAmounts;
  /** Displayed total to reconcile against; defaults to the sum. */
  total?: number;
  showAmounts?: boolean;
  perLabel?: string;
}) {
  const order: SliceKey[] = ["guide", "permits", "porters", "logistics", "trek", "fund"];
  const sum = order.reduce((s, k) => s + (amounts[k] || 0), 0);
  const claimed = total ?? sum;
  const mismatch = claimed !== sum;
  const denom = sum || 1;

  return (
    <div>
      <Bar slices={order.map((k) => ({ color: SLICE[k].color, pct: ((amounts[k] || 0) / denom) * 100 }))} />

      {showAmounts && (
        <dl className="mt-4 space-y-2 text-sm">
          {order.map((k) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-ink">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SLICE[k].color }} />
                {SLICE[k].label}
                {k === "fund" && (
                  <span className="text-xs text-muted">— funds guide insurance &amp; welfare</span>
                )}
              </dt>
              <dd className="font-mono text-ink">{formatUsd(amounts[k] || 0)}</dd>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2 font-medium">
            <dt>Total</dt>
            <dd className={cn("font-mono", mismatch ? "text-ember" : "text-ink")}>
              {formatUsd(claimed)} <span className="text-muted">· {perLabel}</span>
            </dd>
          </div>
          {mismatch && (
            <p className="text-xs text-ember">
              Line items sum to {formatUsd(sum)} — this total doesn't reconcile. Do not book; contact us.
            </p>
          )}
        </dl>
      )}
    </div>
  );
}
