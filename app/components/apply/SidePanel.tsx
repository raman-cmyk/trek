import { t, tf, type Lang } from "~/lib/apply-copy";
import { earningsFor, formatNpr, type RateRange } from "~/lib/guide-earnings";
import type { StepId } from "~/lib/apply-flow";
import { cn } from "~/lib/cn";

/**
 * What the column beside the form is for.
 *
 * It used to be a map of the Langtang valley, which is decoration on a page
 * where somebody is deciding whether to hand over their citizenship card. So
 * it answers the fear belonging to the step they are on:
 *
 *   steps 1-2  what this pays, and that all of it is theirs
 *   steps 3-4  how we verify, and who sees the ID — asked right where the
 *              upload is
 *   step 5     what happens after they press send
 *
 * Content, not chrome: on a phone the same thing collapses above the fields
 * rather than being dropped, because the fear does not go away on a small
 * screen.
 */
export function SidePanel({
  step,
  lang,
  nprPerDay,
  range,
  sampleTrek,
  verifyDays,
  className,
}: {
  step: StepId;
  lang: Lang;
  nprPerDay: number | null;
  range: RateRange | null;
  /** A real trek to price the preview against. */
  sampleTrek: { name: string; days: number } | null;
  /** The office's real turnaround, when we know it. */
  verifyDays: number | null;
  className?: string;
}) {
  const box = "rounded-md border border-line bg-card p-4";

  if (step === "you" || step === "work" || step === "intro") {
    const earn = nprPerDay && sampleTrek ? earningsFor(nprPerDay, sampleTrek.days) : null;
    return (
      <div className={cn(box, className)}>
        <p className="label text-muted">{t("earningsHead", lang)}</p>
        {earn && sampleTrek ? (
          <>
            <p className="mt-2 font-display text-2xl leading-tight text-ink">
              {formatNpr(earn.total)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {tf("earningsLine", lang, {
                rate: formatNpr(earn.perDay),
                days: String(earn.days),
                trek: sampleTrek.name,
              })}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {range
              ? tf("rateHint", lang, {
                  low: range.low.toLocaleString("en-US"),
                  high: range.high.toLocaleString("en-US"),
                })
              : t("dayRateHint", lang)}
          </p>
        )}
        <p className="mt-3 flex items-baseline gap-2 border-t border-line pt-3">
          <span className="font-mono text-sm font-medium text-moss">100%</span>
          <span className="text-sm text-ink">{t("keepAll", lang)}</span>
        </p>
        <p className="mt-1 text-caption text-muted">{t("keepAllWhy", lang)}</p>
      </div>
    );
  }

  if (step === "licence" || step === "id") {
    return (
      <div className={cn(box, className)}>
        <p className="label text-muted">{t("howWeVerifyHead", lang)}</p>
        <ol className="mt-3 space-y-2.5 text-sm">
          {(["verifyLicence", "verifyId", "verifyCall", "verifySigned"] as const).map((k, i) => (
            <li key={k} className="flex gap-2.5">
              <span className="mt-0.5 font-mono text-caption text-muted">{i + 1}</span>
              <span className="text-ink">{t(k, lang)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex gap-2 rounded bg-mist px-3 py-2.5 text-caption text-ink-soft">
          <LockMark />
          <span>{t("privacyPromise", lang)}</span>
        </p>
      </div>
    );
  }

  return (
    <div className={cn(box, className)}>
      <p className="label text-muted">{t("nextStepsHead", lang)}</p>
      <ol className="mt-3 space-y-3 text-sm">
        {(["nextRead", "nextCall", "nextLive"] as const).map((k, i) => (
          <li key={k} className="flex gap-2.5">
            <span className="mt-0.5 font-mono text-caption text-muted">{i + 1}</span>
            <span className="text-ink">{t(k, lang)}</span>
          </li>
        ))}
      </ol>
      {verifyDays ? (
        <p className="mt-3 border-t border-line pt-3 font-mono text-caption text-muted">
          {tf("nextWhen", lang, { days: String(verifyDays) })}
        </p>
      ) : null}
    </div>
  );
}

export function LockMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5.5a2.5 2.5 0 015 0V7" />
    </svg>
  );
}
