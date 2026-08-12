/**
 * The ask-me-anything wall.
 *
 * Rules live here rather than in the route so the same checks run on the
 * public profile form, in the guide's answer screen, and in the tests.
 */

export interface PublicQuestion {
  id: string;
  guide_id: string;
  guide_slug: string;
  guide_name: string;
  asker_first_name: string;
  asker_country: string | null;
  body: string;
  answer: string;
  answered_at: string;
  helpful_count: number;
  created_at: string;
}

export const QUESTION_MIN = 10;
export const QUESTION_MAX = 600;
export const ANSWER_MAX = 2000;

/**
 * Is this a question, or is it a message?
 *
 * The wall only works if what lands on it is useful to the next reader. Two
 * things ruin that: a private enquiry with somebody's dates in it ("we land
 * on the 14th, can you take us"), which belongs in a message thread and will
 * be stale in a week; and contact details, which are how a marketplace gets
 * disintermediated. Both are refused with a sentence saying where to go
 * instead, not with a red "invalid".
 */
export function validateQuestion(input: {
  body?: string;
  name?: string;
}): string | null {
  const body = (input.body ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!name) return "Add your first name so the answer can be addressed to you.";
  if (name.length > 40) return "That name is too long — a first name is enough.";
  if (body.length < QUESTION_MIN) {
    return "Ask a bit more — one full sentence gets a better answer.";
  }
  if (body.length > QUESTION_MAX) {
    return `Keep it to ${QUESTION_MAX} characters. For anything longer, message the guide directly.`;
  }
  if (hasContactDetails(body)) {
    return "Leave out phone numbers and email addresses — this answer is public, and you can message the guide privately once you have booked.";
  }
  return null;
}

/** An email address, a phone number, or a handle somebody can be reached on. */
export function hasContactDetails(text: string): boolean {
  const t = text.toLowerCase();
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/.test(t)) return true;
  // Seven or more digits, however they are spaced — a phone number in any
  // format anybody actually writes one in.
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length >= 9 && /[\d][\s\-().]*[\d][\s\-().]*[\d]/.test(t)) return true;
  if (/\b(whatsapp|wechat|telegram|viber|instagram|messenger)\b/.test(t)) return true;
  // A handle. Kept out of the \b group above: there is no word boundary
  // before "@" when a space precedes it, so the alternation never fired.
  // "signal" is deliberately absent — "there is no signal above Namche" is a
  // sentence a trekker writes.
  if (/(^|\s)@[a-z0-9._]{3,}/.test(t)) return true;
  return false;
}

export function validateAnswer(answer: string): string | null {
  const a = answer.trim();
  if (!a) return "Write an answer, or say you would rather not answer this one.";
  if (a.length > ANSWER_MAX) return `Keep it under ${ANSWER_MAX} characters.`;
  return null;
}

/**
 * The order of the wall.
 *
 * Most-helpful first, because the top of the wall is what a person reads
 * before deciding — but an answered question with no votes yet must not be
 * buried forever, so within the same vote count the newest wins. A brand new
 * answer therefore enters above every other zero-vote answer rather than at
 * the bottom of the page.
 */
export function sortWall<T extends { helpful_count: number; answered_at: string }>(
  qs: T[],
): T[] {
  return [...qs].sort(
    (a, b) =>
      b.helpful_count - a.helpful_count ||
      Date.parse(b.answered_at) - Date.parse(a.answered_at),
  );
}

/**
 * The line under the question: "Marta, PL · asked in June".
 *
 * A month, not a date. "12 June 2026" makes an answer look like it expires;
 * a month reads as recent for long enough to be worth writing, which is the
 * honest way round for advice about a mountain that has not changed.
 */
export function askedLine(q: {
  asker_first_name: string;
  asker_country: string | null;
  created_at: string;
}): string {
  const who = q.asker_country
    ? `${q.asker_first_name}, ${q.asker_country}`
    : q.asker_first_name;
  const when = new Date(q.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${who} · asked ${when}`;
}

/**
 * Questions a guide can be asked before anybody has asked one.
 *
 * An empty wall is worse than no wall: it reads as "nobody cares about this
 * guide". These are the questions trekkers actually open a message thread
 * with, offered as one tap so the first question on a new profile costs
 * somebody four seconds instead of a paragraph.
 */
export const STARTER_QUESTIONS = [
  "What is the hardest day on this trek, and what makes it hard?",
  "I am not a strong walker. Is this realistic for me?",
  "What do you carry for altitude sickness, and when do you turn a group around?",
  "How many times have you walked this route?",
  "What is one thing people always pack that they do not need?",
] as const;
