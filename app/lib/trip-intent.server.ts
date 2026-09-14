import { createAdminClient } from "~/lib/supabase.server";
import { sendEmail } from "~/lib/notify.server";
import {
  cleanPartySize,
  intentSummary,
  intentWindow,
  normaliseEmail,
  seasonByKey,
  validateIntent,
  type TripIntentDraft,
} from "~/lib/trip-intent";

/**
 * Take the answer, keep the lead, and give them an account without making
 * them fill in a second form.
 *
 * "Get their email, we auto create their account, super easy onboarding."
 * The order matters and it is the opposite of the obvious one: the intent row
 * is written FIRST and everything after it is allowed to fail. Creating an
 * auth user can fail for a dozen reasons we do not control, and a visitor who
 * told us they are coming to Nepal in October is worth keeping whether or not
 * Supabase Auth was having a good afternoon.
 *
 * The account is created without a password and without a confirmed email.
 * Nobody is signed in by this — a person could type a stranger's address into
 * a popup, and an account you can use because somebody else typed your email
 * is not an account, it is a hole. What they get is a row and a link in their
 * inbox; clicking the link is what proves the address.
 */
export interface IntentResult {
  ok: boolean;
  /** Field-level problems, for redisplay. */
  problems?: { field: string; message: string }[];
  /** What we understood, read back to them. */
  summary?: string;
  /** Where to send them next. */
  next?: string;
  /** True when this email already had an account — we do not touch it. */
  existing?: boolean;
  /** True when the account was made here. */
  created?: boolean;
}

export async function recordTripIntent(
  env: Env,
  draft: TripIntentDraft,
  meta: { sourcePath?: string | null; referrer?: string | null } = {},
  now: Date = new Date(),
): Promise<IntentResult> {
  const problems = validateIntent(draft);
  if (problems.length) return { ok: false, problems };

  const email = normaliseEmail(draft.email);
  const admin = createAdminClient(env);
  const window = intentWindow(draft, now);
  const summary = intentSummary(draft, now);

  // 1. The lead, first and unconditionally.
  const { data: intent, error: intentError } = await admin
    .from("trip_intents")
    .insert({
      email,
      mode: draft.mode,
      start_date: draft.mode === "dates" ? (draft.start ?? null) : null,
      end_date: draft.mode === "dates" ? (draft.end ?? null) : null,
      season: draft.mode === "season" ? (seasonByKey(draft.season ?? "")?.key ?? null) : null,
      party_size: cleanPartySize(draft.partySize),
      source_path: meta.sourcePath ?? null,
      referrer: meta.referrer ?? null,
    })
    .select("id")
    .single();

  if (intentError) {
    // Nothing else is worth attempting if we could not even keep the answer.
    return {
      ok: false,
      problems: [{ field: "email", message: "We could not save that — try once more?" }],
    };
  }

  // 2. The account. Best effort, and its failure never fails the answer.
  let userId: string | null = null;
  let created = false;
  let existing = false;
  try {
    const found = await findUserByEmail(admin, email);
    if (found) {
      userId = found;
      existing = true;
    } else {
      const { data: madeUser, error: makeError } = await admin.auth.admin.createUser({
        email,
        // Not confirmed: the address is unproven until they click the link.
        email_confirm: false,
        user_metadata: { source: "trip_intent", trip: summary },
      });
      if (!makeError && madeUser?.user) {
        userId = madeUser.user.id;
        created = true;
        // The profile row every other screen expects to exist.
        await admin.from("users").upsert(
          {
            id: userId,
            role: "trekker",
            email,
            full_name: email.split("@")[0],
          },
          { onConflict: "id" },
        );
      }
    }
  } catch {
    /* A lead without an account is still a lead. */
  }

  if (userId) await admin.from("trip_intents").update({ user_id: userId }).eq("id", intent.id);

  // 3. Tell them. sendEmail also writes the in-app notification, so this
  //    lands somewhere real even while RESEND_API_KEY is unset — which it
  //    has been for the whole life of this platform so far.
  const link = await signInLink(admin, env, email);
  try {
    await sendEmail(
      env,
      email,
      `Your Nepal trip: ${summary}`,
      [
        `We have your trip saved: ${summary}.`,
        window.exact
          ? "Next step is the part nobody else lets you do — pick the guide, not the agency."
          : "No dates needed yet. Have a look at who walks these trails and keep the ones you like.",
        link
          ? `Open your account: ${link}`
          : `Browse guides: ${env.SITE_URL ?? ""}${browseSuffix(window)}`,
      ].join("\n\n"),
      { kind: "trip_intent_welcome", userId },
    );
    await admin
      .from("trip_intents")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("id", intent.id);
  } catch {
    /* Unwelcomed leads are findable by the partial index on welcomed_at. */
  }

  return {
    ok: true,
    summary,
    next: browseSuffix(window),
    existing,
    created,
  };
}

function browseSuffix(window: { start: string; end: string }): string {
  return `/guides?from=${window.start}&to=${window.end}`;
}

/**
 * Does this address already have an account?
 *
 * Asked against our own users table rather than by paging Auth: the admin
 * list endpoint has no email filter, so the honest version of that question
 * is "fetch every user and look", which gets slower every week. A trekker
 * always has a row here, written at signup.
 */
async function findUserByEmail(admin: any, email: string): Promise<string | null> {
  const { data } = await admin
    .from("users")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * A one-click way back in, if Supabase will mint one.
 *
 * A magic link is the whole "super easy onboarding" promise: no password
 * chosen at a popup, no second form, the click itself confirms the address.
 * If generating it fails we fall back to a plain browse link rather than
 * sending an email with a dead button in it.
 */
async function signInLink(admin: any, env: Env, email: string): Promise<string | null> {
  const site = env.SITE_URL?.replace(/\/$/, "") ?? "";
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${site}/trips` },
    });
    if (error) return null;
    return data?.properties?.action_link ?? null;
  } catch {
    return null;
  }
}
