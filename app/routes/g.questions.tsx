import { useEffect, useRef, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import type { Route } from "./+types/g.questions";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { notifyQuestionAnswered } from "~/lib/notifications.server";
import { ANSWER_MAX, askedLine, validateAnswer } from "~/lib/questions";

/**
 * The guide's side of the ask-me-anything wall.
 *
 * Two lists, in the order that matters on a phone: the ones waiting on him,
 * then the ones already on his page. Answering is one box and one button —
 * nothing goes live except by his hand, and the answer appears on his public
 * profile the moment he presses it.
 *
 * Written for 360px on a slow connection: each question answers in place
 * without reloading the page, the same as the journal day blocks.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");

  const [{ data: pending }, { data: answered }, { data: guide }] = await Promise.all([
    admin
      .from("guide_questions")
      .select("id, asker_name, asker_country, body, created_at")
      .eq("guide_id", user.id)
      .eq("status", "pending")
      .order("created_at"),
    admin
      .from("guide_questions")
      .select("id, asker_name, asker_country, body, answer, answered_at, helpful_count")
      .eq("guide_id", user.id)
      .eq("status", "answered")
      .order("answered_at", { ascending: false }),
    admin.from("guides").select("slug").eq("user_id", user.id).maybeSingle(),
  ]);

  return data(
    {
      pending: pending ?? [],
      answered: answered ?? [],
      slug: guide?.slug ?? null,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const id = String(form.get("question_id") ?? "");
  const intent = String(form.get("intent"));

  // Scoped by guide_id on every write: a question can only ever be touched by
  // the person it was asked of.
  if (intent === "decline") {
    await admin
      .from("guide_questions")
      .update({ status: "declined" })
      .eq("id", id)
      .eq("guide_id", user.id);
    return data({ ok: "Left unanswered. It stays off your page." }, { headers });
  }

  const answer = String(form.get("answer") ?? "").trim();
  const bad = validateAnswer(answer);
  if (bad) return data({ error: bad }, { status: 400, headers });

  const { error } = await admin
    .from("guide_questions")
    .update({ answer, status: "answered", answered_at: new Date().toISOString() })
    .eq("id", id)
    .eq("guide_id", user.id);
  if (error) return data({ error: "That did not save. Try again." }, { status: 400, headers });

  await notifyQuestionAnswered(env, admin, id);
  return data({ ok: "Answered — it is on your page now." }, { headers });
}

export default function GuideQuestions({ loaderData }: Route.ComponentProps) {
  const { pending, answered, slug } = loaderData as any;
  // Said at page level, not inside the block. The moment an answer saves, the
  // question leaves the waiting list and the block unmounts — so a
  // confirmation living inside it went with it, and the guide saw the question
  // simply vanish.
  const [said, setSaid] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Questions</h1>
        <p className="mt-1 max-w-[46ch] text-sm text-ink-soft">
          People planning a trek ask here. What you write goes on your profile
          under your name, so the next person reads it too.
        </p>
        {slug && (
          <Link
            to={`/guides/${slug}#ask`}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            See your page →
          </Link>
        )}
      </div>

      {said && (
        <p
          className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          aria-live="polite"
        >
          {said}
        </p>
      )}

      <section>
        <h2 className="font-display text-xl text-ink">
          Waiting on you{" "}
          {pending.length > 0 && <span className="font-mono text-ember">({pending.length})</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing waiting. New questions land here and we text you.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {pending.map((q: any) => (
              <PendingQuestion key={q.id} q={q} onDone={setSaid} />
            ))}
          </ul>
        )}
      </section>

      {answered.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-ink">
            On your page <span className="font-mono text-muted">({answered.length})</span>
          </h2>
          <ul className="mt-3 space-y-4">
            {answered.map((q: any) => (
              <li key={q.id} className="rounded-md border border-line bg-card p-4">
                <p className="font-medium text-ink">{q.body}</p>
                <p className="mt-1.5 whitespace-pre-line text-sm text-ink-soft">{q.answer}</p>
                {q.helpful_count > 0 && (
                  <p className="mt-2 text-caption text-muted">
                    <span className="font-mono">{q.helpful_count}</span> people found this useful
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One waiting question, answered without leaving the page. */
function PendingQuestion({ q, onDone }: { q: any; onDone: (msg: string) => void }) {
  const fetcher = useFetcher<{ ok?: string; error?: string }>();
  const busy = fetcher.state !== "idle";
  const said = useRef<unknown>(null);
  useEffect(() => {
    if (!fetcher.data?.ok || fetcher.data === said.current) return;
    said.current = fetcher.data;
    onDone(fetcher.data.ok);
  }, [fetcher.data, onDone]);
  return (
    <li className="rounded-md border border-line bg-card p-4">
      <p className="font-medium text-ink">{q.body}</p>
      <p className="mt-1 text-caption text-muted">
        {askedLine({
          asker_first_name: String(q.asker_name ?? "").split(" ")[0],
          asker_country: q.asker_country,
          created_at: q.created_at,
        })}
      </p>
      <fetcher.Form method="post" className="mt-3">
        <input type="hidden" name="question_id" value={q.id} />
        <textarea
          name="answer"
          rows={4}
          maxLength={ANSWER_MAX}
          placeholder="Answer the way you would say it out loud."
          className="w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss"
        />
        {fetcher.data?.error && (
          <p className="mt-2 rounded bg-ember/10 px-3 py-2 text-sm text-ember" role="alert">
            {fetcher.data.error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" name="intent" value="answer" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Answer"}
          </Button>
          <button
            name="intent"
            value="decline"
            disabled={busy}
            className="text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
          >
            Skip this one
          </button>
        </div>
      </fetcher.Form>
    </li>
  );
}
