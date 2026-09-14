/**
 * Where to meet.
 *
 * A booking's meeting details come from one of two places: the guide set them
 * for this trip, or the experience says where it always starts. This decides
 * which, whether they add up to an answer a trekker can act on, and what the
 * screen says when they do not.
 *
 * Pure, because the same answer has to appear on the trip page, the group
 * page and the guide's own list without the three of them disagreeing.
 */

export interface MeetingFields {
  meeting_point?: string | null;
  meeting_time?: string | null;
  meeting_note?: string | null;
  meeting_set_at?: string | null;
}

export interface OfferingMeeting {
  meeting_point?: string | null;
  meet_time?: string | null;
}

export interface Meeting {
  /** Where, in the guide's words. */
  place: string | null;
  /** "18:00" — 24-hour, because "6" is read two ways and a missed food tour is not recoverable. */
  time: string | null;
  /** Anything else the guide added: what to bring, what you cannot eat. */
  note: string | null;
  /** Who said so: the guide for this trip, or the experience's usual start. */
  from: "guide" | "experience" | null;
  /**
   * Both the place and the time are known, so a trekker can be there. A place
   * with no time is half an answer and does not count.
   */
  settled: boolean;
}

/** "18:00:00" or "18:00" → "18:00". Anything else → null. */
export function fmtMeetTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(raw.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

/** A time typed into a form: accepted only if the browser gave us HH:MM. */
export function parseMeetTime(raw: unknown): string | null {
  return fmtMeetTime(typeof raw === "string" ? raw : null);
}

export function resolveMeeting(
  booking: MeetingFields | null | undefined,
  offering: OfferingMeeting | null | undefined,
): Meeting {
  const ownPlace = booking?.meeting_point?.trim() || null;
  const ownTime = fmtMeetTime(booking?.meeting_time);
  const note = booking?.meeting_note?.trim() || null;

  // The guide has spoken about this trip if either half is theirs.
  if (ownPlace || ownTime) {
    const place = ownPlace ?? offering?.meeting_point?.trim() ?? null;
    const time = ownTime ?? fmtMeetTime(offering?.meet_time);
    return { place, time, note, from: "guide", settled: !!place && !!time };
  }

  const place = offering?.meeting_point?.trim() || null;
  const time = fmtMeetTime(offering?.meet_time);
  if (!place && !time) {
    return { place: null, time: null, note, from: null, settled: false };
  }
  return { place, time, note, from: "experience", settled: !!place && !!time };
}

/**
 * The whole answer on one line: "Thamel · 23 Sep 2026 · 18:00". Whatever is
 * missing is simply absent — a line that prints "TBC" twice tells a trekker
 * nothing they could not already see.
 */
export function meetingLine(
  m: Meeting,
  startDate: string | null | undefined,
  fmtDate: (iso: string) => string,
): string | null {
  const parts = [m.place, startDate ? fmtDate(startDate) : null, m.time].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * What is still missing, said as the one thing that has to happen — so the
 * step explains its own trigger instead of sitting there unexplained.
 */
export function meetingGap(m: Meeting, guideFirstName: string): string | null {
  if (m.settled) return null;
  if (m.place && !m.time) return `${guideFirstName} still has to set the time.`;
  if (!m.place && m.time) return `${guideFirstName} still has to set the address.`;
  return `${guideFirstName} sends the address and the time here.`;
}
