import { data, redirect } from "react-router";
import type { Route } from "./+types/messages.g.$groupId";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { loadGroupThread } from "~/lib/groups.server";
import { GroupThread } from "~/components/messages/GroupThread";
import { firstName } from "~/lib/names";

export function meta() {
  return [{ title: "Your trip together" }, { name: "robots", content: "noindex" }];
}

/**
 * A trip group's chat, in the inbox.
 *
 * The same conversation the group page shows next to the roster and the
 * money. Both are real: the trip page is where you plan, this is where you
 * answer a message that arrived while you were doing something else.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) throw redirect(`/login?next=/messages/g/${params.groupId}`, { headers });

  const admin = createAdminClient(env);
  const thread = await loadGroupThread(admin, params.groupId, user.id);
  // Not yours: 404 rather than 403, which would confirm the group exists.
  if (!thread) throw new Response("Not found", { status: 404 });

  await admin.from("thread_reads").upsert({
    user_id: user.id,
    thread_key: `g:${thread.group.id}`,
    last_read_at: new Date().toISOString(),
  });

  const nameOf = new Map(thread.people.map((p: any) => [p.id, p]));
  const displayOf = new Map(
    thread.members.filter((m: any) => m.user_id).map((m: any) => [m.user_id, m.display_name]),
  );
  const guideId = thread.group.guide_id;

  const going = thread.members.filter(
    (m: any) => m.status === "joined" || m.status === "invited",
  ).length;

  return data(
    {
      group: {
        id: thread.group.id,
        slug: thread.group.slug,
        name: thread.group.name,
        kind: thread.offering?.kind ?? null,
        groupStatus: thread.group.status,
        bookingStatus: thread.booking?.status ?? null,
        coverUrl: thread.offering?.cover_photo_url ?? null,
        partyLabel: thread.offering?.title ?? "Still choosing a trip",
      },
      people: going,
      messages: thread.messages.map((m: any) => ({
        id: m.id,
        authorId: m.author_id,
        // `firstName` returns "" for an unknown person, not null, so these
        // fall through with || rather than ?? — otherwise an author we have
        // no row for is labelled with an empty string.
        authorName:
          m.author_id === guideId
            ? firstName(thread.guide?.full_name) || "Your guide"
            : displayOf.get(m.author_id) ||
              firstName(nameOf.get(m.author_id)?.full_name) ||
              "Someone",
        authorAvatar:
          (m.author_id === guideId ? thread.guide?.avatar_url : null) ??
          nameOf.get(m.author_id)?.avatar_url ??
          null,
        mine: m.author_id === user.id,
        fromGuide: !!guideId && m.author_id === guideId,
        system: m.kind === "system",
        text: m.body,
        at: m.created_at,
      })),
      canPost: thread.access.canPost,
      isGuide: thread.access.isGuide,
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) return redirect(`/login?next=/messages/g/${params.groupId}`, { headers });

  const admin = createAdminClient(env);
  const thread = await loadGroupThread(admin, params.groupId, user.id);
  if (!thread || !thread.access.canPost) {
    return data({ ok: false, error: "You can't write in this trip." }, { status: 403, headers });
  }

  const form = await request.formData();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return data({ ok: false }, { headers });

  const { error } = await admin.from("trip_group_messages").insert({
    group_id: thread.group.id,
    author_id: user.id,
    body: body.slice(0, 4000),
  });
  return error
    ? data({ ok: false, error: "Message didn't send — try again." }, { status: 500, headers })
    : data({ ok: true }, { headers });
}

export default function GroupMessages({ loaderData }: Route.ComponentProps) {
  const { group, messages, people, canPost, isGuide } = loaderData as any;
  return (
    <GroupThread
      group={group}
      messages={messages}
      people={people}
      canPost={canPost}
      isGuide={isGuide}
    />
  );
}
