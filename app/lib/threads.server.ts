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
  kind: "conversation" | "booking" | "group";
}

/**
 * The trip groups a person is in — as a member, or as the guide they are
 * planning it with.
 *
 * Being in the room is the whole access rule for a group chat, and these
 * queries run on an admin client that bypasses RLS, so this lookup is what
 * keeps someone else's group out of your inbox. The organiser has a member
 * row too, so the first query covers them as well.
 */
export async function groupIdsFor(
  admin: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const [{ data: mine }, { data: guiding }] = await Promise.all([
    admin
      .from("trip_group_members")
      .select("group_id")
      .eq("user_id", userId)
      .in("status", ["invited", "joined"])
      .limit(100),
    // The guide the group is planning with is in the room too (0056) — they
    // are not on the roster, so this is the second half of "who is in it".
    admin.from("trip_groups").select("id").eq("guide_id", userId).limit(100),
  ]);
  return [
    ...new Set([
      ...(mine ?? []).map((m) => m.group_id as string),
      ...(guiding ?? []).map((g) => g.id as string),
    ]),
  ];
}

export async function listThreads(
  admin: SupabaseClient,
  userId: string,
): Promise<ThreadSummary[]> {
  const [{ data: convs }, { data: bookings }, groupIds] = await Promise.all([
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
    groupIdsFor(admin, userId),
  ]);

  const convIds = (convs ?? []).map((c) => c.id);
  const bookingIds = (bookings ?? []).map((b) => b.id);

  // Latest message per thread (one query each, newest first, pick per key).
  const [
    { data: convMsgs },
    { data: bookingMsgs },
    { data: groupMsgs },
    { data: groups },
  ] = await Promise.all([
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
    // A group chat lives in its own table — it is friends planning, not a
    // moderated trekker-to-guide thread — but it is still a conversation the
    // person is in, so the inbox has to carry it.
    groupIds.length
      ? admin
          .from("trip_group_messages")
          .select("group_id, body, author_id, created_at")
          .in("group_id", groupIds)
          .order("created_at", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as any[] }),
    groupIds.length
      ? admin
          .from("trip_groups")
          .select("id, slug, name, offering_id, status, created_at")
          .in("id", groupIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const lastByConv = new Map<string, any>();
  for (const m of convMsgs ?? []) if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
  const lastByBooking = new Map<string, any>();
  for (const m of bookingMsgs ?? []) if (!lastByBooking.has(m.booking_id)) lastByBooking.set(m.booking_id, m);
  const lastByGroup = new Map<string, any>();
  for (const m of groupMsgs ?? []) if (!lastByGroup.has(m.group_id)) lastByGroup.set(m.group_id, m);

  // Unread = other-party messages newer than my last read of that thread.
  const { data: reads } = await admin
    .from("thread_reads")
    .select("thread_key, last_read_at")
    .eq("user_id", userId);
  const readAt = new Map((reads ?? []).map((r) => [r.thread_key, r.last_read_at]));
  const unreadCount = (msgs: any[], key: string, senderKey: "sender_id" | "author_id" = "sender_id") => {
    const since = readAt.get(key);
    return msgs.filter(
      (m) => m[senderKey] !== userId && (!since || m.created_at > since),
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
  const unreadByGroup = new Map<string, number>();
  for (const id of groupIds) {
    unreadByGroup.set(
      id,
      unreadCount((groupMsgs ?? []).filter((m) => m.group_id === id), `g:${id}`, "author_id"),
    );
  }

  // Names for everyone on the other side, plus offering titles for conversations.
  const otherIds = new Set<string>();
  for (const c of convs ?? []) otherIds.add(c.trekker_id === userId ? c.guide_id : c.trekker_id);
  for (const b of bookings ?? []) otherIds.add(b.trekker_id === userId ? b.guide_id : b.trekker_id);
  const offeringIds = [
    ...new Set(
      [...(convs ?? []), ...(groups ?? [])].map((r: any) => r.offering_id).filter(Boolean),
    ),
  ];

  const [{ data: people }, { data: offs }] = await Promise.all([
    otherIds.size
      ? admin.from("users").select("id, full_name, avatar_url").in("id", [...otherIds])
      : Promise.resolve({ data: [] as any[] }),
    offeringIds.length
      ? admin.from("offerings").select("id, title, cover_photo_url").in("id", offeringIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p]));
  const titleOf = new Map((offs ?? []).map((o) => [o.id, o.title]));
  const coverOf = new Map((offs ?? []).map((o) => [o.id, o.cover_photo_url]));

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
    ...(groups ?? [])
      // A cancelled group with nothing said in it is not a conversation; one
      // that was talked in stays, because the trip falling apart is exactly
      // what people go back and read.
      .filter((g: any) => lastByGroup.has(g.id) || g.status !== "cancelled")
      .map((g: any) => {
        const last = lastByGroup.get(g.id);
        return {
          key: `g-${g.id}`,
          to: `/messages/g/${g.id}`,
          withName: g.name,
          avatar: g.offering_id ? (coverOf.get(g.offering_id) ?? null) : null,
          about: g.offering_id ? (titleOf.get(g.offering_id) ?? null) : null,
          snippet: last?.body ?? "No messages yet",
          at: last?.created_at ?? g.created_at,
          unread: unreadByGroup.get(g.id) ?? 0,
          kind: "group" as const,
        };
      }),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return threads as ThreadSummary[];
}
