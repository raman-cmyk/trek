import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, sendGuideSms } from "~/lib/notify.server";
import { pauseSms } from "~/lib/pause";
import { BRAND, SMS_PREFIX } from "~/lib/brand";
import { siteUrl } from "~/lib/site-url";
import { withinBurstWindow } from "~/lib/group-notify";

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
      "id, start_date, guide_id, trekker:users!bookings_trekker_id_fkey(id, email, full_name), guide:guides!bookings_guide_id_fkey(users(email, phone, full_name)), offering:offerings(title)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;
  return {
    startDate: b.start_date as string,
    // `bookings.guide_id` references `guides(user_id)`, so it IS the guide's
    // user id — which is what a notification needs and an SMS does not.
    guideUserId: ((b as any).guide_id ?? null) as string | null,
    title: ((b as any).offering?.title ?? "your trip") as string,
    trekkerId: ((b as any).trekker?.id ?? null) as string | null,
    trekkerEmail: ((b as any).trekker?.email ?? null) as string | null,
    trekkerName: ((b as any).trekker?.full_name ?? "there") as string,
    guidePhone: ((b as any).guide?.users?.phone ?? null) as string | null,
    // Selected all along and never read, back when guides were an SMS away.
    guideEmail: ((b as any).guide?.users?.email ?? null) as string | null,
    guideName: ((b as any).guide?.users?.full_name ?? "your guide") as string,
  };
}

/**
 * A booking request came in.
 *
 * The in-app half, which needs no API key and no phone number. This was the
 * whole of the gap the founder reported: the only thing that happened when a
 * request arrived was an SMS, and `sendGuideSms` is a `console.log` without
 * `SPARROW_SMS_TOKEN` — so thirty-seven requests produced two notifications,
 * and both of those were backfilled from an old email log.
 */
export async function notifyEnquiryInApp(
  admin: SupabaseClient,
  args: {
    guideUserId: string;
    enquiryId: string;
    offeringTitle: string;
    startDate: string;
    partySize: number;
  },
) {
  const { notifyInApp, notifyOpsInApp } = await import("~/lib/inapp.server");
  const { opsHref } = await import("~/lib/inapp");
  const about = { type: "enquiry", id: args.enquiryId };
  const title = `New request: ${args.offeringTitle}`;
  const body = `${args.startDate}, ${args.partySize} ${args.partySize === 1 ? "person" : "people"}. You have 24 hours to answer.`;

  await notifyInApp(admin, {
    userId: args.guideUserId,
    kind: "new_enquiry",
    title,
    body,
    href: "/g/enquiries",
    about,
  });
  await notifyOpsInApp(admin, {
    kind: "new_enquiry",
    title,
    body,
    href: opsHref(about),
    about,
    // A guide who is also on the ops team already has the better link.
    exclude: [args.guideUserId],
  });
}

export async function notifyNewEnquiry(
  env: Env,
  admin: SupabaseClient,
  args: {
    guideId: string;
    enquiryId: string;
    offeringTitle: string;
    startDate: string;
    partySize: number;
  },
) {
  await notifyEnquiryInApp(admin, { ...args, guideUserId: args.guideId });
  const { data: g } = await admin
    .from("users")
    .select("phone, email")
    .eq("id", args.guideId)
    .maybeSingle();
  await sendGuideSms(
    env,
    g?.phone,
    `${SMS_PREFIX}: new request — ${args.offeringTitle}, ${args.startDate}, ${args.partySize}p. Open your dashboard to accept (24h).`,
  );
  // The most important email this platform sends. Somebody has asked this
  // guide, by name, to take them into the mountains, and a clock is running:
  // the enquiry expires in 24 hours and the trekker goes elsewhere. Until now
  // the only channel was an SMS that has never been configured, which is why
  // thirty-seven requests produced two notifications between them.
  const people = `${args.partySize} ${args.partySize === 1 ? "person" : "people"}`;
  await sendEmail(
    env,
    g?.email,
    `New request: ${args.offeringTitle}`,
    `Somebody wants to book you.\n\n${args.offeringTitle}\nStarting ${args.startDate}\nFor ${people}\n\n` +
      `You have 24 hours to answer. After that the request expires and they will look for another guide.\n\n` +
      `Answer it: ${siteUrl(env)}/g/enquiries`,
    { kind: "new_enquiry", userId: args.guideId, about: { type: "enquiry", id: args.enquiryId } },
  );
}

export async function notifyEnquiryAccepted(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await sendEmail(
    env,
    c.trekkerEmail,
    `${c.guideName} accepted — pay your deposit to lock it in`,
    `Good news: ${c.guideName} accepted your request for ${c.title} (${c.startDate}).\n\nPay your deposit within 24 hours to hold the dates:\n${siteUrl(env)}/checkout/${bookingId}`,
    { kind: "enquiry_accepted" },
  );
}

