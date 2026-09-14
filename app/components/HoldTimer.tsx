import { useEffect, useState } from "react";
import { clockFor, holdAdvice, holdStatus, type Hold } from "~/lib/hold";

/**
 * "Holding your dates — 2:59:41".
 *
 * The hold was always real: the guide's calendar days are marked held at
 * acceptance and a sweep releases them when the deadline passes. The checkout
 * page never said so, so a booking could evaporate for a reason the trekker
 * had never been shown.
 *
 * The deadline comes from the server, not from page load — a reader who leaves
 * the tab open for an hour and comes back sees the real time left, not three
 * fresh hours. The seconds tick on the client; with no JavaScript the
 * server-rendered value still states the window honestly.
 */
export function HoldTimer({
  expiresAt,
  serverNow,
  guideFirstName,
}: {
  /** bookings.hold_expires_at, ISO. */
  expiresAt: string | null;
  /** The server's clock at render, so the first frame is not the browser's. */
  serverNow: string;
  guideFirstName: string;
}) {
  const initial = holdStatus(expiresAt, new Date(serverNow));
  const [hold, setHold] = useState<Hold>(initial);

  useEffect(() => {
    if (!expiresAt || initial.state === "none") return;
    // Offset, not the browser's clock: a device an hour out would otherwise
    // show an hour of hold that does not exist.
    const skew = Date.now() - new Date(serverNow).getTime();
    const tick = () => setHold(holdStatus(expiresAt, new Date(Date.now() - skew)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, serverNow, initial.state]);

  if (hold.state === "none") return null;

  const expired = hold.state === "expired";
  const urgent = hold.state === "soon";
  const advice = holdAdvice(hold.state, guideFirstName);

  return (
    <div
      className={
        "rounded-card border px-4 py-3 " +
        (expired
          ? "border-ember/30 bg-ember/5"
          : urgent
            ? "border-ember/30 bg-ember/5"
            : "border-sage bg-mist")
      }
    >
      <div className="flex items-center gap-2.5">
        <ClockGlyph className={expired || urgent ? "text-ember" : "text-moss"} />
        <p className="text-sm text-ink">
          {expired ? (
            <span className="font-medium">Your hold has ended</span>
          ) : (
            <>
              <span className="font-medium">Holding your dates for </span>
              {/* aria-live so a screen reader is told the minute, not the
                  second — a per-second announcement is unusable. */}
              <span
                className="font-mono font-medium tabular-nums"
                aria-live="off"
                suppressHydrationWarning
              >
                {hold.clock}
              </span>
            </>
          )}
        </p>
      </div>
      {advice && (
        <p className={"mt-1 text-caption " + (expired || urgent ? "text-ember" : "text-ink-soft")}>
          {advice}
        </p>
      )}
      {/* The minute-level value, for anybody listening rather than looking. */}
      {!expired && (
        <p className="sr-only" aria-live="polite">
          {Math.ceil(hold.secondsLeft / 60)} minutes left to pay.
        </p>
      )}
    </div>
  );
}

/** The static version, for a page that cannot tick — an email, a PDF. */
export function holdClockText(expiresAt: string | null, now: Date): string {
  return clockFor(holdStatus(expiresAt, now).secondsLeft);
}

function ClockGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={"shrink-0 " + (className ?? "")}
      aria-hidden="true"
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.5V13l2.5 1.5" />
      <path d="M9 3h6" />
    </svg>
  );
}
