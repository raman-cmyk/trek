import { data, redirect } from "react-router";
import type { Route } from "./+types/messages.$bookingId";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { maskMessage } from "~/lib/mask";
import { Thread } from "~/components/messages/Thread";
import { statusLabel } from "~/lib/format";

export function meta() {
  return [{ title: "Messages" }, { name: "robots", content: "noindex" }];
}

async function loadParticipant(request: Request, env: Env, bookingId: string) {
  const { user, headers } = await getSessionUser(request, env);
  if (!user) throw redirect(`/login?next=/messages/${bookingId}`, { headers });
  const admin = createAdminClient(env);
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, trekker_id, guide_id, start_date, end_date, party_size, offering:offerings(title), trekker:users(full_name, avatar_url, last_seen_at)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || (b.trekker_id !== user.id && b.guide_id !== user.id)) {
    throw new Response("Not found", { status: 404 });
  }
  return { user, admin, booking: b, headers, isGuide: b.guide_id === user.id };
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, booking, headers, isGuide } = await loadParticipant(
    request,
    env,
    params.bookingId,
  );

  const now = new Date().toISOString();
  await admin
    .from("thread_reads")
    .upsert({ user_id: user.id, thread_key: `b:${booking.id}`, last_read_at: now });
  // Per-message receipts: opening the thread marks the other side's messages
  // read, which is what powers the "read" tick on their copy.
  await admin
    .from("messages")
    .update({ read_at: now })
    .eq("booking_id", booking.id)
    .neq("sender_id", user.id)
    .is("read_at", null);

  // Contact info is masked until the deposit is paid (docs/02).
  const preDeposit = booking.status === "pending_deposit";

  const [{ data: messages }, { data: guide }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, body, body_rendered, created_at, read_at")
      .eq("booking_id", booking.id)
      .order("created_at"),
    admin
      .from("public_guides")
      .select(
        "slug, full_name, avatar_url, tier, home_district, median_response_mins, only_with_me",
      )
      .eq("user_id", booking.guide_id)
      .maybeSingle(),
  ]);

  const { data: guideUser } = await admin
    .from("users")
    .select("last_seen_at")
    .eq("id", booking.guide_id)
    .maybeSingle();

  const canned = isGuide
    ? (await admin
        .from("canned_replies")
        .select("id, label, body")
        .eq("guide_id", user.id)
        .order("sort")).data ?? []
    : [];

  const partner = isGuide
    ? {
        name: (booking as any).trekker?.full_name ?? "Trekker",
        avatarUrl: (booking as any).trekker?.avatar_url ?? null,
        lastSeenAt: (booking as any).trekker?.last_seen_at ?? null,
      }
    : {
        name: guide?.full_name ?? "Your guide",
        slug: guide?.slug ?? null,
        avatarUrl: guide?.avatar_url ?? null,
        tier: guide?.tier ?? null,
        district: guide?.home_district ?? null,
        responseMins: guide?.median_response_mins ?? null,
        lastSeenAt: guideUser?.last_seen_at ?? null,
        onlyWithMe: guide?.only_with_me ?? null,
      };

  return data(
    {
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        mine: m.sender_id === user.id,
        text: preDeposit ? m.body_rendered : m.body,
        at: m.created_at,
        readAt: m.read_at,
      })),
      partner,
      booking: {
        id: booking.id,
        title: (booking as any).offering?.title ?? "Your trek",
        startDate: booking.start_date,
        endDate: booking.end_date,
        partySize: booking.party_size ?? 1,
        statusLabel: statusLabel(booking.status),
        href: isGuide ? `/g/bookings` : `/trips/${booking.id}`,
      },
      canned,
      isGuide,
      masked: preDeposit,
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, booking, headers } = await loadParticipant(request, env, params.bookingId);
  const form = await request.formData();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return data({ ok: false, error: "Write something first." }, { headers });

  const preDeposit = booking.status === "pending_deposit";
  const { rendered, flaggedReason } = maskMessage(body);
  const { error: insertErr } = await admin.from("messages").insert({
    booking_id: booking.id,
    sender_id: user.id,
    body,
    // Pre-deposit, everyone sees the masked version; post-deposit, the original.
    body_rendered: preDeposit ? rendered : body,
    flagged_reason: flaggedReason, // → ops moderation queue
  });
  if (insertErr) {
    return data({ ok: false, error: "Message didn't send — try again." }, { status: 500, headers });
  }

  const otherId = booking.guide_id === user.id ? booking.trekker_id : booking.guide_id;
  const { data: me } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const { notifyNewMessage } = await import("~/lib/notifications.server");
  await notifyNewMessage(env, admin, {
    toUserId: otherId,
    fromName: me?.full_name ?? "Someone",
    threadPath: `/messages/${booking.id}`,
  });
  return data({ ok: true }, { headers });
}

export default function BookingThread({ loaderData }: Route.ComponentProps) {
  const { messages, partner, booking, canned, isGuide, masked } = loaderData as any;
  return (
    <Thread
      messages={messages}
      partner={partner}
      booking={booking}
      backTo="/messages"
      isGuide={isGuide}
      cannedReplies={canned}
      masked={masked}
    />
  );
}
