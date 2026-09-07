/**
 * Who gets emailed about a group message, and what the email says.
 *
 * The pure half of group notifications, kept out of the server module so the
 * two rules that decide whether somebody's evening gets interrupted are
 * testable: never mail the person who just typed, and never mail the same
 * person twice in a burst. A group of six people agreeing on a date sends
 * fifteen messages in four minutes; without a window that is fifteen emails
 * each, and the next thing everybody does is mute the trip forever.
 */

/** How long after mailing somebody about a group we leave them alone. */
export const BURST_WINDOW_MINS = 30;

/** How many lines of the conversation an email carries before it says "more". */
export const DIGEST_LINES = 5;

export interface NotifyMember {
  user_id: string | null;
  status: string;
}

export interface DigestMessage {
  author_id: string;
  author_name: string;
  body: string;
  kind: string;
  created_at: string;
}

/**
 * Everyone in the room except the person who just spoke and anyone who has
 * muted it. The guide is in the room without being on the roster (0056), so
 * they are added separately or they never hear a thing.
 */
export function recipientsFor(args: {
  members: NotifyMember[];
  guideId: string | null;
  authorId: string;
  mutedUserIds: string[];
}): string[] {
  const muted = new Set(args.mutedUserIds);
  const ids = new Set<string>();
  for (const m of args.members) {
    if (!m.user_id) continue; // invited by email, no account yet
    if (m.status !== "joined" && m.status !== "invited") continue;
    ids.add(m.user_id);
  }
  if (args.guideId) ids.add(args.guideId);
  ids.delete(args.authorId);
  for (const id of muted) ids.delete(id);
  return [...ids];
}

/** Have we mailed this person about this group too recently to do it again? */
export function withinBurstWindow(
  lastEmailAt: string | null | undefined,
  now: Date,
  windowMins = BURST_WINDOW_MINS,
): boolean {
  if (!lastEmailAt) return false;
  const last = new Date(lastEmailAt).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last < windowMins * 60_000;
}

/**
 * The point in the conversation this person has already accounted for: the
 * later of when they last read the thread and when we last emailed them
 * about it. Emailing someone lines they have already read is how a
 * notification stops being read at all.
 */
export function catchUpSince(
  lastReadAt: string | null | undefined,
  lastEmailAt: string | null | undefined,
): string | null {
  const candidates = [lastReadAt, lastEmailAt].filter(Boolean) as string[];
  if (!candidates.length) return null;
  return candidates.sort()[candidates.length - 1];
}

/**
 * What this person has missed: their own lines never count, and system lines
 * ("Marie joined") are not worth an email on their own — but they belong in
 * one that a real message has already earned.
 */
export function digestFor(args: {
  messages: DigestMessage[];
  recipientId: string;
  since: string | null;
  limit?: number;
}): { lines: { who: string; text: string }[]; more: number; hasRealMessage: boolean } {
  const limit = args.limit ?? DIGEST_LINES;
  const missed = args.messages
    .filter((m) => m.author_id !== args.recipientId)
    .filter((m) => !args.since || m.created_at > args.since)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const hasRealMessage = missed.some((m) => m.kind !== "system");
  // Show the newest, not the oldest: if fifteen things were said, the last
  // five are the ones that tell you what is going on now.
  const shown = missed.slice(Math.max(0, missed.length - limit));
  return {
    lines: shown.map((m) => ({
      who: m.kind === "system" ? "" : m.author_name,
      text: m.body,
    })),
    more: missed.length - shown.length,
    hasRealMessage,
  };
}

/** One line of the chat, as it reads in an email. */
export function quoteLine(line: { who: string; text: string }, max = 300): string {
  const text = line.text.length > max ? line.text.slice(0, max - 1).trimEnd() + "…" : line.text;
  return line.who ? `${line.who}: ${text}` : text;
}
