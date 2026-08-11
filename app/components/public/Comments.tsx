import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { cn } from "~/lib/cn";

export interface PublicComment {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  author_is_guide: boolean;
  author_guide_slug: string | null;
}

/**
 * The comment section under a journal.
 *
 * Two levels only — a comment and its replies. A trekking story does not need
 * an infinite tree; what it needs is for "did you need crampons?" to be
 * answerable by the man who was there, visibly, in place. The guide's replies
 * carry a badge for exactly that reason.
 *
 * Every write is a plain form POST to the page's own action, so the section
 * works with JavaScript off and a dropped connection loses one comment rather
 * than the thread.
 */
export function Comments({
  comments,
  signedIn,
  guideFirstName,
  loginNext,
  error,
}: {
  comments: PublicComment[];
  signedIn: boolean;
  guideFirstName: string;
  loginNext: string;
  error?: string | null;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const roots = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);

  return (
    <section id="comments" className="mt-16 scroll-mt-24 border-t border-line pt-10">
      <h2 className="font-display text-2xl text-ink">
        {comments.length === 0 ? (
          "Ask about this trek"
        ) : (
          <>
            <span className="font-mono">{comments.length}</span>{" "}
            {comments.length === 1 ? "comment" : "comments"}
          </>
        )}
      </h2>
      <p className="mt-1 max-w-[58ch] text-sm text-muted">
        {guideFirstName} reads these. Ask what the teahouses were like, what it
        cost, whether you could do it — he answers here where everyone can see.
      </p>

      {error && (
        <p className="mt-4 rounded bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>
      )}

      {signedIn ? (
        <CommentForm placeholder={`Ask ${guideFirstName} something…`} busy={busy} />
      ) : (
        <p className="mt-5 rounded-md border border-line bg-mist px-4 py-3 text-sm text-ink">
          <Link
            to={`/login?next=${encodeURIComponent(loginNext)}`}
            className="font-medium text-moss underline underline-offset-4"
          >
            Sign in
          </Link>{" "}
          to ask a question. It takes a minute and it is free.
        </p>
      )}

      {roots.length > 0 && (
        <ol className="mt-8 space-y-7">
          {roots.map((c) => {
            const replies = repliesOf(c.id);
            return (
              <li key={c.id}>
                <CommentBody comment={c} />
                <div className="mt-2 pl-11">
                  {signedIn && (
                    <button
                      type="button"
                      onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                      className="text-caption font-medium text-moss hover:underline"
                    >
                      {replyTo === c.id ? "Cancel" : "Reply"}
                    </button>
                  )}
                  {replyTo === c.id && (
                    <CommentForm
                      parentId={c.id}
                      placeholder={`Reply to ${c.author_name.split(" ")[0]}…`}
                      busy={busy}
                      compact
                    />
                  )}
                  {replies.length > 0 && (
                    <ol className="mt-4 space-y-5 border-l border-line pl-4">
                      {replies.map((r) => (
                        <li key={r.id}>
                          <CommentBody comment={r} small />
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function CommentForm({
  parentId,
  placeholder,
  busy,
  compact,
}: {
  parentId?: string;
  placeholder: string;
  busy: boolean;
  compact?: boolean;
}) {
  return (
    <Form method="post" replace className={compact ? "mt-3" : "mt-5"}>
      <input type="hidden" name="intent" value="comment" />
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <textarea
        name="body"
        required
        maxLength={2000}
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          disabled={busy}
          className="rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss disabled:opacity-60"
        >
          {busy ? "Posting…" : compact ? "Reply" : "Post"}
        </button>
        <span className="text-caption text-muted">
          Your name and photo show with it.
        </span>
      </div>
    </Form>
  );
}

function CommentBody({ comment: c, small }: { comment: PublicComment; small?: boolean }) {
  const avatar = (
    <SmartImage
      src={c.author_avatar_url ?? ""}
      alt={c.author_name}
      width={small ? 32 : 36}
      height={small ? 32 : 36}
      className={cn("shrink-0 rounded-full", small ? "h-7 w-7" : "h-9 w-9")}
    />
  );
  return (
    <article className="flex gap-2.5">
      {c.author_guide_slug ? (
        <Link to={`/guides/${c.author_guide_slug}`} className="shrink-0">
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-ink">{c.author_name}</span>
          {c.author_is_guide && (
            <span className="rounded-pill bg-chartreuse px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-pine">
              Guide
            </span>
          )}
          <span className="font-mono text-caption text-muted">{onDay(c.created_at)}</span>
        </p>
        <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-ink">
          {c.body}
        </p>
      </div>
    </article>
  );
}

/**
 * An absolute date, not "3 hours ago": relative time computed on the client
 * disagrees with the server's render and React tears the hydration down over
 * it. It also ages badly — a journal read next spring should say when.
 */
function onDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
