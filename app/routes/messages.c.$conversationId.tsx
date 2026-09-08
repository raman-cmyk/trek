import { data, redirect } from "react-router";
import type { Route } from "./+types/messages.c.$conversationId";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { maskMessage } from "~/lib/mask";
import { Thread } from "~/components/messages/Thread";
import { money } from "~/lib/currency";
import { firstName } from "~/lib/names";

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
      .select("id, sender_id, body_rendered, created_at, read_at, offering_id, proposal_id")
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
      // The trips this guide sells: what a trekker points at when they say
      // "this one", and what a guide builds a package from.
      .from("public_offerings")
      .select("id, slug, kind, title, days, price_breakdown, min_party, max_party")
      .eq("guide_id", convo.guide_id)
      .limit(24),
  ]);

  const [{ data: guideUser }, { data: trekkerUser }] = await Promise.all([
    admin.from("users").select("last_seen_at").eq("id", convo.guide_id).maybeSingle(),
    admin
      .from("users")
      .select("full_name, avatar_url, last_seen_at, timezone")
      .eq("id", convo.trekker_id)
      .maybeSingle(),
  ]);

  // Packages sent in this thread, so their cards can be rendered where they
  // were sent rather than only as a link somebody has to follow.
  const { data: proposals } = await admin
    .from("package_proposals")
    .select(
      "id, offering_id, days, party_size, start_date, total_usd_cents, deposit_usd_cents, note, status, booking_id, price_breakdown",
    )
    .eq("conversation_id", convo.id)
    .order("created_at");

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
        name: firstName(trekkerUser?.full_name) || "Trekker",
        avatarUrl: trekkerUser?.avatar_url ?? null,
        lastSeenAt: trekkerUser?.last_seen_at ?? null,
        // Who they are, for the guide deciding whether to take them (0066).
        profileHref: `/trekkers/${convo.trekker_id}`,
        // Their clock, so the guide is not answering at somebody's 3am (0068).
        timeZone: trekkerUser?.timezone ?? null,
      }
    : {
        name: firstName(guideRow?.full_name) || "Your guide",
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
        // What the message points at: the trip being asked about, or the
        // package being offered.
        aboutOffering: m.offering_id
          ? ((offerings ?? []).find((o: any) => o.id === m.offering_id)?.title ?? null)
          : null,
        proposalId: m.proposal_id ?? null,
      })),
      packages: (proposals ?? []).map((p: any) => ({
        id: p.id,
        title: (offerings ?? []).find((o: any) => o.id === p.offering_id)?.title ?? null,
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
      trips: (offerings ?? []).map((o: any) => ({
        id: o.id,
        title: o.title,
        days: o.days,
        minParty: o.min_party ?? 1,
        pricedByLine: Array.isArray(o.price_breakdown?.lines) && o.price_breakdown.lines.length > 0,
        options: ((o.price_breakdown?.lines ?? []) as any[]).filter((l) => l.optional),
        breakdown: o.price_breakdown ?? null,
      })),
      conversationOfferingId: (convo as any).offering_id ?? null,
      userId: user.id,
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
  const { user, admin, convo, headers, isGuide } = await loadConversation(
    request,
    env,
    params.conversationId,
  );
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "send");

  // ── The guide builds a package, here, in the conversation ──────────────
  if (intent === "propose") {
    if (!isGuide) {
      return data({ ok: false, error: "Only the guide can send a package." }, { status: 403, headers });
    }
    const offeringId = String(form.get("offering_id") ?? "");
    if (!offeringId) {
      return data({ ok: false, error: "Pick which trip it is." }, { status: 400, headers });
    }
    const { createProposal, clamp, extraLineFrom } = await import("~/lib/proposals.server");
    const startDate = String(form.get("start_date") ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return data({ ok: false, error: "Pick a start date." }, { status: 400, headers });
    }
    const res = await createProposal(admin, {
      guideId: convo.guide_id,
      trekkerId: convo.trekker_id,
      offeringId,
      conversationId: convo.id,
      startDate,
      days: clamp(form.get("days"), 1, 60, 1),
      partySize: clamp(form.get("party_size"), 1, 24, 1),
      includedOptionIds: form.getAll("option").map(String),
      extraLines: extraLineFrom(form),
      note: String(form.get("note") ?? "").trim().slice(0, 800) || null,
    });
    if (res.error || !res.id) {
      return data({ ok: false, error: res.error ?? "That didn't send." }, { status: 400, headers });
    }

    // The package lands in the thread as a message, so the conversation reads
    // in one order and nothing important lives off to one side.
    const line = "I've put a package together for you.";
    await admin.from("messages").insert({
      conversation_id: convo.id,
      sender_id: user.id,
      body: line,
      body_rendered: line,
      proposal_id: res.id,
    });
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", convo.id);

    const { notifyPackageProposed } = await import("~/lib/notifications.server");
    await notifyPackageProposed(env, admin, { conversationId: convo.id });
    return data({ ok: true }, { headers });
  }

  await rememberZone(admin, user.id, form.get("tz"));
  const body = String(form.get("body") ?? "").trim();
  if (!body) return data({ ok: false }, { headers });
  // "This is the trip I mean." Checked against this guide's own trips, so a
  // crafted post cannot attach somebody else's listing to the thread.
  const aboutId = String(form.get("about_offering_id") ?? "").trim() || null;
  let offeringId: string | null = null;
  if (aboutId) {
    const { data: own } = await admin
      .from("offerings")
      .select("id")
      .eq("id", aboutId)
      .eq("guide_id", convo.guide_id)
      .maybeSingle();
    offeringId = own?.id ?? null;
  }

  // Pre-booking: contact info is always masked; bypass attempts flag to ops.
  const { rendered, flaggedReason } = maskMessage(body);
  const { error: insertErr } = await admin.from("messages").insert({
    conversation_id: convo.id,
    sender_id: user.id,
    body,
    body_rendered: rendered,
    flagged_reason: flaggedReason,
    offering_id: offeringId,
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
    fromName: firstName(me?.full_name) || "Someone",
    threadPath: `/messages/c/${convo.id}`,
  });
  return data({ ok: true }, { headers });
}

export default function Conversation({ loaderData }: Route.ComponentProps) {
  const { messages, partner, bookPath, canned, isGuide, trips, packages, conversationOfferingId } =
    loaderData as any;
  return (
    <Thread
      messages={messages}
      partner={partner}
      backTo="/messages"
      bookHref={bookPath}
      isGuide={isGuide}
      cannedReplies={canned}
      trips={trips}
      packages={packages}
      defaultTripId={conversationOfferingId}
    />
  );
}

/**
 * Keep the sender's time zone current (0068), so the other side can be shown
 * their clock. Written on the way past a message they were sending anyway.
 */
async function rememberZone(admin: any, userId: string, tz: unknown) {
  const zone = String(tz ?? "").trim();
  // A zone is "Area/City" and nothing longer than a label: anything else is a
  // crafted field, not a browser.
  if (!/^[A-Za-z]+\/[A-Za-z_\-+0-9\/]{2,40}$/.test(zone)) return;
  await admin.from("users").update({ timezone: zone }).eq("id", userId);
}
