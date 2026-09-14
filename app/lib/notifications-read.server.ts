import type { SupabaseClient } from "@supabase/supabase-js";
import type { InAppRow } from "~/lib/inapp";

/**
 * Reading the bell.
 *
 * Service-role reads with an explicit `user_id` filter rather than the
 * anon client's RLS: every other loader in this app is written the same way,
 * and the filter is the guarantee — there is no path here that does not pin
 * the query to one person.
 */
export async function recentNotifications(
  admin: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<InAppRow[]> {
  const { data } = await admin
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as InAppRow[];
}

/** How many this person has not seen. Cheap: it is an index-only count. */
export async function countUnseen(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

/**
 * Mark them read.
 *
 * All of them, on opening the list — a per-row tick is a chore, and a badge
 * that only clears when you click nineteen things is a badge people learn to
 * ignore. `ids` narrows it to what was actually on screen, so a notification
 * that arrived while the page was open is still waiting afterwards.
 */
export async function markSeen(
  admin: SupabaseClient,
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null)
    .in("id", ids);
}