export async function notifyDepositPaid(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await Promise.all([
    sendGuideSms(
      env,
      c.guidePhone,
      `${SMS_PREFIX}: deposit paid for ${c.title}, ${c.startDate}. The trip is on — see your dashboard.`,
    ),
    sendEmail(
      env,
      c.guideEmail,
      `The deposit is in — ${c.title} is on`,
      `${c.trekkerName} has paid the deposit for ${c.title}, starting ${c.startDate}.\n\n` +
        `The dates are held in your calendar. Have a look at what they asked for:\n${siteUrl(env)}/g/bookings`,
      { kind: "deposit_paid_guide", userId: c.guideUserId, about: { type: "booking", id: bookingId } },
    ),
    sendEmail(
      env,
      c.trekkerEmail,
      "Deposit received — you're booked",
      `Your deposit for ${c.title} is in. Next: upload documents and check your trip page.\n${siteUrl(env)}/trips/${bookingId}`,
      { kind: "deposit_paid", about: { type: "booking", id: bookingId } },
    ),
  ]);
  // "After the deposit is paid, a notification saying 'document needed' needs
  // to appear for the client." The words "Next: upload documents" were buried
  // mid-sentence in the receipt above, and nothing followed it.
  const { nudgeClient } = await import("~/lib/trip-nudge.server");
  await nudgeClient(admin, bookingId);
}

/**
 * Somebody said something on a one-to-one thread.
 *
 * Two things were wrong here, and both only started costing the moment email
 * began to send.
 *
 * **It fired on every single message.** Group chat was given a burst window on
 * purpose (DECISIONS, 2026-09-06: a group of six agreeing on a date sends
 * fifteen messages in four minutes, and without a window that is fifteen
 * emails each). One-to-one threads never got the same treatment, so two people
 * arranging a pickup would generate an email per line. The same window, the
 * same tested predicate, applied here.
 *
 * **Guides were sent an SMS and nothing else.** With no Sparrow token that was
 * a `console.log`, and because the in-app bell is written by the email path
 * rather than the SMS one, a guide got no email, no bell and no text — a
 * trekker's question simply vanished. Everybody is emailed now; the SMS call
 * stays so switching Sparrow back on needs no second edit.
 */
export async function notifyNewMessage(
  env: Env,
  admin: SupabaseClient,
  args: {
    toUserId: string;
    fromName: string;
    threadPath: string;
    /** The thread itself, so the burst window is per conversation. */
    about: { type: "booking" | "conversation"; id: string };
  },
) {
  const { data: u } = await admin
    .from("users")
    .select("email, phone, role")
    .eq("id", args.toUserId)
    .maybeSingle();
  if (!u) return;

  // When did we last mail this person about THIS thread? Read the same way
  // the group digest reads it — the newest send, not an attempt.
  const { data: last } = await admin
    .from("email_log")
    .select("created_at")
    .eq("user_id", args.toUserId)
    .eq("kind", "new_message")
    .eq("subject_id", args.about.id)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (withinBurstWindow(last?.created_at, new Date())) {
    // Deliberately silent. They were told about this thread minutes ago and
    // the link they already have shows everything said since.
    return;
  }

  await sendGuideSms(
    env,
    u.phone,
    `${SMS_PREFIX}: new message from ${args.fromName}. Reply: ${siteUrl(env)}${args.threadPath}`,
  );
  await sendEmail(
    env,
    u.email,
    `New message from ${args.fromName}`,
    `${args.fromName} sent you a message on ${BRAND}.\n${siteUrl(env)}${args.threadPath}`,
    { kind: "new_message", userId: args.toUserId, about: args.about },
  );
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
    `We charged $${(amountUsdCents / 100).toFixed(2)} for ${c.title}, as scheduled. Full plan: ${siteUrl(env)}/trips/${bookingId}`,
    { kind: "instalment_charged" },
  );
  const { nudgeClient } = await import("~/lib/trip-nudge.server");
  await nudgeClient(admin, bookingId);
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
    `We charged your remaining balance of $${(amountUsdCents / 100).toFixed(2)} for ${c.title} (14 days before departure, as agreed).\n${siteUrl(env)}/trips/${bookingId}`,
    { kind: "balance_charged" },
  );
  const { nudgeClient } = await import("~/lib/trip-nudge.server");
  await nudgeClient(admin, bookingId);
}

/**
 * A trip was cancelled — the half that needs no API key.
 *
 * Deliberately does NOT write the trekker's row: that one already arrives for
 * free from the email path below, and writing it here too would double it.
 * The guide and the office are the ones who were hearing nothing — the guide's
 * only signal was an SMS that does not send, and the trip then vanishes from
 * their list entirely (`g.bookings.tsx` filters cancelled out).
 */
