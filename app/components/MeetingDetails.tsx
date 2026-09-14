import { Link } from "react-router";
import { copy } from "~/lib/copy";
import { fmtDate } from "~/lib/format";
import type { Meeting } from "~/lib/meeting";
import { meetingGap } from "~/lib/meeting";

/**
 * Where to meet, under the step that asks for it.
 *
 * The address, the day and the time on one card, so the one thing a trekker
 * needs on the morning of a food tour is on the trip page and not in a chat
 * thread three weeks back. It says who set it: a guide's own instruction for
 * this trip carries more weight than the experience's usual start, and a
 * trekker can tell which they are reading.
 *
 * When it is not settled, this is where the trigger is spelled out — who has
 * to do what, and the way to ask them — because a step that cannot explain
 * itself is the bug this whole change fixes.
 */
export function MeetingDetails({
  meeting,
  startDate,
  guideFirstName,
  askHref,
}: {
  meeting: Meeting;
  startDate: string | null | undefined;
  guideFirstName: string;
  /** Where "Ask {guide}" goes — the thread with them. */
  askHref?: string;
}) {
  const gap = meetingGap(meeting, guideFirstName);

  if (!meeting.settled) {
    return (
      <div className="rounded-card bg-surface p-3 text-sm">
        <p className="text-ink-soft">{gap}</p>
        {meeting.place && (
          <p className="mt-1 text-ink">
            {copy.meeting.usuallyStarts.replace("{place}", meeting.place)}
          </p>
        )}
        {meeting.time && (
          <p className="mt-1 text-ink">
            {copy.meeting.usuallyAt.replace("{time}", meeting.time)}
          </p>
        )}
        {askHref && (
          <Link to={askHref} className="mt-2 inline-block font-medium text-primary hover:underline">
            {copy.meeting.ask.replace("{guide}", guideFirstName)} →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-card p-3 text-sm">
      <dl className="space-y-1">
        <Line label={copy.meeting.where} value={meeting.place!} />
        {startDate && <Line label={copy.meeting.when} value={fmtDate(startDate)} />}
        <Line label={copy.meeting.at} value={meeting.time!} />
      </dl>
      {meeting.note && <p className="mt-2 text-ink">{meeting.note}</p>}
      <p className="mt-2 text-caption text-muted">
        {meeting.from === "guide"
          ? copy.meeting.fromGuide.replace("{guide}", guideFirstName)
          : copy.meeting.fromExperience}
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-ink-soft">{label}</dt>
      <dd className="min-w-0 font-medium text-ink">{value}</dd>
    </div>
  );
}
