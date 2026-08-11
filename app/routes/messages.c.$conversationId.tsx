import { Link, data, redirect, useFetcher } from "react-router";
import { useEffect, useRef } from "react";
import type { Route } from "./+types/messages.c.$conversationId";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { maskMessage } from "~/lib/mask";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";

export function meta() {
  return [{ title: "Message your guide" }, { name: "robots", content: "noindex" }];
}

async function loadConversation(request: Request, env: Env, conversationId: string) {
  const { user, headers } = await getSessionUser(request, env);
  if (!user) throw redirect(`/login?next=/messages/c/${conversationId}`, { headers });
  const admin = createAdminClient(env);
  const { data: c } = await admin
    .from("conversations")
    .select(
      "id, trekker_id, guide_id, offering_id, trekker:users!conversations_trekker_id_fkey(full_name), guide:users!conversations_guide_id_fkey(full_name), offering:offerings(title, slug, kind)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!c || (c.trekker_id !== user.id && c.guide_id !== user.id)) {
    throw new Response("Not found", { status: 404 });
  }
  return { user, admin, convo: c, headers, isGuide: c.guide_id === user.id };
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, convo, headers, isGuide } = await loadConversation(
    request,
    env,
    params.conversationId,
  );
  // Opening the thread marks it read (inbox unread counts).
  await admin
    .from("thread_reads")
    .upsert({ user_id: user.id, thread_key: `c:${convo.id}`, last_read_at: new Date().toISOString() });
  const [{ data: messages }, { data: guideRow }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, body_rendered, created_at")
      .eq("conversation_id", convo.id)
      .order("created_at"),
    admin
      .from("guides")
      .select("slug, median_response_mins")
      .eq("user_id", convo.guide_id)
      .maybeSingle(),
  ]);

  const g: any = convo;
  const mins = guideRow?.median_response_mins as number | null;
  const respondsIn = mins
    ? mins < 60
      ? `~${mins} min`
      : `~${Math.round(mins / 60)} hour${Math.round(mins / 60) > 1 ? "s" : ""}`
    : null;
  const bookPath =
    g.offering?.slug &&
    (g.offering.kind === "trek" ? `/treks/${g.offering.slug}` : `/experiences/${g.offering.slug}`);

  return data(
    {
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        mine: m.sender_id === user.id,
        text: m.body_rendered, // always masked pre-booking
        at: m.created_at,
      })),
      other: isGuide ? g.trekker?.full_name : g.guide?.full_name,
      subtitle: g.offering?.title ?? "Trekking in Nepal",
      respondsIn,
      bookPath: isGuide ? null : bookPath || (guideRow?.slug ? `/guides/${guideRow.slug}` : null),
      convoId: convo.id,
      isGuide,
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, convo, headers } = await loadConversation(request, env, params.conversationId);
  const form = await request.formData();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return data({ ok: false }, { headers });

  // Pre-booking: contact info is always masked; bypass attempts flag to ops.
  const { rendered, flaggedReason } = maskMessage(body);
  const { error: insertErr } = await admin.from("messages").insert({
    conversation_id: convo.id,
    sender_id: user.id,
    body,
    body_rendered: rendered,
    flagged_reason: flaggedReason,
  });
  if (insertErr) {
    return data({ ok: false, error: "Message didn't send — try again." }, { status: 500, headers });
  }
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", convo.id);
  // Tell the other party (SMS for guides, email for trekkers).
  const otherId = convo.guide_id === user.id ? convo.trekker_id : convo.guide_id;
  const { data: me } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const { notifyNewMessage } = await import("~/lib/notifications.server");
  await notifyNewMessage(env, admin, {
    toUserId: otherId,
    fromName: me?.full_name ?? "Someone",
    threadPath: `/messages/c/${convo.id}`,
  });
  return data({ ok: true }, { headers });
}

export default function Conversation({ loaderData }: Route.ComponentProps) {
  const { messages, other, subtitle, respondsIn, bookPath, isGuide } = loaderData as any;
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Clear the box after a successful send; keep the text on failure.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) formRef.current?.reset();
  }, [fetcher.state, fetcher.data]);
  // Always land on the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <Link to={isGuide ? "/g" : "/messages"} className="text-sm text-primary">
        ← {isGuide ? "Dashboard" : "Messages"}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl text-ink">{other}</h1>
          <p className="text-sm text-ink-soft">{subtitle}</p>
        </div>
        {bookPath && (
          <Link
            to={bookPath}
            className="shrink-0 rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white"
          >
            Request to book
          </Link>
        )}
      </div>
      {respondsIn && (
        <p className="mt-1 text-xs text-muted">
          Usually replies in <span className="font-mono">{respondsIn}</span>
        </p>
      )}
      <p className="mt-2 rounded-button bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Chat freely — no charge to message. Phone numbers and emails are hidden until you book.
      </p>

      <div className="mt-4 flex-1 space-y-2">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-soft">
            Say hello — ask about the route, timing, fitness, anything.
          </p>
        )}
        {messages.map((m: any) => (
          <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
            <p
              className={cn(
                "max-w-[80%] rounded-card px-3 py-2 text-sm",
                m.mine ? "bg-primary text-white" : "bg-card text-ink shadow-card",
              )}
            >
              {m.text}
            </p>
            <time dateTime={m.at} suppressHydrationWarning className="mt-0.5 px-1 font-mono text-[10px] text-muted">
              {new Date(m.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </time>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {fetcher.data && !fetcher.data.ok && (fetcher.data as any).error && (
        <p className="mt-2 rounded-button bg-ember/10 px-3 py-2 text-sm text-ember">
          {(fetcher.data as any).error}
        </p>
      )}
      <fetcher.Form ref={formRef} method="post" className="sticky bottom-0 mt-4 flex gap-2 bg-surface py-2">
        <input
          name="body"
          placeholder="Message…"
          className="flex-1 rounded-button border border-border px-3 py-2"
          autoComplete="off"
        />
        <Button type="submit" loading={fetcher.state !== "idle"}>Send</Button>
      </fetcher.Form>
    </main>
  );
}
