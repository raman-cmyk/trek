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
      `Trek: deposit paid for ${c.title}, ${c.startDate}. The trip is on — see your dashboard.`,
    ),
    sendEmail(
      env,
      c.trekkerEmail,
      "Deposit received — you're booked",
      `Your deposit for ${c.title} is in. Next: upload documents and check your trip page.\n${env.SITE_URL}/trips/${bookingId}`,
      { kind: "deposit_paid", about: { type: "booking", id: bookingId } },
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
      { kind: "new_message" },
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
    { kind: "instalment_charged" },
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
    { kind: "balance_charged" },
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
      { kind: "booking_cancelled", about: { type: "booking", id: bookingId } },
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
    `Trek: our office updated "${args.title}" (${what}). See it: ${env.SITE_URL}/g/experiences/${args.offeringId}`,
  );
  if (g?.email) {
    await sendEmail(
      env,
      g.email,
      `We updated your listing: ${args.title}`,
      `Our office made a change to "${args.title}".\n\nWhat changed: ${args.fields.join(", ")}.\n\nHave a look, and tell us if any of it is wrong:\n${env.SITE_URL}/g/experiences/${args.offeringId}`,
      { kind: "listing_edited" },
    );
  }
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
  const site = env.SITE_URL ?? "";
  await sendEmail(
    env,
    args.email,
    "Your Trek account is open — here's how to set it up",
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
    `Trek: your account is open. Sign in at ${site}/g/login and add your photo and story — that is what gets you booked. We are checking your licence now.`,
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
  args: { enquiryId: string },
) {
  const { data: p } = await admin
    .from("package_proposals")
    .select(
      "id, days, party_size, start_date, total_usd_cents, deposit_usd_cents, note, trekker_id, guide_id",
    )
    .eq("enquiry_id", args.enquiryId)
    .eq("status", "proposed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!p) return;

  const [{ data: trekker }, { data: guide }, { data: enq }] = await Promise.all([
    admin.from("users").select("email, full_name").eq("id", p.trekker_id).maybeSingle(),
    admin.from("users").select("full_name").eq("id", p.guide_id).maybeSingle(),
    admin
      .from("enquiries")
      .select("offering:offerings(title)")
      .eq("id", args.enquiryId)
      .maybeSingle(),
  ]);
  const site = (env.SITE_URL ?? "https://guidesofnepal.com").replace(/\/$/, "");
  const guideName = firstNameOf(guide?.full_name) || "Your guide";
  const title = (enq as any)?.offering?.title ?? "your trip";

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
    `Trek: they approved your ${p.days}-day plan for ${p.party_size} on ${p.start_date}. Deposit next — see your dashboard.`,
  );
  await sendEmail(
    env,
    g?.email,
    "They approved your plan",
    `Your ${p.days}-day plan for ${p.party_size} starting ${p.start_date} was approved. They pay the deposit next.\n${(env.SITE_URL ?? "").replace(/\/$/, "")}/g/bookings`,
    { kind: "proposal_approved", userId: p.guide_id, about: { type: "booking", id: args.bookingId } },
  );
}

/** Local first-name helper — the display rule, without importing the route's. */
function firstNameOf(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "";
}
