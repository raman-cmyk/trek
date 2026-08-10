import { Link, data } from "react-router";
import type { Route } from "./+types/messages._index";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";

export function meta() {
  return [{ title: "Messages" }, { name: "robots", content: "noindex" }];
}

/**
 * The inbox (v3 Phase 3): every thread in one place, for both sides.
 * Pre-booking conversations and booking threads, newest activity first.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, profile, admin, headers } = await requireUser(request, env);

  const [{ data: convs }, { data: bookings }] = await Promise.all([
    admin
      .from("conversations")
      .select("id, trekker_id, guide_id, offering_id, last_message_at")
      .or(`trekker_id.eq.${user.id},guide_id.eq.${user.id}`)
      .order("last_message_at", { ascending: false })
      .limit(50),
    admin
      .from("bookings")
      .select("id, trekker_id, guide_id, status, start_date, offering:offerings(title)")
      .or(`trekker_id.eq.${user.id},guide_id.eq.${user.id}`)
      .limit(50),
  ]);

  const convIds = (convs ?? []).map((c) => c.id);
  const bookingIds = (bookings ?? []).map((b) => b.id);

  // Latest message per thread (one query each, newest first, pick per key).
  const [{ data: convMsgs }, { data: bookingMsgs }] = await Promise.all([
    convIds.length
      ? admin
          .from("messages")
          .select("conversation_id, body_rendered, sender_id, created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as any[] }),
    bookingIds.length
      ? admin
          .from("messages")
          .select("booking_id, body_rendered, sender_id, created_at")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const lastByConv = new Map<string, any>();
  for (const m of convMsgs ?? []) if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
  const lastByBooking = new Map<string, any>();
  for (const m of bookingMsgs ?? []) if (!lastByBooking.has(m.booking_id)) lastByBooking.set(m.booking_id, m);

  // Unread = other-party messages newer than my last read of that thread.
  const { data: reads } = await admin
    .from("thread_reads")
    .select("thread_key, last_read_at")
    .eq("user_id", user.id);
  const readAt = new Map((reads ?? []).map((r) => [r.thread_key, r.last_read_at]));
  const unreadCount = (msgs: any[], key: string) => {
    const since = readAt.get(key);
    return msgs.filter(
      (m) => m.sender_id !== user.id && (!since || m.created_at > since),
    ).length;
  };
  const unreadByConv = new Map<string, number>();
  for (const id of convIds) {
    unreadByConv.set(id, unreadCount((convMsgs ?? []).filter((m) => m.conversation_id === id), `c:${id}`));
  }
  const unreadByBooking = new Map<string, number>();
  for (const id of bookingIds) {
    unreadByBooking.set(id, unreadCount((bookingMsgs ?? []).filter((m) => m.booking_id === id), `b:${id}`));
  }

  // Names for everyone on the other side, plus offering titles for conversations.
  const otherIds = new Set<string>();
  for (const c of convs ?? []) otherIds.add(c.trekker_id === user.id ? c.guide_id : c.trekker_id);
  for (const b of bookings ?? []) otherIds.add(b.trekker_id === user.id ? b.guide_id : b.trekker_id);
  const offeringIds = [...new Set((convs ?? []).map((c) => c.offering_id).filter(Boolean))];

  const [{ data: people }, { data: offs }] = await Promise.all([
    otherIds.size
      ? admin.from("users").select("id, full_name, avatar_url").in("id", [...otherIds])
      : Promise.resolve({ data: [] as any[] }),
    offeringIds.length
      ? admin.from("offerings").select("id, title").in("id", offeringIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p]));
  const titleOf = new Map((offs ?? []).map((o) => [o.id, o.title]));

  const threads = [
    ...(convs ?? []).map((c) => {
      const otherId = c.trekker_id === user.id ? c.guide_id : c.trekker_id;
      const last = lastByConv.get(c.id);
      return {
        key: `c-${c.id}`,
        to: `/messages/c/${c.id}`,
        withName: nameOf.get(otherId)?.full_name ?? "Guide",
        avatar: nameOf.get(otherId)?.avatar_url ?? null,
        about: c.offering_id ? (titleOf.get(c.offering_id) ?? null) : null,
        snippet: last?.body_rendered ?? "No messages yet",
        at: last?.created_at ?? c.last_message_at,
        unread: unreadByConv.get(c.id) ?? 0,
        kind: "conversation" as const,
      };
    }),
    ...(bookings ?? [])
      .filter((b) => lastByBooking.has(b.id))
      .map((b) => {
        const otherId = b.trekker_id === user.id ? b.guide_id : b.trekker_id;
        const last = lastByBooking.get(b.id);
        return {
          key: `b-${b.id}`,
          to: `/messages/${b.id}`,
          withName: nameOf.get(otherId)?.full_name ?? "Guide",
          avatar: nameOf.get(otherId)?.avatar_url ?? null,
          about: (b as any).offering?.title ?? null,
          snippet: last?.body_rendered ?? "",
          at: last?.created_at,
          unread: unreadByBooking.get(b.id) ?? 0,
          kind: "booking" as const,
        };
      }),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return data({ threads, isGuide: profile.role === "guide" }, { headers });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export default function Inbox({ loaderData }: Route.ComponentProps) {
  const { threads, isGuide } = loaderData as any;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl text-ink">Messages</h1>
      <p className="mt-1 text-ink-soft">
        {isGuide ? "Your trekkers, all in one place." : "Your guides, all in one place."}
      </p>

      {threads.length === 0 ? (
        <div className="mt-8 rounded-card border border-border bg-card p-6 text-center">
          <p className="text-ink">No conversations yet.</p>
          <p className="mt-1 text-sm text-ink-soft">
            {isGuide
              ? "When a trekker messages you, it lands here."
              : "Find a guide you like and say hello — it's free, before you book anything."}
          </p>
          {!isGuide && (
            <Link
              to="/guides"
              className="mt-4 inline-block rounded-button bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              Find your guide
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-card border border-border bg-card">
          {threads.map((t: any) => (
            <li key={t.key}>
              <Link to={t.to} className="flex items-center gap-3 px-4 py-3 hover:bg-mist">
                {t.avatar ? (
                  <img src={t.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-medium text-ink">
                    {t.withName.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={"truncate " + (t.unread > 0 ? "font-semibold text-ink" : "font-medium text-ink")}>
                      {t.withName}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {t.unread > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-white">
                          {t.unread}
                        </span>
                      )}
                      <span className="font-mono text-xs text-ink-soft">{timeAgo(t.at)}</span>
                    </span>
                  </span>
                  {t.about && <span className="block truncate text-xs text-ink-soft">{t.about}</span>}
                  <span className={"block truncate text-sm " + (t.unread > 0 ? "text-ink" : "text-ink-soft")}>
                    {t.snippet}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
