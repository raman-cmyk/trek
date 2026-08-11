import { data, redirect } from "react-router";
import type { Route } from "./+types/messages.c.$conversationId";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { maskMessage } from "~/lib/mask";
import { Thread } from "~/components/messages/Thread";
import { money } from "~/lib/currency";

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
  const now = new Date().toISOString();
  await admin
    .from("thread_reads")
    .upsert({ user_id: user.id, thread_key: `c:${convo.id}`, last_read_at: now });
  // Per-message receipts — the sender's "read" tick.
  await admin
    .from("messages")
    .update({ read_at: now })
    .eq("conversation_id", convo.id)
    .neq("sender_id", user.id)
    .is("read_at", null);

  const [{ data: messages }, { data: guideRow }, { data: offerings }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, body_rendered, created_at, read_at")
      .eq("conversation_id", convo.id)
      .order("created_at"),
    admin
      .from("public_guides")
      .select(
        "slug, full_name, avatar_url, tier, home_district, median_response_mins, only_with_me, day_rate_usd_cents",
      )
      .eq("user_id", convo.guide_id)
      .maybeSingle(),
    admin
      .from("public_offerings")
      .select("slug, kind, title, days")
      .eq("guide_id", convo.guide_id)
      .limit(3),
  ]);

  const [{ data: guideUser }, { data: trekkerUser }] = await Promise.all([
    admin.from("users").select("last_seen_at").eq("id", convo.guide_id).maybeSingle(),
    admin
      .from("users")
      .select("full_name, avatar_url, last_seen_at")
      .eq("id", convo.trekker_id)
      .maybeSingle(),
  ]);

  const canned = isGuide
    ? (await admin
        .from("canned_replies")
        .select("id, label, body")
        .eq("guide_id", user.id)
        .order("sort")).data ?? []
    : [];

  const g: any = convo;
  const bookPath =
    g.offering?.slug &&
    (g.offering.kind === "trek" ? `/treks/${g.offering.slug}` : `/experiences/${g.offering.slug}`);

  const partner = isGuide
    ? {
        name: trekkerUser?.full_name ?? "Trekker",
        avatarUrl: trekkerUser?.avatar_url ?? null,
        lastSeenAt: trekkerUser?.last_seen_at ?? null,
      }
    : {
        name: guideRow?.full_name ?? "Your guide",
        slug: guideRow?.slug ?? null,
        avatarUrl: guideRow?.avatar_url ?? null,
        tier: guideRow?.tier ?? null,
        district: guideRow?.home_district ?? null,
        responseMins: guideRow?.median_response_mins ?? null,
        lastSeenAt: guideUser?.last_seen_at ?? null,
        onlyWithMe: guideRow?.only_with_me ?? null,
        // Settlement currency here: the shell has no currency provider, and a
        // guide's rate is quoted in USD everywhere else on the site.
        dayRateLabel: guideRow?.day_rate_usd_cents
          ? `from ${money(guideRow.day_rate_usd_cents, "USD")}/day`
          : null,
        offerings: offerings ?? [],
      };

  return data(
    {
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        mine: m.sender_id === user.id,
        text: m.body_rendered, // always masked pre-booking
        at: m.created_at,
        readAt: m.read_at,
      })),
      partner,
      bookPath: isGuide ? null : bookPath || (guideRow?.slug ? `/guides/${guideRow.slug}` : null),
      canned,
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
  const { messages, partner, bookPath, canned, isGuide } = loaderData as any;
  return (
    <Thread
      messages={messages}
      partner={partner}
      backTo={isGuide ? "/messages" : "/messages"}
      bookHref={bookPath}
      isGuide={isGuide}
      cannedReplies={canned}
    />
  );
}
