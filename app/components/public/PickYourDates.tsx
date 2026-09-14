import { useState } from "react";
import { Form } from "react-router";
import { AvailabilityCalendar } from "~/components/public/AvailabilityCalendar";
import { daysLabel, formatSpan, rangeDays } from "~/lib/date-span";

/**
 * The dates you want, chosen on the guide's own calendar.
 *
 * "I as a client should be able to select the dates I want to go on a trek
 * with a guide before clicking request to book." On a guide's page there is
 * no trip picked yet and so no length to derive — you say when you are in
 * Nepal, and the guide answers with what fits. So this is a free range: click
 * the first day, click the last.
 *
 * What it produces is a message with the dates already written into it. The
 * alternative — a calendar that only decorates, and then a blank message box
 * where you type "September sometime?" — is how a conversation starts two
 * days behind where it could have.
 */
export function PickYourDates({
  openDays,
  monthsFrom,
  guideId,
  guideFirstName,
  backTo,
  months = 2,
}: {
  openDays: string[];
  monthsFrom: string;
  guideId: string;
  guideFirstName: string;
  /** Where sign-in returns you if you are not signed in yet. */
  backTo: string;
  months?: number;
}) {
  const [sel, setSel] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const open = new Set(openDays);
  const chosen = sel.start && sel.end ? rangeDays(sel.start, sel.end) : [];
  // A range drawn across the guide's booked days. Said plainly rather than
  // prevented: they may well be able to move something, and that is a
  // conversation, not an error.
  const taken = chosen.filter((d) => !open.has(d));

  return (
    <div>
      <AvailabilityCalendar
        openDays={openDays}
        monthsFrom={monthsFrom}
        months={months}
        select="range"
        value={sel}
        onPick={setSel}
      />

      <div className="mt-4 rounded-card border border-line bg-paper p-4">
        {!sel.start ? (
          <p className="text-sm text-ink-soft">
            Tap the day you would like to start, then the day you fly home —
            and send {guideFirstName} the dates.
          </p>
        ) : !sel.end ? (
          <p className="text-sm text-ink-soft">
            Starting{" "}
            <span className="font-medium text-ink">{formatSpan(sel.start, sel.start)}</span>.
            Now tap your last day.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium text-ink">
                {formatSpan(sel.start, sel.end)}
              </span>
              <span className="text-ink-soft"> · {daysLabel(chosen.length)}</span>
            </p>
            {taken.length > 0 && (
              <p className="mt-1 text-sm text-ink-soft">
                {guideFirstName} is already out for {daysLabel(taken.length)} of that.
                Send it anyway — they will tell you what can move.
              </p>
            )}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Form method="post" action="/conversations">
            <input type="hidden" name="guide_id" value={guideId} />
            <input type="hidden" name="next" value={backTo} />
            <input
              type="hidden"
              name="ask"
              value={
                sel.start && sel.end
                  ? `I'd like to walk ${formatSpan(sel.start, sel.end)} — ${daysLabel(
                      chosen.length,
                    )}. Does that work for you?`
                  : ""
              }
            />
            <button
              disabled={!sel.start || !sel.end}
              className="rounded bg-moss px-5 py-2.5 text-sm font-medium text-white hover:bg-pine disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sel.start && sel.end
                ? `Send these dates to ${guideFirstName}`
                : "Pick your dates"}
            </button>
          </Form>
          {sel.start && (
            <button
              type="button"
              onClick={() => setSel({ start: null, end: null })}
              className="text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