export async function notifyCancelledInApp(
  admin: SupabaseClient,
  bookingId: string,
  refundUsdCents: number,
) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  const { notifyInApp, notifyOpsInApp } = await import("~/lib/inapp.server");
  const { opsHref } = await import("~/lib/inapp");
  const about = { type: "booking", id: bookingId };
  const refund =
    refundUsdCents > 0 ? ` A refund of $${(refundUsdCents / 100).toFixed(2)} is going back.` : "";

  if (c.guideUserId) {
    await notifyInApp(admin, {
      userId: c.guideUserId,
      kind: "booking_cancelled",
      title: `Cancelled: ${c.title}`,
      body: `${c.startDate} with ${c.trekkerName}. Your calendar is open again.`,
      href: "/g/bookings",
      about,
    });
  }
  await notifyOpsInApp(admin, {
    kind: "booking_cancelled",
    title: `Cancelled: ${c.title}`,
    body: `${c.trekkerName}, ${c.startDate}.${refund}`,
    href: opsHref(about),
    about,
    exclude: c.guideUserId ? [c.guideUserId] : [],
  });
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
      { kind: "booking_cancelled", about: { type: "booking", id: bookingId } },
    ),
    sendGuideSms(env, c.guidePhone, `${SMS_PREFIX}: booking cancelled — ${c.title}, ${c.startDate}. Your calendar is open again.`),
    sendEmail(
      env,
      c.guideEmail,
      `Cancelled: ${c.title}`,
      `${c.trekkerName}'s booking for ${c.title} on ${c.startDate} has been cancelled.\n\n` +
        `Those days are open in your calendar again, so somebody else can book them.\n${siteUrl(env)}/g/bookings`,
      { kind: "booking_cancelled_guide", userId: c.guideUserId, about: { type: "booking", id: bookingId } },
    ),
  ]);
}

