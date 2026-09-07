import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRichEmail } from "~/lib/notify.server";
import { firstName } from "~/lib/names";
import {
  BURST_WINDOW_MINS,
  catchUpSince,
  digestFor,
  quoteLine,
  recipientsFor,
  withinBurstWindow,
  type DigestMessage,
} from "~/lib/group-notify";

/** The email_log key. Stable — the burst window and dedupe both read it. */
const KIND = "group_message";

/**
 * Email a trip group when somebody says something.
 *
 * Group chat used to notify nobody, so a message reached you only if you
 * happened to open the site. This is the fan-out, built on the email system
 * (0055): consent-gated where it must be, blocked addresses skipped, every
 * attempt written to email_log.
 *
 * Email, and only email. The other threads text the guide through Sparrow,
 * which is metered per message — one person typing "morning!" into a group of
 * six would send five texts. Email costs nothing per recipient, which is what
 * makes a group fan-out affordable at all.
 *
 * Three rules keep it from becoming noise:
 *   - never mail the person who just typed;
 *   - never mail anyone twice inside the burst window;
 *   - only send lines they have not already read, and never on system lines
 *     alone ("Marie joined" is not worth an interruption).
 *
 * Never throws. A notification that fails must not fail the message it was
 * telling people about.
 */
export async function notifyGroupMessage(
  env: Env,
  admin: SupabaseClient,
  args: { groupId: string; authorId: string },
): Promise<{ sent: number }> {
  try {
    const { data: group } = await admin
      .from("trip_groups")
      .select("id, slug, name, guide_id, offering_id, status")
      .eq("id", args.groupId)
      .maybeSingle();
    if (!group) return { sent: 0 };

    const [{ data: memberRows }, { data: muteRows }] = await Promise.all([
      admin
        .from("trip_group_members")
        .select("user_id, display_name, status")
        .eq("group_id", group.id),
      admin.from("trip_group_mutes").select("user_id").eq("group_id", group.id),
    ]);
    const members = memberRows ?? [];

    const recipients = recipientsFor({
      members,
      guideId: group.guide_id,
      authorId: args.authorId,
      mutedUserIds: (muteRows ?? []).map((m) => m.user_id as string),
    });
    if (!recipients.length) return { sent: 0 };

    // The conversation worth catching up on. A day is the ceiling: nobody
    // needs an email quoting last week.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: msgRows }, { data: people }, { data: logRows }, { data: readRows }, { data: offering }] =
      await Promise.all([
        admin
          .from("trip_group_messages")
          .select("author_id, body, kind, created_at")
          .eq("group_id", group.id)
          .gte("created_at", dayAgo)
          .order("created_at")
          .limit(100),
        admin
          .from("users")
          .select("id, email, full_name")
          .in("id", [...recipients, args.authorId]),
        admin
          .from("email_log")
          .select("user_id, created_at")
          .eq("kind", KIND)
          .eq("subject_id", group.id)
          .eq("status", "sent")
          .in("user_id", recipients)
          .order("created_at", { ascending: false })
          .limit(200),
        admin
          .from("thread_reads")
          .select("user_id, last_read_at")
          .eq("thread_key", `g:${group.id}`)
          .in("user_id", recipients),
        group.offering_id
          ? admin
              .from("offerings")
              .select("title")
              .eq("id", group.offering_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    const userById = new Map((people ?? []).map((p: any) => [p.id, p]));
    // The name a group member goes by in this group is their roster name; the
    // guide has no roster row, so fall back to their account's first name.
    const displayById = new Map(
      members.filter((m: any) => m.user_id).map((m: any) => [m.user_id, m.display_name]),
    );
    const nameOf = (id: string) =>
      displayById.get(id) || firstName(userById.get(id)?.full_name) || "Someone";

    const messages: DigestMessage[] = (msgRows ?? []).map((m: any) => ({
      author_id: m.author_id,
      author_name: nameOf(m.author_id),
      body: m.body,
      kind: m.kind,
      created_at: m.created_at,
    }));

    const lastEmailAt = new Map<string, string>();
    for (const row of logRows ?? []) {
      const uid = (row as any).user_id as string;
      if (!lastEmailAt.has(uid)) lastEmailAt.set(uid, (row as any).created_at);
    }
    const lastReadAt = new Map(
      (readRows ?? []).map((r: any) => [r.user_id as string, r.last_read_at as string]),
    );

    const site = (env.SITE_URL ?? "https://guidesofnepal.com").replace(/\/$/, "");
    const threadUrl = `${site}/messages/g/${group.id}`;
    const now = new Date();
    const authorName = nameOf(args.authorId);
    const about = offering?.title ?? null;

    const results = await Promise.all(
      recipients.map(async (id) => {
        const user = userById.get(id);
        if (!user?.email) return false;
        if (withinBurstWindow(lastEmailAt.get(id), now)) return false;

        const digest = digestFor({
          messages,
          recipientId: id,
          since: catchUpSince(lastReadAt.get(id), lastEmailAt.get(id)),
        });
        // Somebody joining or paying is worth reading when you next open the
        // trip; it is not worth an email on its own.
        if (!digest.hasRealMessage) return false;

        const count = digest.lines.length + digest.more;
        const res = await sendRichEmail(env, admin, {
          kind: KIND,
          to: user.email,
          userId: id,
          subject:
            count > 1
              ? `${count} new messages in ${group.name}`
              : `${authorName} wrote in ${group.name}`,
          category: "transactional",
          about: { type: "trip_group", id: group.id },
          content: {
            preheader: quoteLine(digest.lines[digest.lines.length - 1] ?? { who: "", text: "" }, 90),
            heading: group.name,
            blocks: [
              ...(about ? [{ p: `Your trip together — ${about}.` }] : []),
              ...(digest.more > 0
                ? [{ p: `${digest.more} earlier ${digest.more === 1 ? "message" : "messages"} before these:` }]
                : []),
              { list: digest.lines.map((l) => quoteLine(l)) },
              { button: { label: "Answer in the chat", url: threadUrl } },
            ],
            footnote:
              `You are getting this because you are on this trip. ` +
              `Open the chat to mute it — we will not email you again about ` +
              `this group for ${BURST_WINDOW_MINS} minutes either way.`,
          },
        });
        return res.sent;
      }),
    );

    return { sent: results.filter(Boolean).length };
  } catch {
    // Fire-and-forget by contract: the message is already saved.
    return { sent: 0 };
  }
}
