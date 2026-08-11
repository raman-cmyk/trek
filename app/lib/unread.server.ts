import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unread message count for a user across both thread kinds (conversations and
 * booking threads), compared against thread_reads. Used by the guide nav badge
 * and the site header dot — kept cheap: two id queries plus one message scan.
 */
export async function countUnread(
  admin: SupabaseClient,
  userId: string,
): Promise<{ unreadTotal: number }> {
  const [{ data: convs }, { data: bookings }, { data: reads }] = await Promise.all([
    admin
      .from("conversations")
      .select("id")
      .or(`trekker_id.eq.${userId},guide_id.eq.${userId}`)
      .limit(100),
    admin
      .from("bookings")
      .select("id")
      .or(`trekker_id.eq.${userId},guide_id.eq.${userId}`)
      .limit(100),
    admin.from("thread_reads").select("thread_key, last_read_at").eq("user_id", userId),
  ]);

  const convIds = (convs ?? []).map((c) => c.id);
  const bookingIds = (bookings ?? []).map((b) => b.id);
  if (!convIds.length && !bookingIds.length) return { unreadTotal: 0 };

  const readAt = new Map((reads ?? []).map((r) => [r.thread_key, r.last_read_at]));

  const [{ data: cm }, { data: bm }] = await Promise.all([
    convIds.length
      ? admin
          .from("messages")
          .select("conversation_id, sender_id, created_at")
          .in("conversation_id", convIds)
          .neq("sender_id", userId)
          .limit(500)
      : Promise.resolve({ data: [] as any[] }),
    bookingIds.length
      ? admin
          .from("messages")
          .select("booking_id, sender_id, created_at")
          .in("booking_id", bookingIds)
          .neq("sender_id", userId)
          .limit(500)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  let unreadTotal = 0;
  for (const m of cm ?? []) {
    const since = readAt.get(`c:${m.conversation_id}`);
    if (!since || m.created_at > since) unreadTotal++;
  }
  for (const m of bm ?? []) {
    const since = readAt.get(`b:${m.booking_id}`);
    if (!since || m.created_at > since) unreadTotal++;
  }
  return { unreadTotal };
}
