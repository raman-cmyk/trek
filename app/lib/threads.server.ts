import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The thread list, shared by the inbox route and the conversation rail in the
 * messages shell. One implementation so the rail and the list can never
 * disagree about what is unread.
 */
export interface ThreadSummary {
  key: string;
  to: string;
  withName: string;
  avatar: string | null;
  about: string | null;
  snippet: string;
  at: string | null;
  unread: number;
  kind: "conversation" | "booking";
}

export async function listThreads(
  admin: SupabaseClient,
  userId: string,
): Promise<ThreadSummary[]> {
  const [{ data: convs }, { data: bookings }] = await Promise.all([
    admin
      .from("conversations")
      .select("id, trekker_id, guide_id, offering_id, last_message_at")
      .or(`trekker_id.eq.${userId},guide_id.eq.${userId}`)
      .order("last_message_at", { ascending: false })
      .limit(50),
    admin
      .from("bookings")
      .select("id, trekker_id, guide_id, status, start_date, offering:offerings(title)")
      .or(`trekker_id.eq.${userId},guide_id.eq.${userId}`)
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
    .eq("user_id", userId);
  const readAt = new Map((reads ?? []).map((r) => [r.thread_key, r.last_read_at]));
  const unreadCount = (msgs: any[], key: string) => {
    const since = readAt.get(key);
    return msgs.filter(
      (m) => m.sender_id !== userId && (!since || m.created_at > since),
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
  for (const c of convs ?? []) otherIds.add(c.trekker_id === userId ? c.guide_id : c.trekker_id);
  for (const b of bookings ?? []) otherIds.add(b.trekker_id === userId ? b.guide_id : b.trekker_id);
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
      const otherId = c.trekker_id === userId ? c.guide_id : c.trekker_id;
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
      // Live bookings appear even before the first message — a trekker who
      // just paid must be able to start the thread from here.
      .filter((b) => lastByBooking.has(b.id) || !String(b.status ?? "").startsWith("cancelled"))
      .map((b) => {
        const otherId = b.trekker_id === userId ? b.guide_id : b.trekker_id;
        const last = lastByBooking.get(b.id);
        return {
          key: `b-${b.id}`,
          to: `/messages/${b.id}`,
          withName: nameOf.get(otherId)?.full_name ?? "Guide",
          avatar: nameOf.get(otherId)?.avatar_url ?? null,
          about: (b as any).offering?.title ?? null,
          snippet: last?.body_rendered ?? "No messages yet — say hello",
          at: last?.created_at ?? null,
          unread: unreadByBooking.get(b.id) ?? 0,
          kind: "booking" as const,
        };
      }),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return threads as ThreadSummary[];
}
