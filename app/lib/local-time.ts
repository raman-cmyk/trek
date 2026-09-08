/**
 * What time it is where the other person is.
 *
 * A trekker in Denver writes at two in the afternoon; it is quarter to two in
 * the morning in Solukhumbu. The guide is asleep. Eleven hours later the
 * trekker has read the silence as a refusal and booked with an agency. Nothing
 * was wrong except that neither of them could see the other's clock.
 *
 * Nepal needs no lookup: UTC+05:45, all year, no daylight saving — one of the
 * few countries with a quarter-hour offset, and the reason a hard-coded
 * "+5:30" would be twelve minutes wrong forever. The other side comes from the
 * browser's own IANA zone (0068).
 */

/** Nepal Time, in minutes east of UTC. Fixed; there is no summer time. */
export const NEPAL_OFFSET_MINUTES = 5 * 60 + 45;

export interface Clock {
  /** "2:10am" */
  label: string;
  /** 0–23 in that place. */
  hour: number;
  /** Would a normal person be asleep? */
  asleep: boolean;
  /** Same calendar day as the reader's, or not. */
  dayOffset: -1 | 0 | 1;
}

const HHMM = (h: number, m: number) => {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:${String(m).padStart(2, "0")}${suffix}`;
};

/** Nobody is answering messages between these hours, and that is not rudeness. */
export function isAsleep(hour: number): boolean {
  return hour >= 22 || hour < 6;
}

/** The clock in Nepal right now. */
export function nepalClock(now: Date = new Date()): Clock {
  const shifted = new Date(now.getTime() + NEPAL_OFFSET_MINUTES * 60_000);
  const hour = shifted.getUTCHours();
  return {
    label: HHMM(hour, shifted.getUTCMinutes()),
    hour,
    asleep: isAsleep(hour),
    dayOffset: dayDelta(now, shifted.getTime(), 0),
  };
}

/**
 * The clock in an IANA zone, or null when we do not know theirs.
 *
 * `Intl` does the work, including whatever daylight-saving rule that place is
 * living under this month — which is exactly the part nobody should be doing
 * by hand.
 */
export function clockIn(timeZone: string | null | undefined, now: Date = new Date()): Clock | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      day: "numeric",
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const hour = get("hour") % 24;
    const minute = get("minute");
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return {
      label: HHMM(hour, minute),
      hour,
      asleep: isAsleep(hour),
      dayOffset: dayDelta(now, now.getTime(), get("day") - now.getUTCDate()),
    };
  } catch {
    // An unknown or malformed zone is not worth an error page.
    return null;
  }
}

function dayDelta(now: Date, shiftedMs: number, explicit: number): -1 | 0 | 1 {
  const d = explicit || Math.sign(
    Math.floor(shiftedMs / 86_400_000) - Math.floor(now.getTime() / 86_400_000),
  );
  return (d > 0 ? 1 : d < 0 ? -1 : 0) as -1 | 0 | 1;
}

/**
 * The line under a message box: their clock, and when to expect an answer.
 *
 * Written so that silence reads as a time zone rather than a refusal, which is
 * the whole point. It never promises on the guide's behalf — "usually replies
 * within about three hours" is their own measured median, and where there is
 * no median yet it says what the platform asks of them instead.
 */
export function awayNote(args: {
  /** Their first name, for a sentence rather than a label. */
  name: string;
  clock: Clock | null;
  /** Their measured median reply time, in minutes. */
  medianReplyMins?: number | null;
  /** True when the person reading this is the trekker. */
  theyAreTheGuide: boolean;
}): string | null {
  const { name, clock, medianReplyMins, theyAreTheGuide } = args;
  if (!clock) return null;

  const who = name || (theyAreTheGuide ? "your guide" : "they");
  const when = clock.asleep
    ? `It is ${clock.label} where ${who} is — the middle of the night.`
    : `It is ${clock.label} where ${who} is.`;

  if (clock.asleep) {
    return theyAreTheGuide
      ? `${when} Write anyway; guides answer in the morning, Nepal time.`
      : `${when} They will see this when they wake up.`;
  }
  if (medianReplyMins && medianReplyMins > 0) {
    return `${when} ${cap(who)} usually replies within ${humanMins(medianReplyMins)}.`;
  }
  return theyAreTheGuide
    ? `${when} Guides here answer within a day, and most within a few hours.`
    : when;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "about 3 hours", "40 minutes" — never "173 minutes". */
export function humanMins(mins: number): string {
  if (mins < 90) return `${Math.max(1, Math.round(mins / 5) * 5)} minutes`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `about ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `about ${days} day${days === 1 ? "" : "s"}`;
}
