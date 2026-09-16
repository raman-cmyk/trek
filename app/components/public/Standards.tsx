import { Link } from "react-router";
import { FEAR, standards, verificationChecks } from "~/lib/standards";
import { cn } from "~/lib/cn";

/**
 * The fear, in the first screenful.
 *
 * Everything else on this homepage argues that the guides are good. Nothing
 * on it answered the question a trekker is actually holding, so this does —
 * by saying the fear out loud in their own words and then answering it with
 * six things that are true and checkable, each linking to the page that
 * proves it.
 *
 * Six panels rather than three, because the standards ARE the argument here
 * and thinning them to fit a nicer grid would be choosing the layout over
 * the point. Plain list markup underneath: this is the paragraph somebody
 * reads before deciding to trust us with a deposit, and it has to survive
 * with no CSS.
 */
export function Standards({ className }: { className?: string }) {
  const checks = verificationChecks();
  return (
    <section
      className={cn("bg-pine py-16 text-paper", className)}
      aria-labelledby="standards-head"
    >
      <div className="mx-auto max-w-6xl px-4">
        <h2 id="standards-head" className="max-w-[24ch] font-display text-3xl leading-[1.1] sm:text-4xl">
          {FEAR.question}
        </h2>
        <p className="mt-3 max-w-[48ch] text-lg text-sage">{FEAR.answer}</p>

        <ol className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {standards().map((s, i) => (
            <li key={s.key}>
              <Link to={s.href} prefetch="intent" className="group block">
                <p className="font-mono text-caption text-fern">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-1.5 font-display text-lg leading-snug text-paper group-hover:text-fern">
                  {s.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-sage">{s.detail}</p>
              </Link>
            </li>
          ))}
        </ol>

        {/* The checks, named. "Verified" is a word; this is the list. */}
        <div className="mt-12 border-t border-fern/25 pt-6">
          <p className="label text-sage/70">What every guide is checked for</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {checks.map((c) => (
              <li
                key={c}
                className="rounded-pill border border-fern/30 px-3 py-1 text-caption text-sage"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * The smallest safe next step.
 *
 * Every other call to action on this page asks for a decision — pick a guide,
 * pick a trek, pick a date. The honest next step for somebody who has just
 * read the standards and is still deciding is smaller than any of those: ask
 * a question and see who answers. It costs nothing, it commits nothing, and
 * it is the only action on the page that a nervous first-timer will take.
 */
export function SmallestStep({ className }: { className?: string }) {
  return (
    <section className={cn("mx-auto max-w-6xl px-4 py-16", className)}>
      <div className="rounded-photo border border-line bg-mist px-6 py-10 sm:px-10">
        <h2 className="max-w-[22ch] font-display text-2xl leading-tight text-ink sm:text-3xl">
          Not ready to book? Ask a guide a question.
        </h2>
        <p className="mt-3 max-w-[54ch] text-muted">
          It is free, there is no card, and you are talking to the person who
          would actually walk with you — not a sales desk. Most people start
          here.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/guides"
            prefetch="intent"
            className="rounded bg-pine px-5 py-3 font-medium text-paper transition-colors duration-instant hover:bg-moss"
          >
            Find your guide →
          </Link>
          <Link
            to="/match"
            prefetch="intent"
            className="rounded border border-moss px-5 py-3 font-medium text-moss transition-colors duration-instant hover:bg-card"
          >
            Help me choose
          </Link>
        </div>
      </div>
    </section>
  );
}
