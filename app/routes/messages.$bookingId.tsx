import { Link, data, redirect, useFetcher } from "react-router";
import { useEffect, useRef } from "react";
import type { Route } from "./+types/messages.$bookingId";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { maskMessage } from "~/lib/mask";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";

export function meta() {
  return [{ title: "Messages" }, { name: "robots", content: "noindex" }];
}

async function loadParticipant(request: Request, env: Env, bookingId: string) {
  const { user, headers } = await getSessionUser(request, env);
  if (!user) throw redirect(`/login?next=/messages/${bookingId}`, { headers });
  const admin = createAdminClient(env);
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, trekker_id, guide_id, offering:offerings(title), trekker:users(full_name), guide:guides(users(full_name))")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || (b.trekker_id !== user.id && b.guide_id !== user.id)) {
    throw new Response("Not found", { status: 404 });
  }
  return { user, admin, booking: b, headers, isGuide: b.guide_id === user.id };
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, booking, headers, isGuide } = await loadParticipant(request, env, params.bookingId);
  // Opening the thread marks it read (inbox unread counts).
  await admin
    .from("thread_reads")
    .upsert({ user_id: user.id, thread_key: `b:${booking.id}`, last_read_at: new Date().toISOString() });
  // Contact info is masked until the deposit is paid (docs/02).
  const preDeposit = booking.status === "pending_deposit";
  const { data: messages } = await admin
    .from("messages")
    .select("id, sender_id, body, body_rendered, created_at")
    .eq("booking_id", booking.id)
    .order("created_at");
  return data(
    {
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        mine: m.sender_id === user.id,
        text: preDeposit ? m.body_rendered : m.body,
        at: m.created_at,
      })),
      title: (booking as any).offering?.title,
      other: isGuide
        ? (booking as any).trekker?.full_name
        : (booking as any).guide?.users?.full_name,
      preDeposit,
      bookingId: booking.id,
      isGuide,
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, booking, headers } = await loadParticipant(request, env, params.bookingId);
  const form = await request.formData();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return data({ ok: false }, { headers });

  const preDeposit = booking.status === "pending_deposit";
  const { rendered, flaggedReason } = maskMessage(body);
  const { error: insertErr } = await admin.from("messages").insert({
    booking_id: booking.id,
    sender_id: user.id,
    body,
    // Pre-deposit, everyone sees the masked version; post-deposit, the original.
    body_rendered: preDeposit ? rendered : body,
    flagged_reason: flaggedReason, // → ops moderation queue
  });
  if (insertErr) {
    return data({ ok: false, error: "Message didn't send — try again." }, { status: 500, headers });
  }
  // Tell the other party (SMS for guides, email for trekkers).
  const otherId = booking.guide_id === user.id ? booking.trekker_id : booking.guide_id;
  const { data: me } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const { notifyNewMessage } = await import("~/lib/notifications.server");
  await notifyNewMessage(env, admin, {
    toUserId: otherId,
    fromName: me?.full_name ?? "Someone",
    threadPath: `/messages/${booking.id}`,
  });
  return data({ ok: true }, { headers });
}

export default function Messages({ loaderData }: Route.ComponentProps) {
  const { messages, title, other, preDeposit, bookingId, isGuide } = loaderData as any;
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) formRef.current?.reset();
  }, [fetcher.state, fetcher.data]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link to={isGuide ? "/g/bookings" : "/messages"} className="text-sm text-primary">
          ← {isGuide ? "Trips" : "Messages"}
        </Link>
        <Link
          to={isGuide ? `/g/bookings` : `/trips/${bookingId}`}
          className="rounded-button border border-border px-3 py-1.5 text-sm font-medium text-primary"
        >
          {isGuide ? "Booking details" : "View trip"}
        </Link>
      </div>
      <h1 className="mt-2 font-display text-xl text-ink">{other}</h1>
      <p className="text-sm text-ink-soft">{title}</p>
      {preDeposit && (
        <p className="mt-2 rounded-button bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Phone numbers and emails are hidden until the deposit is paid.
        </p>
      )}

      <div className="mt-4 flex-1 space-y-2">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-soft">No messages yet — say hello.</p>
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
