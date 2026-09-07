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

  const { data: mute } = await admin
    .from("trip_group_mutes")
    .select("user_id")
    .eq("group_id", thread.group.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Packages proposed in this room (0065). The guide can build one here as
  // well as on the group page — this is where they read the message that
  // prompted it.
  const [{ data: proposals }, { data: priced }] = await Promise.all([
    admin
      .from("package_proposals")
      .select(
        "id, days, party_size, start_date, total_usd_cents, deposit_usd_cents, note, status, booking_id, price_breakdown",
      )
      .eq("group_id", thread.group.id)
      .order("created_at", { ascending: false }),
    thread.access.isGuide && thread.group.offering_id
      ? admin
          .from("offerings")
          .select("price_breakdown, days")
          .eq("id", thread.group.offering_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

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
      isOrganiser: thread.group.organiser_id === user.id,
      muted: !!mute,
      proposals: (proposals ?? []).map((p: any) => ({
        id: p.id,
        title: thread.offering?.title ?? null,
        days: p.days,
        partySize: p.party_size,
        startDate: p.start_date,
        totalUsdCents: p.total_usd_cents,
        depositUsdCents: p.deposit_usd_cents,
        note: p.note,
        status: p.status,
        bookingId: p.booking_id,
        includes: ((p.price_breakdown?.lines ?? []) as any[])
          .map((l) => l.label)
          .filter(Boolean)
          .slice(0, 6),
      })),
      base: (priced?.price_breakdown as any) ?? null,
      baseDays: priced?.days ?? thread.offering?.days ?? 1,
      seats: Math.max(thread.group.party_target ?? 1, going),
      startDate: thread.group.start_date ?? "",
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
  const intent = String(form.get("intent") ?? "send");

  // Whether you want to hear about a trip is yours alone — no organiser, no
  // ops, and it never removes you from the group.
  if (intent === "mute" || intent === "unmute") {
    if (intent === "mute") {
      await admin
        .from("trip_group_mutes")
        .upsert({ group_id: thread.group.id, user_id: user.id });
    } else {
      await admin
        .from("trip_group_mutes")
        .delete()
        .eq("group_id", thread.group.id)
        .eq("user_id", user.id);
    }
    return data({ ok: true }, { headers });
  }

  if (intent === "propose") {
    if (!thread.access.isGuide) {
      return data({ ok: false, error: "Only the guide can propose a package." }, { status: 403, headers });
    }
    if (!thread.group.offering_id) {
      return data({ ok: false, error: "The group has not picked a trip yet." }, { status: 400, headers });
    }
    const { createProposal, clamp, extraLineFrom } = await import("~/lib/proposals.server");
    const { systemLine } = await import("~/lib/groups.server");
    const seats = Math.max(thread.group.party_target ?? 1, 1);
    const res = await createProposal(admin, {
      guideId: user.id,
      trekkerId: thread.group.organiser_id,
      offeringId: thread.group.offering_id,
      groupId: thread.group.id,
      startDate: String(form.get("start_date") || thread.group.start_date || ""),
      days: clamp(form.get("days"), 1, 60, 1),
      partySize: clamp(form.get("party_size"), 1, 24, seats),
      includedOptionIds: form.getAll("option").map(String),
      extraLines: extraLineFrom(form),
      note: String(form.get("note") ?? "").trim().slice(0, 800) || null,
    });
    if (res.error) return data({ ok: false, error: res.error }, { status: 400, headers });
    await systemLine(
      admin,
      thread.group.id,
      user.id,
      "Your guide suggested a plan — the organiser approves it for everyone.",
    );
    const { notifyGroupMessage } = await import("~/lib/group-notify.server");
    await notifyGroupMessage(env, admin, { groupId: thread.group.id, authorId: user.id });
    return data({ ok: "Sent to the group." }, { headers });
  }

  const body = String(form.get("body") ?? "").trim();
  if (!body) return data({ ok: false }, { headers });

  const { error } = await admin.from("trip_group_messages").insert({
    group_id: thread.group.id,
    author_id: user.id,
    body: body.slice(0, 4000),
  });
  if (error) {
    return data({ ok: false, error: "Message didn't send — try again." }, { status: 500, headers });
  }

  // Tell the rest of the group. Awaited rather than fired and forgotten: on
  // Workers there is no runtime after the response is returned, so an
  // un-awaited send is a send that may never happen.
  const { notifyGroupMessage } = await import("~/lib/group-notify.server");
  await notifyGroupMessage(env, admin, { groupId: thread.group.id, authorId: user.id });

  return data({ ok: true }, { headers });
}

export default function GroupMessages({ loaderData }: Route.ComponentProps) {
  const { group, messages, people, canPost, isGuide, isOrganiser, muted, proposals, base, baseDays, seats, startDate } =
    loaderData as any;
  return (
    <GroupThread
      group={group}
      messages={messages}
      people={people}
      canPost={canPost}
      isGuide={isGuide}
      isOrganiser={isOrganiser}
      muted={muted}
      proposals={proposals}
      base={base}
      baseDays={baseDays}
      seats={seats}
      startDate={startDate}
    />
  );
}
