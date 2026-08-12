import { useEffect, useRef, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import type { Route } from "./+types/g.reviews";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { Stars } from "~/components/public/bits";
import { fmtDate } from "~/lib/format";

/**
 * Reviews, with the right to reply.
 *
 * The column has existed since the reviews table was born and nothing ever
 * wrote to it — a guide could be reviewed and had no way to answer. The reply
 * matters most on the four-star review with the one complaint in it: a guide
 * who writes back "she is right, the lodge in Dharapani was bad, I use a
 * different one now" turns the worst thing on his page into the most
 * convincing thing on it.
 *
 * One reply, editable, no thread — this is a considered answer to a
 * published review, not a conversation.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");

  const [{ data: reviews }, { data: guide }] = await Promise.all([
    admin
      .from("reviews")
      .select("id, overall, body, published_at, guide_reply, author:users!reviews_author_id_fkey(full_name, country_code)")
      .eq("subject_id", user.id)
      .eq("direction", "trekker_to_guide")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false }),
    admin.from("guides").select("slug").eq("user_id", user.id).maybeSingle(),
  ]);

  return data({ reviews: reviews ?? [], slug: guide?.slug ?? null }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const id = String(form.get("review_id") ?? "");
  const reply = String(form.get("reply") ?? "").trim().slice(0, 1000);

  if (!reply) return data({ error: "Write a reply, or leave it as it is." }, { status: 400, headers });

  // Scoped to the guide the review is about, and only the reply column moves —
  // the review itself is the trekker's and stays exactly as they wrote it.
  const { error } = await admin
    .from("reviews")
    .update({ guide_reply: reply })
    .eq("id", id)
    .eq("subject_id", user.id)
    .eq("direction", "trekker_to_guide")
    .not("published_at", "is", null);
  if (error) return data({ error: "That did not save. Try again." }, { status: 400, headers });

  return data({ ok: "On your page." }, { headers });
}

export default function GuideReviews({ loaderData }: Route.ComponentProps) {
  const { reviews, slug } = loaderData as any;
  const unreplied = reviews.filter((r: any) => !r.guide_reply).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Your reviews</h1>
        <p className="mt-1 max-w-[46ch] text-sm text-ink-soft">
          What clients wrote after walking with you. You can answer each one —
          your reply shows on your page under theirs, with your name.
        </p>
        {slug && (
          <Link to={`/guides/${slug}`} className="mt-2 inline-block text-sm text-primary hover:underline">
            See your page →
          </Link>
        )}
      </div>

      {unreplied > 0 && (
        <p className="rounded-card bg-mist p-3 text-sm text-ink">
          <span className="font-mono">{unreplied}</span>{" "}
          {unreplied === 1 ? "review has" : "reviews have"} no reply yet. A short
          thank-you is enough — a reply shows people you read what they write.
        </p>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Your first review arrives after your first trek ends. We ask every
          client and publish whatever comes back.
        </p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r: any) => (
            <ReviewRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewRow({ r }: { r: any }) {
  const fetcher = useFetcher<{ ok?: string; error?: string }>();
  const busy = fetcher.state !== "idle";
  // Open the box automatically only where there is nothing yet; an existing
  // reply shows as text with a quiet edit affordance.
  const [editing, setEditing] = useState(false);
  const seen = useRef<unknown>(null);
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data !== seen.current) {
      seen.current = fetcher.data;
      setEditing(false);
    }
  }, [fetcher.data]);

  const authorFirst = String(r.author?.full_name ?? "A trekker").split(" ")[0];

  return (
    <li className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Stars value={r.overall} />
        <p className="text-sm text-ink-soft">
          {authorFirst}
          {r.author?.country_code ? `, ${r.author.country_code}` : ""} ·{" "}
          {fmtDate(r.published_at)}
        </p>
      </div>
      {r.body && <p className="mt-2 text-[15px] text-ink">{r.body}</p>}

      {r.guide_reply && !editing ? (
        <div className="mt-3 ml-3 border-l-2 border-sage pl-3">
          <p className="text-sm text-ink">{r.guide_reply}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 text-caption text-muted underline underline-offset-2 hover:text-ink"
          >
            Change your reply
          </button>
        </div>
      ) : (
        <fetcher.Form method="post" className="mt-3">
          <input type="hidden" name="review_id" value={r.id} />
          <textarea
            name="reply"
            rows={2}
            maxLength={1000}
            defaultValue={r.guide_reply ?? ""}
            placeholder={`Answer ${authorFirst} — a thank-you is enough.`}
            className="w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss"
          />
          {fetcher.data?.error && (
            <p className="mt-2 rounded bg-ember/10 px-3 py-2 text-sm text-ember" role="alert">
              {fetcher.data.error}
            </p>
          )}
          <div className="mt-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : "Reply"}
            </Button>
          </div>
        </fetcher.Form>
      )}
    </li>
  );
}
