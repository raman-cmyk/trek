import { useState } from "react";
import {
  BS_MAX_YEAR,
  BS_MIN_YEAR,
  BS_MONTHS,
  adToBs,
  bsMonthLength,
  bsToAd,
  formatBs,
} from "~/lib/bikram";
import { cn } from "~/lib/cn";

/**
 * A licence expiry, in whichever calendar the card is printed in.
 *
 * A Nepali trekking licence prints BS. The field was `type="date"`, which is
 * a Gregorian spinner — so a guide either converts in their head or types
 * 2085 into an AD box and registers a licence that expires sixty years late.
 *
 * Whichever side you fill in, the hidden field carries AD, because that is
 * what the database stores and what the office compares against today. The
 * other calendar is echoed underneath so a guide can see it matches their
 * card before they move on.
 */
export function BsAdDate({
  name,
  value,
  onChange,
  label,
  hint,
  problem,
}: {
  name: string;
  /** ISO AD date, or "". */
  value: string;
  onChange: (iso: string) => void;
  label: string;
  hint?: string;
  problem?: string | null;
}) {
  const [mode, setMode] = useState<"bs" | "ad">("bs");
  const asBs = value ? adToBs(value) : null;

  /**
   * Nothing is pre-selected, on purpose.
   *
   * The first version opened on Baisakh 1, 2085 — a plausible-looking expiry
   * that had never been emitted, so the guide saw a date, the form held
   * nothing, and Next refused with no visible reason. Defaulting it the other
   * way is worse: a licence expiry nobody touched would submit as whatever
   * the box happened to be showing.
   *
   * So each part is empty until it is chosen, and the AD value only exists
   * once all three are.
   */
  const [bs, setBs] = useState<{ year?: number; month?: number; day?: number }>(
    () => asBs ?? {},
  );

  const pushBs = (next: typeof bs) => {
    // Clamp the day to the month it landed in, so changing month never leaves
    // an impossible date sitting in the box.
    const len = next.year && next.month ? bsMonthLength(next.year, next.month) : null;
    const fixed =
      len && next.day && next.day > len ? { ...next, day: len } : next;
    setBs(fixed);
    onChange(
      fixed.year && fixed.month && fixed.day
        ? bsToAd({ year: fixed.year, month: fixed.month, day: fixed.day }) ?? ""
        : "",
    );
  };

  const years: number[] = [];
  for (let y = BS_MIN_YEAR; y <= BS_MAX_YEAR; y++) years.push(y);
  const dayCount = bs.year && bs.month ? (bsMonthLength(bs.year, bs.month) ?? 30) : 32;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-ink" htmlFor={mode === "ad" ? `${name}-ad` : `${name}-bs-year`}>
          {label}
        </label>
        {/* Two buttons rather than a select: on a phone this is one tap. */}
        <div className="flex overflow-hidden rounded-pill border border-line text-caption">
          {(["bs", "ad"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "px-3 py-1 font-mono uppercase tracking-[0.08em] transition-colors duration-instant",
                mode === m ? "bg-pine text-paper" : "text-muted hover:text-ink",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}

      {mode === "bs" ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <select
            id={`${name}-bs-year`}
            aria-label="Year (BS)"
            value={bs.year ?? ""}
            onChange={(e) => pushBs({ ...bs, year: Number(e.target.value) || undefined })}
            className="h-[52px] rounded-xl border border-line bg-card px-3 text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/30"
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            aria-label="Month (BS)"
            value={bs.month ?? ""}
            onChange={(e) => pushBs({ ...bs, month: Number(e.target.value) || undefined })}
            className="h-[52px] rounded-xl border border-line bg-card px-3 text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/30"
          >
            <option value="">Month</option>
            {BS_MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            aria-label="Day (BS)"
            value={bs.day ?? ""}
            onChange={(e) => pushBs({ ...bs, day: Number(e.target.value) || undefined })}
            className="h-[52px] rounded-xl border border-line bg-card px-3 text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/30"
          >
            <option value="">Day</option>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      ) : (
        <input
          id={`${name}-ad`}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 h-[52px] w-full rounded-xl border border-line bg-card px-3 text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/30"
        />
      )}

      {/* The other calendar, so it can be checked against the card. */}
      {value && (
        <p className="mt-1.5 font-mono text-caption text-muted">
          {mode === "bs"
            ? `${value} AD`
            : asBs
              ? `${formatBs(asBs)} BS`
              : "outside the Bikram table — AD only"}
        </p>
      )}
      {problem && <p className="mt-1.5 text-sm text-ember">{problem}</p>}

      {/* AD is what gets stored, whichever side was filled in. */}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
