import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/Button";
import {
  QUESTION_MAX,
  STARTER_QUESTIONS,
  askedLine,
  sortWall,
  type PublicQuestion,
} from "~/lib/questions";
import { cn } from "~/lib/cn";

/**
 * Ask me anything — the public Q&A on a guide's profile.
 *
 * Built as headings and paragraphs, not as an accordion. Every question is an
 * <h3> with the answer in the paragraph immediately under it, all of it in the
 * page on first render: the whole value of this section is that a search
 * engine, an assistant, and a person reading with JavaScript off all get the
 * same thing. Collapsing the answers behind a tap would hide the only content
 * on the profile written in sentences somebody actually searched for.
 *
 * Nothing here is a negation and nothing is a claim — it is a named guide's
 * own words answering a question a named trekker actually asked, which is a
 * harder thing to fake than any badge on the page.
 */
export function QuestionWall({
  guideName,
  guideFirstName,
  questions,
  canAsk,
  askerName,
  /** How many are shown before "show the rest". */
  initial = 6,
}: {
  guideName: string;
  guideFirstName: string;
  questions: PublicQuestion[];
  /** False while the guide is looking at their own profile. */
  canAsk: boolean;
  /** Prefills the name field for a signed-in reader. */
  askerName?: string | null;
  initial?: number;
}) {
  const sorted = sortWall(questions);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? sorted : sorted.slice(0, initial);
  const hidden = sorted.length - shown.length;

  // An empty wall used to render at full size — a big "Ask X anything"
  // heading, starter chips, a two-field form — over nothing at all. On the
  // forty profiles with no questions yet that read as clutter, not as an
  // invitation. Empty now means one quiet line that opens into the form;
  // the wall earns its heading with its first answered question.
  if (sorted.length === 0) {
    if (!canAsk) return null;
    return (
      <section id="ask" className="scroll-mt-20">
        <details className="group rounded-md border border-line bg-card p-4">
          <summary className="cursor-pointer text-[15px] text-ink">
            Have a question for {guideFirstName}?{" "}
            <span className="text-moss underline underline-offset-4">Ask it here</span>
            <span className="block text-caption text-muted">
              The answer is published on this page, in {guideFirstName}&rsquo;s own
              words, for the next person planning the same trek.
            </span>
          </summary>
          <AskBox guideFirstName={guideFirstName} askerName={askerName} empty />
        </details>
      </section>
    );
  }

  return (
    <section id="ask" className="scroll-mt-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* A question-shaped heading with the subject in it — the phrase a
            person types, rather than "FAQ". */}
        <h2 className="font-display text-2xl text-ink sm:text-3xl">
          Ask {guideFirstName} anything
        </h2>
        <p className="text-sm text-muted">
          <span className="font-mono text-ink">{sorted.length}</span>{" "}
          {sorted.length === 1 ? "question" : "questions"} answered
        </p>
      </div>

      <ul className="mt-5 divide-y divide-line border-y border-line">
        {shown.map((q) => (
          <li key={q.id} className="py-5">
            <h3 className="text-[17px] font-medium leading-snug text-ink">{q.body}</h3>
            <p className="mt-1 text-caption text-muted">{askedLine(q)}</p>
            {/* The answer first line, unwrapped. This is the paragraph an
                assistant lifts when somebody asks it the same thing. */}
            <p className="mt-2.5 whitespace-pre-line text-[15px] leading-relaxed text-ink">
              {q.answer}
            </p>
            <p className="mt-2 text-caption text-muted">
              — {guideName}
              {q.helpful_count > 0 && (
                <span className="ml-2">
                  <span className="font-mono">{q.helpful_count}</span> found this useful
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 text-sm text-moss underline underline-offset-4 hover:text-pine"
        >
          Read the other <span className="font-mono">{hidden}</span> →
        </button>
      )}

      {canAsk && <AskBox guideFirstName={guideFirstName} askerName={askerName} empty={false} />}
    </section>
  );
}

/**
 * The ask form.
 *
 * Two fields and a button. The starter questions exist because an empty
 * textarea on a stranger's profile is a wall — one tap fills it with a real
 * question the reader can then edit, which is how the first question on a new
 * guide's profile ever gets asked.
 */
function AskBox({
  guideFirstName,
  askerName,
  empty,
}: {
  guideFirstName: string;
  askerName?: string | null;
  empty: boolean;
}) {
  const fetcher = useFetcher<{ error?: string; ok?: string }>();
  const [body, setBody] = useState("");
  const sent = fetcher.data?.ok;
  const busy = fetcher.state !== "idle";
  const left = QUESTION_MAX - body.length;

  if (sent) {
    return (
      <div className="mt-6 rounded-md border border-line bg-mist p-4">
        <p className="text-[15px] text-ink">{sent}</p>
        <p className="mt-1 text-caption text-muted">
          {guideFirstName} answers between treks, in {guideFirstName}&rsquo;s own
          words. You will get an email when the answer is live on this page.
        </p>
      </div>
    );
  }

  return (
    <fetcher.Form
      method="post"
      className="mt-6 rounded-md border border-line bg-card p-4"
    >
      <input type="hidden" name="intent" value="ask" />
      {/* Bots fill everything. A human never sees this. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 opacity-0"
      />

      <label className="block">
        <span className="text-sm text-ink-soft">
          {empty ? `Ask ${guideFirstName} the first question` : `Ask ${guideFirstName} something`}
        </span>
        <textarea
          name="body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={QUESTION_MAX}
          placeholder="I am 58 and not fast. Is this trek realistic for me?"
          className="mt-1.5 w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss"
          required
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {STARTER_QUESTIONS.slice(0, empty ? 5 : 3).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setBody(s)}
            className={cn(
              "rounded-full border border-line px-3 py-1 text-left text-caption text-ink-soft",
              "transition-colors duration-quick hover:border-moss hover:text-ink",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-ink-soft">Your first name</span>
          <input
            name="name"
            defaultValue={askerName ?? ""}
            maxLength={40}
            className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Email, so we can tell you the answer</span>
          <input
            type="email"
            name="email"
            className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss"
            required
          />
        </label>
      </div>

      {fetcher.data?.error && (
        <p className="mt-3 rounded bg-ember/10 px-3 py-2 text-sm text-ember" role="alert">
          {fetcher.data.error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Sending…" : "Ask"}
        </Button>
        <span className="text-caption text-muted">
          {left < 120 && <span className="font-mono">{left} left · </span>}
          Your first name shows with the answer. Your email stays private.
        </span>
      </div>
    </fetcher.Form>
  );
}