export async function notifyTimsIssued(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await sendEmail(
    env,
    c.trekkerEmail,
    "Your TIMS card is ready",
    `Your blue TIMS card for ${c.title} has been issued. Download the PDF from your trip page:\n${siteUrl(env)}/trips/${bookingId}`,
    { kind: "tims_issued" },
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
    .select("phone, email")
    .eq("id", guideUserId)
    .maybeSingle();
  await sendGuideSms(
    env,
    u?.phone,
    approved
      ? `${SMS_PREFIX}: you're verified! Your profile is live. Sign in to set your calendar.`
      : `${SMS_PREFIX}: we couldn't verify your application yet. Sign in to see what's missing.`,
  );
  // The day a guide can start earning, or the day they find out they cannot.
  // It was an SMS and nothing else, on a channel that has never been switched
  // on — so somebody who filled in six screens and waited heard nothing at all.
  await sendEmail(
    env,
    u?.email,
    approved ? "You're verified — your profile is live" : "We could not verify your application yet",
    approved
      ? `Your profile is live on ${BRAND}. Trekkers can find you and ask you to take them out.\n\n` +
        `Two things worth doing now:\n` +
        `- Mark the days you are free, so people only ask about dates you can walk\n` +
        `- Put up your first trek or experience\n\n` +
        `Start here: ${siteUrl(env)}/g`
      : `We have not been able to verify your application yet.\n\n` +
        `Sign in and your dashboard will show exactly which check is outstanding and what to send:\n${siteUrl(env)}/g\n\n` +
        `If you think we have this wrong, reply to this email and a person will read it.`,
    { kind: approved ? "guide_verified" : "guide_not_verified", userId: guideUserId },
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
    .select("phone, email")
    .eq("id", args.guideId)
    .maybeSingle();
  const snippet = args.body.length > 70 ? `${args.body.slice(0, 67)}…` : args.body;
  await sendGuideSms(
    env,
    g?.phone,
    `${SMS_PREFIX}: ${args.askerName} asked you "${snippet}" — answer it and it goes on your profile.`,
  );
  // A public question is free marketing for the guide who answers it — the
  // answer goes on their profile where the next trekker reads it. SMS-only
  // meant it reached nobody, so questions sat unanswered on live profiles.
  await sendEmail(
    env,
    g?.email,
    `${args.askerName} asked you a question`,
    `${args.askerName} asked, on your profile:\n\n"${args.body}"\n\n` +
      `Your answer goes on your public profile, where the next person deciding whether to book you will read it.\n\n` +
      `Answer it: ${siteUrl(env)}/g/questions`,
    { kind: "guide_question", userId: args.guideId },
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
      `It is on his profile now: ${siteUrl(env)}/guides/${slug}#ask`,
    ].join("\n"),
    { kind: "question_answered" },
  );
}

/**
 * The office changed a guide's listing.
 *
 * A guide whose price or itinerary moved overnight, with no note and no name
 * against it, has been given a reason to distrust the platform holding their
 * money. So: what changed, and where to look.
 */
export async function notifyListingEdited(
  env: Env,
  admin: SupabaseClient,
  args: { guideId: string; offeringId: string; title: string; fields: string[] },
) {
  const { data: g } = await admin
    .from("users")
    .select("phone, email")
    .eq("id", args.guideId)
    .maybeSingle();
  const what = args.fields.slice(0, 4).join(", ");
  await sendGuideSms(
    env,
    g?.phone,
    // Trimmed to fit one SMS segment: the longer name costs eleven characters
    // and Sparrow bills per 160. The title is cut rather than the link, which
    // is the part a guide actually taps.
    `${SMS_PREFIX}: we updated "${args.title.slice(0, 28)}" (${what}). See it: ${siteUrl(env)}/g/experiences/${args.offeringId}`,
  );
  if (g?.email) {
    await sendEmail(
      env,
      g.email,
      `We updated your listing: ${args.title}`,
      `Our office made a change to "${args.title}".\n\nWhat changed: ${args.fields.join(", ")}.\n\nHave a look, and tell us if any of it is wrong:\n${siteUrl(env)}/g/experiences/${args.offeringId}`,
      { kind: "listing_edited" },
    );
  }
}

/**
 * The guide, told their listing is off the market and why.
 *
 * This is the one notification in the app that costs somebody money, so it
 * carries the actual reason rather than "there was a problem", and it ends
 * with the link to the page where they can fix it. A guide who finds out by
 * noticing the bookings stopped is a guide who leaves.
 */
export async function notifyListingPaused(
  env: Env,
  admin: SupabaseClient,
  args: { guideId: string; offeringId: string; title: string; reason: string },
) {
  const { data: g } = await admin
    .from("users")
    .select("phone, email")
    .eq("id", args.guideId)
    .maybeSingle();
  const url = `${siteUrl(env)}/g/experiences/${args.offeringId}`;
  await sendGuideSms(env, g?.phone, pauseSms(args.title, args.reason, url));
  if (g?.email) {
    await sendEmail(
      env,
      g.email,
      `We've paused your listing: ${args.title}`,
      `We have taken "${args.title}" off the marketplace for now. Nobody can book it until it goes back up.\n\nWhy:\n${args.reason}\n\nPut it right and tell us — we'll put it back:\n${url}\n\nIf you think this is a mistake, reply to this email and a person will read it.`,
      { kind: "listing_paused" },
    );
  }
}

/**
 * Back on the market — worth a word, because the guide was told it came down.
 */
export async function notifyListingLive(
  env: Env,
  admin: SupabaseClient,
  args: { guideId: string; offeringId: string; title: string },
) {
  const { data: g } = await admin
    .from("users")
    .select("phone, email")
    .eq("id", args.guideId)
    .maybeSingle();
  await sendGuideSms(
    env,
    g?.phone,
    `${SMS_PREFIX}: "${args.title.slice(0, 30)}" is back on the marketplace. People can book it again.`,
  );
  // `email` has been in that select since the function was written and was
  // never used — so the one notification that is good news arrived by a
  // channel that does not run, while the pause that cost them money did not.
  await sendEmail(
    env,
    g?.email,
    `Back on the marketplace: ${args.title}`,
    `"${args.title}" is live again. People can book it from now on.\n\n${siteUrl(env)}/g/experiences/${args.offeringId}`,
    { kind: "listing_live", userId: args.guideId, about: { type: "offering", id: args.offeringId } },
  );
}

/**
 * The first thing a new guide hears from us.
 *
 * Their application ends on a page saying "our team will review your licence",
 * and then nothing — no link, no account details, no idea that they can sign
 * in today and that the profile they write is what actually gets them booked.
 * Guides were being told to wait for a verification that only matters once
 * there is a profile behind it.
 *
 * Sent by email rather than SMS because it has to carry a URL and a list, and
 * because by this point we have an address they just signed up with.
 */
export async function notifyGuideWelcome(
  env: Env,
  args: { name: string; email: string; phone?: string | null },
) {
  const first = args.name.trim().split(/\s+/)[0] || "there";
  const site = siteUrl(env);
  await sendEmail(
    env,
    args.email,
    `Your ${BRAND} account is open — here's how to set it up`,
    [
      `${first}, your application is in. Your account is already open, so you can start now rather than waiting on us.`,
      ``,
      `SIGN IN`,
      `${site}/g/login`,
      `Use ${args.email} and the password you just chose.`,
      ``,
      `DO THESE FOUR THINGS — they are what get you booked`,
      `1. Add your photograph. A face gets more enquiries than anything else on the page.`,
      `2. Write your story in your own words. Not a CV — what a week with you is actually like.`,
      `3. Record a voice note. Thirty seconds. Trekkers play it before they book.`,
      `4. Add your first trip, with your own price. You set the rate and keep all of it; our 10% is added on top and paid by the trekker.`,
      ``,
      `WHAT WE ARE DOING MEANWHILE`,
      `We check your licence and your ID against the documents you sent, call your reference, and confirm your payout account. It usually takes a few days. We will message you the moment you are verified — that is when your profile goes live and trekkers can find you.`,
      ``,
      `If anything is wrong or you are stuck, just reply to this email.`,
    ].join("\n"),
    { kind: "guide_welcome" },
  );
  // A guide who gave a phone but rarely opens email still gets pointed at it.
  await sendGuideSms(
    env,
    args.phone,
    // One segment. The licence line moved to the welcome email, which has room.
    `${SMS_PREFIX}: your account is open. Sign in at ${site}/g/login and add your photo and story — that is what gets you booked.`,
  );
}

/**
 * The guide has proposed a different package.
 *
 * The email is the whole navigation: a trekker who is not sitting on the site
 * gets the change, the price and one button. Everything else about this flow
 * can be found from there.
 */
export async function notifyPackageProposed(
  env: Env,
  admin: SupabaseClient,
  args: { enquiryId?: string; conversationId?: string },
) {
  let q = admin
    .from("package_proposals")
    .select(
      "id, days, party_size, start_date, total_usd_cents, deposit_usd_cents, note, trekker_id, guide_id, enquiry_id, offering_id",
    )
    .eq("status", "proposed")
    .order("created_at", { ascending: false })
    .limit(1);
  q = args.enquiryId
    ? q.eq("enquiry_id", args.enquiryId)
    : q.eq("conversation_id", args.conversationId ?? "");
  const { data: p } = await q.maybeSingle();
  if (!p) return;

  const [{ data: trekker }, { data: guide }, { data: enq }] = await Promise.all([
    admin.from("users").select("email, full_name").eq("id", p.trekker_id).maybeSingle(),
    admin.from("users").select("full_name").eq("id", p.guide_id).maybeSingle(),
    // The trip's name, from the proposal itself or the enquiry behind it.
    p.offering_id
      ? admin.from("offerings").select("title").eq("id", p.offering_id).maybeSingle()
      : admin
          .from("enquiries")
          .select("offering:offerings(title)")
          .eq("id", p.enquiry_id ?? "")
          .maybeSingle(),
  ]);
  const site = siteUrl(env);
  const guideName = firstNameOf(guide?.full_name) || "Your guide";
  const title = (enq as any)?.title ?? (enq as any)?.offering?.title ?? "your trip";

  const { sendRichEmail } = await import("~/lib/notify.server");
  await sendRichEmail(env, admin, {
    kind: "package_proposed",
    to: trekker?.email,
    userId: p.trekker_id,
    subject: `${guideName} has suggested a change to ${title}`,
    category: "transactional",
    about: { type: "package_proposal", id: p.id },
    content: {
      preheader: `${p.days} days for ${p.party_size} — see what changed and approve it.`,
      heading: `${guideName} suggests a different trip`,
      blocks: [
        ...(p.note ? [{ p: `“${p.note}”` }] : []),
        {
          facts: [
            ["Trip", title],
            ["Starts", String(p.start_date)],
            ["Length", `${p.days} ${p.days === 1 ? "day" : "days"}`],
            ["People", String(p.party_size)],
            ["Whole trip", `$${(p.total_usd_cents / 100).toFixed(2)}`],
            ["Deposit to confirm", `$${(p.deposit_usd_cents / 100).toFixed(2)}`],
          ],
        },
        { p: "Nothing is booked and nothing is charged until you approve it." },
        { button: { label: "See it and decide", url: `${site}/proposals/${p.id}` } },
      ],
    },
  });
}

/** The trekker approved it — the guide needs to know the trip is on. */
export async function notifyProposalApproved(
  env: Env,
  admin: SupabaseClient,
  args: { proposalId: string; bookingId: string },
) {
  const { data: p } = await admin
    .from("package_proposals")
    .select("guide_id, days, party_size, start_date, total_usd_cents")
    .eq("id", args.proposalId)
    .maybeSingle();
  if (!p) return;
  const { data: g } = await admin
    .from("users")
    .select("phone, email, full_name")
    .eq("id", p.guide_id)
    .maybeSingle();

  // A guide is reached by SMS — this is the message that says a trip is real.
  await sendGuideSms(
    env,
    g?.phone,
    `${SMS_PREFIX}: they approved your ${p.days}-day plan for ${p.party_size} on ${p.start_date}. Deposit next — see your dashboard.`,
  );
  await sendEmail(
    env,
    g?.email,
    "They approved your plan",
    `Your ${p.days}-day plan for ${p.party_size} starting ${p.start_date} was approved. They pay the deposit next.\n${siteUrl(env)}/g/bookings`,
    { kind: "proposal_approved", userId: p.guide_id, about: { type: "booking", id: args.bookingId } },
  );
}

/** Local first-name helper — the display rule, without importing the route's. */
function firstNameOf(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "";
}

/* ── Things that end quietly ────────────────────────────────────────────── */

/** Everyone attached to an enquiry, for the messages that end one. */
async function enquiryContacts(admin: SupabaseClient, enquiryId: string) {
  const { data: e } = await admin
    .from("enquiries")
    .select(
      "id, start_date, party_size, guide_id, trekker:users!enquiries_trekker_id_fkey(id, email, full_name), guide:guides!enquiries_guide_id_fkey(slug, users(email, full_name)), offering:offerings(title, slug)",
    )
    .eq("id", enquiryId)
    .maybeSingle();
  if (!e) return null;
  return {
    startDate: (e as any).start_date as string,
    guideUserId: ((e as any).guide_id ?? null) as string | null,
    title: ((e as any).offering?.title ?? "your trip") as string,
    trekkerId: ((e as any).trekker?.id ?? null) as string | null,
    trekkerEmail: ((e as any).trekker?.email ?? null) as string | null,
    trekkerName: ((e as any).trekker?.full_name ?? "there") as string,
    guideEmail: ((e as any).guide?.users?.email ?? null) as string | null,
    guideName: ((e as any).guide?.users?.full_name ?? "your guide") as string,
  };
}

/**
 * Nobody answered in time.
 *
 * The expiry sweep has always done this silently: a trekker who asked a guide
 * to take them trekking simply never heard back, and had no way to tell a
 * request sitting in somebody's list from one that had quietly died. Telling
 * them is also the only chance to keep them — the message exists to point at
 * other guides while they still want to go.
 */
export async function notifyEnquiryExpired(env: Env, admin: SupabaseClient, enquiryId: string) {
  const c = await enquiryContacts(admin, enquiryId);
  if (!c) return;
  await sendEmail(
    env,
    c.trekkerEmail,
    `${c.guideName} did not answer in time`,
    `Your request to ${c.guideName} for ${c.title} on ${c.startDate} has expired — they did not answer within 24 hours.\n\n` +
      `That usually means they were on a trek and out of signal, not that they did not want the work.\n\n` +
      `Plenty of other guides walk this route, and most answer the same day:\n${siteUrl(env)}/guides`,
    { kind: "enquiry_expired", userId: c.trekkerId, about: { type: "enquiry", id: enquiryId } },
  );
}

/**
 * The guide said no.
 *
 * Declining sent nothing at all, so the trekker's list just went quiet and
 * they were left to work out for themselves whether to keep waiting.
 */
export async function notifyEnquiryDeclined(env: Env, admin: SupabaseClient, enquiryId: string) {
  const c = await enquiryContacts(admin, enquiryId);
  if (!c) return;
  await sendEmail(
    env,
    c.trekkerEmail,
    `${c.guideName} cannot take ${c.startDate}`,
    `${c.guideName} is not able to guide ${c.title} on ${c.startDate}.\n\n` +
      `Guides turn dates down for all sorts of reasons — usually another trek already in the diary.\n\n` +
      `Other guides walk this route and can take you:\n${siteUrl(env)}/guides`,
    { kind: "enquiry_declined", userId: c.trekkerId, about: { type: "enquiry", id: enquiryId } },
  );
}

/**
 * The 24-hour hold ran out before the deposit arrived.
 *
 * This is the most expensive silence in the sweep: a trekker whose guide said
 * yes, who did not pay in time, and who was told nothing by anybody. The dates
 * went back on the calendar and both sides found out by looking.
 */
export async function notifyHoldReleased(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await Promise.all([
    sendEmail(
      env,
      c.trekkerEmail,
      `Your dates for ${c.title} have been released`,
      `${c.guideName} held ${c.startDate} for you for 24 hours, and the deposit did not arrive, so those days have gone back on their calendar.\n\n` +
        `Nothing has been charged. If you still want to go, ask again — the dates may well still be free:\n${siteUrl(env)}/guides`,
      { kind: "hold_released", about: { type: "booking", id: bookingId } },
    ),
    sendEmail(
      env,
      c.guideEmail,
      `Dates free again: ${c.title}`,
      `${c.trekkerName} did not pay the deposit for ${c.title} within 24 hours, so ${c.startDate} is open in your calendar again.\n\n` +
        `Somebody else can book those days now:\n${siteUrl(env)}/g/bookings`,
      { kind: "hold_released_guide", userId: c.guideUserId, about: { type: "booking", id: bookingId } },
    ),
  ]);
}

/**
 * Somebody has been asked to come on a trip.
 *
 * The invite row has always been written with the address on it, and nothing
 * was ever sent to that address — the organiser was handed a link to copy and
 * paste somewhere else. So the platform knew who was invited and left the
 * telling to WhatsApp, which is exactly the kind of gap that makes a group
 * trip feel like a spreadsheet.
 *
 * Sent to somebody who may well have no account, so `userId` is deliberately
 * absent: the gate falls back to matching on the address, and no bell is
 * written for a person who cannot sign in to see it.
 */
export async function notifyGroupInvite(
  env: Env,
  admin: SupabaseClient,
  args: { groupId: string; email: string; invitedByName: string },
) {
  const { data: g } = await admin
    .from("trip_groups")
    .select("id, slug, name, start_date, offering:offerings(title)")
    .eq("id", args.groupId)
    .maybeSingle();
  if (!g) return;
  const trip = ((g as any).offering?.title ?? (g as any).name ?? "a trip") as string;
  const when = (g as any).start_date ? ` on ${(g as any).start_date}` : "";
  await sendEmail(
    env,
    args.email,
    `${args.invitedByName} invited you on ${trip}`,
    `${args.invitedByName} is putting together a group for ${trip}${when}, and has asked you along.\n\n` +
      `You can see the plan, who else is coming and what your share would be before you decide anything:\n` +
      `${siteUrl(env)}/groups/${(g as any).slug}\n\n` +
      `Nothing is booked in your name and nothing is charged until you say yes.`,
    { kind: "group_invite", about: { type: "trip_group", id: args.groupId } },
  );
}

/**
 * The money has actually left.
 *
 * `/ops/payouts` has been able to mark a batch paid since it was built, and
 * the guide was never told — the page's own comment notes twelve payouts
 * outstanding and none ever marked paid. This is the end of the only loop a
 * guide genuinely cares about, and it ran in silence.
 *
 * One email per guide per batch, not per booking: somebody owed for three
 * treks should be told once, with the three named.
 */
export async function notifyPayoutsSent(env: Env, admin: SupabaseClient, payoutIds: string[]) {
  if (!payoutIds.length) return;
  const { data: rows } = await admin
    .from("payouts")
    .select("id, guide_id, amount_npr_paisa, batch_ref, booking:bookings(start_date, offering:offerings(title))")
    .in("id", payoutIds);
  if (!rows?.length) return;

  const byGuide = new Map<string, { total: number; lines: string[]; ref: string | null }>();
  for (const r of rows as any[]) {
    if (!r.guide_id) continue;
    const g = byGuide.get(r.guide_id) ?? { total: 0, lines: [] as string[], ref: r.batch_ref ?? null };
    g.total += r.amount_npr_paisa ?? 0;
    const title = r.booking?.offering?.title ?? "a trip";
    g.lines.push(r.booking?.start_date ? `${title} (${r.booking.start_date})` : title);
    byGuide.set(r.guide_id, g);
  }

  const ids = [...byGuide.keys()];
  const { data: users } = await admin.from("users").select("id, email").in("id", ids);
  const emailOf = new Map((users ?? []).map((u: any) => [u.id, u.email]));

  for (const [guideId, g] of byGuide) {
    const rupees = (g.total / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
    await sendEmail(
      env,
      emailOf.get(guideId),
      `We have sent you NPR ${rupees}`,
      `Your payment has gone out to the account on file.\n\n` +
        `For:\n${g.lines.map((l) => `- ${l}`).join("\n")}\n\n` +
        `Total: NPR ${rupees}\n` +
        (g.ref ? `Reference: ${g.ref}\n` : "") +
        `\nBank transfers inside Nepal usually land the same day. If it has not arrived in two working days, reply to this email.\n\n` +
        `Your earnings: ${siteUrl(env)}/g/earnings`,
      { kind: "payout_sent", userId: guideId },
    );
  }
}

/**
 * A payment we tried to take did not go through.
 *
 * The single most expensive silence in the codebase. `runBalanceSweep` reads
 * `if (res.status === "succeeded")` and has no else; `sweepInstalments` reads
 * `if (res.status !== "succeeded") continue`. A declined card produced no
 * email, no bell, no log and no retry note — and the next thing that happened
 * to that trekker was their trip being cancelled at T-10 for non-payment,
 * with the deposit generally forfeit under the trekker band.
 *
 * Four days of silence, and then the trip is gone.
 *
 * The `kind` carries the day, for two reasons: each day's warning genuinely
 * is a different message as the deadline closes, and it makes `alreadySent`
 * a per-day guard, so a sweep run twice in one day says nothing twice.
 */
export async function notifyPaymentFailed(
  env: Env,
  admin: SupabaseClient,
  args: {
    bookingId: string;
    amountUsdCents: number;
    /** Days from today to departure. */
    daysUntil: number;
    /** Days from today to the automatic cancellation. */
    daysLeft: number;
    what: "balance" | "instalment";
  },
) {
  const c = await bookingContacts(admin, args.bookingId);
  if (!c || !c.trekkerId) return;

  const kind = `${args.what}_failed_t${Math.max(0, args.daysUntil)}`;
  const { alreadySent } = await import("~/lib/email/send.server");
  if (await alreadySent(admin, { userId: c.trekkerId, kind, subjectId: args.bookingId })) return;

  const amount = `$${(args.amountUsdCents / 100).toFixed(2)}`;
  const deadline =
    args.daysLeft <= 1
      ? "This is the last day before the booking is cancelled automatically."
      : `The booking is cancelled automatically in ${args.daysLeft} days if it stays unpaid.`;

  await sendEmail(
    env,
    c.trekkerEmail,
    args.what === "balance"
      ? `Your payment for ${c.title} did not go through`
      : `An instalment for ${c.title} did not go through`,
    `We tried to take ${amount} for ${c.title} (${c.startDate}) and your card was declined.\n\n` +
      `Nothing has been taken. This is almost always an expiry date, a spending limit, or a bank blocking a payment from abroad — a call to your bank usually settles it.\n\n` +
      `${deadline}\n\n` +
      `Sort it out here: ${siteUrl(env)}/trips/${args.bookingId}`,
    { kind, userId: c.trekkerId, about: { type: "booking", id: args.bookingId } },
  );
}

/**
 * The trek is under way.
 *
 * `active` and `completed` are, by the codebase's own note, "the two statuses
 * no event produces" — they are reached by a daily sweep noticing a date has
 * passed. So the morning a trek begins, and the day it ends, both went by
 * without a word to anyone.
 *
 * The trekker's version carries the thing that is genuinely useful on the
 * morning you set off: their guide's name and number, which unlocked at T-48h
 * and which nothing told them about either.
 */
export async function notifyTripStarted(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  const phone = c.guidePhone ? `\n${c.guideName}'s number: ${c.guidePhone}` : "";
  await Promise.all([
    sendEmail(
      env,
      c.trekkerEmail,
      `${c.title} starts today`,
      `Today is the day. ${c.guideName} is expecting you.${phone}\n\n` +
        `Everything about the trip — the plan, the meeting point, your permits — is here:\n${siteUrl(env)}/trips/${bookingId}\n\n` +
        `Walk well.`,
      { kind: "trip_started", userId: c.trekkerId, about: { type: "booking", id: bookingId } },
    ),
    sendEmail(
      env,
      c.guideEmail,
      `${c.title} starts today`,
      `${c.trekkerName} is with you from today on ${c.title}.\n\n` +
        `Please check in each day from the app — it is how the office knows everybody is well, and it is what we look at first if anything goes wrong:\n${siteUrl(env)}/g/checkin`,
      { kind: "trip_started_guide", userId: c.guideUserId, about: { type: "booking", id: bookingId } },
    ),
  ]);
}

/**
 * The trek is over.
 *
 * A review request existed only on the path where a trekker pressed "complete"
 * themselves. The sweep — which is how nearly every trip actually finishes —
 * created a recap and a payout row and told nobody anything. As
 * `review-prompt.ts` puts it: "nothing on this platform has ever asked for
 * one."
 *
 * Reviews are the whole proof mechanism of a guide-first marketplace, so this
 * is not a courtesy email.
 */
export async function notifyTripCompleted(env: Env, admin: SupabaseClient, bookingId: string) {
  const c = await bookingContacts(admin, bookingId);
  if (!c) return;
  await Promise.all([
    sendEmail(
      env,
      c.trekkerEmail,
      `How was ${c.title}?`,
      `You are back. We hope it was everything you went for.\n\n` +
        `${c.guideName} is judged by what the people they walked with say about them, and a trekker deciding whether to book them next month will read your words before anything else on the page.\n\n` +
        `It takes two minutes:\n${siteUrl(env)}/trips/${bookingId}\n\n` +
        `Neither of you sees the other's review until you have both written one, or two weeks have passed.`,
      { kind: "review_request", userId: c.trekkerId, about: { type: "booking", id: bookingId } },
    ),
    sendEmail(
      env,
      c.guideEmail,
      `${c.title} is finished — and your payment is queued`,
      `${c.trekkerName}'s trip is marked complete, so your payment is in the queue for the next batch.\n\n` +
        `Two things worth doing while it is fresh:\n` +
        `- Review ${c.trekkerName}. It helps the next guide they walk with.\n` +
        `- Put up a journal from the trip. It is the best advertising you have, and it stays on your profile.\n\n` +
        `${siteUrl(env)}/g/bookings`,
      { kind: "trip_completed_guide", userId: c.guideUserId, about: { type: "booking", id: bookingId } },
    ),
  ]);
}
