import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, sendGuideSms } from "~/lib/notify.server";

/**
 * Event-level notifications (docs/02 §Notifications matrix). One function per
 * moment that matters; each fetches its own contacts so call sites stay one
 * line. Guides are reached by SMS (many have no email), trekkers by email.
 * All fire-and-forget: a failed notification never breaks the flow.
 */

async function bookingContacts(admin: SupabaseClient, bookingId: string) {
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, start_date, trekker:users!bookings_trekker_id_fkey(email, full_name), guide:guides!bookings_guide_id_fkey(users(email, phone, full_name)), offering:offerings(title)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;
  return {
    startDate: b.start_date as string,
    title: ((b as any).offering?.title ?? "your trip") as string,
    trekkerEmail: ((b as any).trekker?.email ?? null) as string | null,
    trekkerName: ((b as any).trekker?.full_name ?? "there") as string,
    guidePhone: ((b as any).guide?.users?.phone ?? null) as string | null,
    guideName: ((b as any).guide?.users?.full_name ?? "your guide") as string,
  };
}

export async function notifyNewEnquiry(
  env: Env,
  admin: SupabaseClient,
  args: { guideId: string; offeringTitle: string; startDate: string; partySize: number },
) {
  const { data: g } = await admin
    .from("users")
    .select("phone")
    .eq("id", args.guideId)
    .maybeSingle();
  await sendGuideSms(
    env,
    g?.phone,
    `Trek: new request — ${args.offeringTitle}, ${args.startDate}, ${args.partySize}p. Open your dashboard to accept (24h).`,
  );
}

export async function notifyEnquiryAccepted(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await sendEmail(
    env,
    c.trekkerEmail,
    `${c.guideName} accepted — pay your deposit to lock it in`,
    `Good news: ${c.guideName} accepted your request for ${c.title} (${c.startDate}).\n\nPay your deposit within 24 hours to hold the dates:\n${env.SITE_URL}/checkout/${bookingId}`,
  );
}

export async function notifyDepositPaid(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await Promise.all([
    sendGuideSms(
      env,
      c.guidePhone,
      `Trek: deposit paid for ${c.title}, ${c.startDate}. The trip is on — see your dashboard.`,
    ),
    sendEmail(
      env,
      c.trekkerEmail,
      "Deposit received — you're booked",
      `Your deposit for ${c.title} is in. Next: upload documents and check your trip page.\n${env.SITE_URL}/trips/${bookingId}`,
    ),
  ]);
}

export async function notifyNewMessage(
  env: Env,
  admin: SupabaseClient,
  args: { toUserId: string; fromName: string; threadPath: string },
) {
  const { data: u } = await admin
    .from("users")
    .select("email, phone, role")
    .eq("id", args.toUserId)
    .maybeSingle();
  if (!u) return;
  if (u.role === "guide") {
    await sendGuideSms(env, u.phone, `Trek: new message from ${args.fromName}. Reply: ${env.SITE_URL}${args.threadPath}`);
  } else {
    await sendEmail(
      env,
      u.email,
      `New message from ${args.fromName}`,
      `${args.fromName} sent you a message on Trek.\n${env.SITE_URL}${args.threadPath}`,
    );
  }
}

export async function notifyInstalmentCharged(
  env: Env,
  admin: SupabaseClient,
  bookingId: string,
  amountUsdCents: number,
) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await sendEmail(
    env,
    c.trekkerEmail,
    "Instalment charged",
    `We charged $${(amountUsdCents / 100).toFixed(2)} for ${c.title}, as scheduled. Full plan: ${env.SITE_URL}/trips/${bookingId}`,
  );
}

export async function notifyBalanceCharged(
  env: Env,
  admin: SupabaseClient,
  bookingId: string,
  amountUsdCents: number,
) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await sendEmail(
    env,
    c.trekkerEmail,
    "Balance charged — see you on the trail",
    `We charged your remaining balance of $${(amountUsdCents / 100).toFixed(2)} for ${c.title} (14 days before departure, as agreed).\n${env.SITE_URL}/trips/${bookingId}`,
  );
}

export async function notifyBookingCancelled(
  env: Env,
  admin: SupabaseClient,
  bookingId: string,
  refundUsdCents: number,
) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await Promise.all([
    sendEmail(
      env,
      c.trekkerEmail,
      "Your booking was cancelled",
      `Your booking for ${c.title} (${c.startDate}) is cancelled.` +
        (refundUsdCents > 0
          ? ` A refund of $${(refundUsdCents / 100).toFixed(2)} is on its way to your card.`
          : ""),
    ),
    sendGuideSms(env, c.guidePhone, `Trek: booking cancelled — ${c.title}, ${c.startDate}. Your calendar is open again.`),
  ]);
}

export async function notifyTimsIssued(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await sendEmail(
    env,
    c.trekkerEmail,
    "Your TIMS card is ready",
    `Your blue TIMS card for ${c.title} has been issued. Download the PDF from your trip page:\n${env.SITE_URL}/trips/${bookingId}`,
  );
}

export async function notifyGuideVerification(
  env: Env,
  admin: SupabaseClient,
  guideUserId: string,
  approved: boolean,
) {
  const { data: u } = await admin
    .from("users")
    .select("phone")
    .eq("id", guideUserId)
    .maybeSingle();
  await sendGuideSms(
    env,
    u?.phone,
    approved
      ? "Trek: you're verified! Your profile is live. Sign in to set your calendar."
      : "Trek: we couldn't verify your application yet. Sign in to see what's missing.",
  );
}

/**
 * A trekker asked a public question. The guide is the only one who can turn
 * it into a page, so this is the one that has to land.
 *
 * SMS, like every other guide-facing notification — many have no email, and
 * this needs to reach a phone between treks rather than an inbox nobody
 * opens.
 */
export async function notifyGuideOfQuestion(
  env: Env,
  admin: SupabaseClient,
  args: { guideId: string; askerName: string; body: string },
) {
  const { data: g } = await admin
    .from("users")
    .select("phone")
    .eq("id", args.guideId)
    .maybeSingle();
  const snippet = args.body.length > 70 ? `${args.body.slice(0, 67)}…` : args.body;
  await sendGuideSms(
    env,
    g?.phone,
    `Trek: ${args.askerName} asked you "${snippet}" — answer it and it goes on your profile.`,
  );
}

/** The answer is live; tell the person who asked. */
export async function notifyQuestionAnswered(
  env: Env,
  admin: SupabaseClient,
  questionId: string,
) {
  const { data: q } = await admin
    .from("guide_questions")
    .select("asker_email, asker_name, body, answer, guide:guides!guide_questions_guide_id_fkey(slug, users(full_name))")
    .eq("id", questionId)
    .maybeSingle();
  if (!q?.asker_email) return;
  const guideName = ((q as any).guide?.users?.full_name ?? "Your guide") as string;
  const slug = ((q as any).guide?.slug ?? "") as string;
  await sendEmail(
    env,
    q.asker_email,
    `${guideName} answered your question`,
    [
      `${q.asker_name},`,
      "",
      `You asked ${guideName}:`,
      `  ${q.body}`,
      "",
      "He said:",
      `  ${q.answer}`,
      "",
      `It is on his profile now: ${env.SITE_URL ?? ""}/guides/${slug}#ask`,
    ].join("\n"),
  );
}
