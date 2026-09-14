import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import {
  WEEKDAY_LABELS,
  addMonths,
  canGoBack,
  canGoForward,
  firstSelectable,
  initialMonth,
  lastSelectable,
  longDayLabel,
  monthGrid,
  monthLabel,
  parseIso,
  type MonthKey,
} from "~/lib/calendar";

/**
 * A date, chosen from a calendar.
 *
 * A bare `<input type="date">` is rendered by the browser in its own locale, so
 * the homepage asked a trekker in Berlin for mm/dd/yyyy and a guide in
 * Kathmandu for dd/mm/yyyy, both had to type it, and neither could see that
 * the 12th is a Saturday. This is the month grid people expect: seven columns,
 * the days either side greyed, arrows to walk forward eighteen months, and
 * nothing selectable before tomorrow.
 *
 * Progressive on purpose. The server renders the native input — public pages
 * must work with the JavaScript switched off (CLAUDE.md rule 5) — and the grid
 * replaces it once mounted, posting the same ISO value under the same name.
 */
export function DatePicker({
  name,
  today,
  defaultValue,
  id,
  label,
  className,
  inputClassName,
  placeholder = "Pick a date",
  /** Nothing before this, if it is later than tomorrow. */
  min,
  /** Nothing after this. */
  max,
  /** Fires on every pick, for a form that reprices as you choose. */
  onChange,
}: {
  name: string;
  /** Today, from the server, so the first render is the same on both sides. */
  today: string;
  defaultValue?: string | null;
  id?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  onChange?: (iso: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<MonthKey>(() => initialMonth(defaultValue ?? null, today));
  const wrap = useRef<HTMLDivElement>(null);

  // Only after hydration, so the server and the first client render match.
  useEffect(() => setMounted(true), []);

  // Close on a click elsewhere or on Escape — the two things every popover owes.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const lo = useMemo(() => {
    const floor = firstSelectable(today);
    return min && min > floor ? min : floor;
  }, [min, today]);
  const hi = max ?? lastSelectable(today);
  const weeks = useMemo(() => monthGrid(shown, { today, min: lo, max: hi }), [shown, today, lo, hi]);

  const pick = (iso: string) => {
    setValue(iso);
    setOpen(false);
    onChange?.(iso);
  };

  // No JavaScript, or not yet: the native input, which still posts the right
  // value and still refuses a date before tomorrow.
  if (!mounted) {
    return (
      <input
        id={id}
        type="date"
        name={name}
        defaultValue={defaultValue ?? ""}
        min={lo}
        max={hi}
        aria-label={label}
        className={inputClassName}
      />
    );
  }

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        onClick={() => {
          setShown(initialMonth(value || null, today));
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className={cn("text-left", inputClassName, !value && "text-muted")}
      >
        {value ? longDayLabel(value) : placeholder}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label ?? "Choose a date"}
          className="absolute left-0 z-40 mt-2 w-[19rem] rounded-card border border-line bg-paper p-3 shadow-lift"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShown(addMonths(shown, -1))}
              disabled={!canGoBack(shown, today)}
              aria-label="Previous month"
              className="grid h-8 w-8 place-items-center rounded-full text-ink hover:bg-mist disabled:opacity-30"
            >
              ‹
            </button>
            <p className="font-medium text-ink" aria-live="polite">
              {monthLabel(shown)}
            </p>
            <button
              type="button"
              onClick={() => setShown(addMonths(shown, 1))}
              disabled={!canGoForward(shown, today)}
              aria-label="Next month"
              className="grid h-8 w-8 place-items-center rounded-full text-ink hover:bg-mist disabled:opacity-30"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="py-1 text-center text-caption text-muted">
                {w}
              </span>
            ))}
            {weeks.flat().map((c) => {
              const chosen = c.date === value;
              return (
                <button
                  key={c.date}
                  type="button"
                  disabled={c.disabled}
                  onClick={() => pick(c.date)}
                  aria-current={c.isToday ? "date" : undefined}
                  aria-label={longDayLabel(c.date)}
                  className={cn(
                    "grid h-9 place-items-center rounded text-sm tabular-nums",
                    chosen
                      ? "bg-pine font-medium text-paper"
                      : c.disabled
                        ? "text-muted/40"
                        : c.outside
                          ? "text-muted hover:bg-mist"
                          : "text-ink hover:bg-mist",
                    c.isToday && !chosen && "ring-1 ring-inset ring-moss/60",
                  )}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => pick(firstSelectable(today))}
              className="rounded px-2 py-1 text-sm text-primary hover:bg-mist"
            >
              Tomorrow
            </button>
            {value && (
              <button
                type="button"
                onClick={() => pick("")}
                className="rounded px-2 py-1 text-sm text-muted hover:bg-mist"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The chosen date in words, for anything that needs to echo it back. */
export function dateWords(iso: string | null | undefined): string {
  return iso && parseIso(iso) ? longDayLabel(iso) : "";
}
