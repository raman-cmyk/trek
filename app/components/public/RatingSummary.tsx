/**
 * Five glyphs, filled to the mean.
 *
 * The shared <Stars> pairs one glyph with the number, which is right in a
 * dense card and wrong directly under a 48px "5.0" — it just says the number
 * twice. Here the row is the picture and the number above it is the value, so
 * the fill is a clipped overlay and a 4.6 looks like a 4.6.
 */
function StarRow({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value / 5)) * 100;
  const row = (cls: string) => (
    <span className={`flex gap-0.5 ${cls}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className="size-4" fill="currentColor">
          <path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z" />
        </svg>
      ))}
    </span>
  );
  return (
    <span className="relative inline-flex" role="img" aria-label={`${value.toFixed(1)} out of 5`}>
      {row("text-mist")}
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      >
        {row("text-moss")}
      </span>
    </span>
  );
}

/**
 * The rating, at the size the decision deserves.
 *
 * Two lines of small text under a heading is how a page treats a footnote, and
 * reviews are not a footnote — for a reader choosing between two strangers
 * they are most of the evidence. So the number gets display size and the
 * spread gets drawn: a bar per star, which answers "is this a real five or
 * three ratings and a rounding" without the reader counting anything.
 *
 * The histogram is built from the reviews actually on the page, so the bars
 * and the cards below them can never disagree.
 */
export function RatingSummary({
  reviews,
}: {
  reviews: Array<{ overall: number }>;
}) {
  const n = reviews.length;
  const mean = n ? reviews.reduce((s, r) => s + r.overall, 0) / n : 0;
  // 5 down to 1, because that is the order every reader already knows.
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.overall) === star).length,
  }));

  return (
    <div className="mt-5 grid gap-6 rounded-md border border-line bg-card p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
      <div className="sm:border-r sm:border-line sm:pr-10">
        <p className="font-display text-5xl leading-none text-ink">
          {mean.toFixed(1)}
        </p>
        <div className="mt-2">
          <StarRow value={mean} />
        </div>
        <p className="mt-1 text-caption text-muted">
          {n} review{n === 1 ? "" : "s"}
        </p>
      </div>

      <div className="space-y-1.5 self-center">
        {buckets.map((b) => (
          <div key={b.star} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-caption text-ink-soft">
              {b.star} star
            </span>
            <span
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full bg-moss"
                style={{ width: `${n ? (b.count / n) * 100 : 0}%` }}
              />
            </span>
            <span className="w-5 shrink-0 text-right font-mono text-caption text-muted">
              {b.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
