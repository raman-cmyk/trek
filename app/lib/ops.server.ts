/**
 * The two things every ops page does, done once and done safely.
 *
 * Ops pages are the cheapest screens on this platform to write and the most
 * expensive to get wrong, because the person using one cannot tell the
 * difference between "there is nothing to show" and "the query failed". This
 * platform has now shipped that bug three times:
 *
 *   /ops/users     said "0 accounts" on a live site with 71 of them.
 *   /ops/pipeline  showed an empty pipeline with live treks in it.
 *   a live trek    opened as a 404.
 *
 * All three were the same line of code — `const { data } = await admin...` —
 * which throws the error away and hands back undefined. And on the write
 * side, `await admin.from(x).update(y)` returns a rejected result rather than
 * throwing, so a failed save is indistinguishable from a successful one: the
 * page reloads, the value is unchanged, and the ops person tries again.
 *
 * So: these helpers, and a guard test that keeps new pages using them.
 * Nothing here is clever. The point is that the correct version is now the
 * shorter one to type.
 */

/** What a PostgREST call hands back. Narrow on purpose. */
interface PgResult<T> {
  data: T | null;
  error: { message: string; code?: string; details?: string | null } | null;
}

export interface Rows<T> {
  rows: T[];
  /** A sentence to put on the page. Null when it worked. */
  error: string | null;
}

/**
 * Read a list, and keep the reason if it failed.
 *
 * `what` is how the failure will read to whoever is standing in front of the
 * screen — "the bookings", "this guide's documents" — so write it as the
 * thing, not as the table.
 */
export async function rows<T>(query: PromiseLike<PgResult<T[]>>, what: string): Promise<Rows<T>> {
  const { data, error } = await query;
  if (error) return { rows: [], error: failureSentence(what, error) };
  return { rows: data ?? [], error: null };
}

export interface One<T> {
  row: T | null;
  error: string | null;
}

/** Read a single row. A missing row is not an error; a failed query is. */
export async function one<T>(query: PromiseLike<PgResult<T>>, what: string): Promise<One<T>> {
  const { data, error } = await query;
  if (error) return { row: null, error: failureSentence(what, error) };
  return { row: data ?? null, error: null };
}

export interface Written {
  ok: boolean;
  error: string | null;
}

/**
 * Write, and say so if it did not happen.
 *
 * Returns rather than throws, because an ops action usually does two or three
 * things and the page wants to report which one failed — not vanish into an
 * error boundary that says "Unexpected Server Error".
 */
export async function write(query: PromiseLike<PgResult<unknown>>, what: string): Promise<Written> {
  const { error } = await query;
  if (error) return { ok: false, error: failureSentence(what, error) };
  return { ok: true, error: null };
}

/**
 * Run several writes and stop at the first failure.
 *
 * An ops action that half-applied is worse than one that did not apply: the
 * screen shows a state nobody chose. This does not give you a transaction —
 * only Postgres can — but it does stop the second write when the first has
 * already failed, and it names which one.
 */
export async function writeAll(
  steps: { query: PromiseLike<PgResult<unknown>>; what: string }[],
): Promise<Written> {
  for (const step of steps) {
    const out = await write(step.query, step.what);
    if (!out.ok) return out;
  }
  return { ok: true, error: null };
}

/**
 * The sentence an ops person reads when something breaks.
 *
 * Their own language first, then the database's, because the first tells them
 * whether to worry and the second is what they will paste to whoever fixes
 * it. PostgREST's own messages are famously unhelpful on their own —
 * "Could not embed because more than one relationship was found" is the
 * embed-ambiguity bug, and it reads like nonsense without the context of
 * which screen asked for what.
 */
export function failureSentence(
  what: string,
  error: { message: string; code?: string; details?: string | null },
): string {
  const hint = knownCause(error);
  return [
    `Couldn't load ${what}.`,
    hint,
    `(${error.code ? `${error.code}: ` : ""}${error.message})`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Translate the handful of failures this codebase actually hits.
 *
 * Deliberately short. A long list of guesses is worse than none — it teaches
 * the reader that the hint is usually wrong.
 */
export function knownCause(error: {
  message: string;
  code?: string;
  details?: string | null;
}): string | null {
  const m = `${error.message} ${error.details ?? ""}`.toLowerCase();
  if (m.includes("more than one relationship")) {
    return "Two columns point at the same table, so the join has to name which one — see the embed note in docs/OPS-PAGES.md.";
  }
  if (error.code === "42501" || m.includes("row-level security")) {
    return "Row-level security refused this. The page is probably using the signed-in client where it needs the admin one.";
  }
  if (error.code === "42703" || m.includes("does not exist")) {
    return "A column or table in the query isn't in the database — usually a migration that hasn't been applied.";
  }
  if (error.code === "23505") return "Something with this value already exists.";
  if (error.code === "23503") return "It points at a row that isn't there.";
  if (error.code === "23514") return "The database rejected the value as out of range or not allowed.";
  return null;
}
