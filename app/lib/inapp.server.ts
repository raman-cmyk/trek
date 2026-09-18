import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationRow, recipientsFor, shouldNotifyInApp } from "~/lib/inapp";
import type { EmailContent } from "~/lib/email/render";

/**
 * Writing the in-app half of a notification.
 *
 * Called from the email path at the moment the message is composed, and
 * deliberately BEFORE the branch that needs an API key. The platform has never
 * successfully sent an email — every one of them is logged `skipped` — and a
 * trekker whose guide has just accepted should not have to find that out by
 * going and looking at My Trips.
 *
 * Never throws. A notification that fails must not take down the booking it
 * was telling somebody about, which is the same rule the email path already
 * follows.
 */
export async function recordInApp(
  admin: SupabaseClient,
  args: {
    kind: string;
    to: string | null | undefined;
    userId?: string | null;
    subject: string;
    content: EmailContent;
    category?: string;
    about?: { type: string; id: string };
  },
  siteUrl: string,
): Promise<void> {
  try {
    if (!shouldNotifyInApp(args.category, args.kind)) return;

    // Most callers pass an address rather than an id, so resolve it. A
    // stranger with no account — an enquiry from a lead — simply gets no
    // in-app notification, which is right: there is no app for them to see it
    // in.
    let userId = args.userId ?? null;
    if (!userId && args.to) {
      const { data } = await admin
        .from("users")
        .select("id")
        .eq("email", args.to)
        .maybeSingle();
      userId = data?.id ?? null;
    }
    if (!userId) return;

    const row = notificationRow({
      userId,
      kind: args.kind,
      title: args.subject,
      text: flatten(args.content),
      siteUrl,
      about: args.about,
    });
    if (!row) return;
    await admin.from("notifications").insert(row);
  } catch {
    /* an in-app notification is never worth failing the thing it describes */
  }
}

/**
 * The email's blocks as plain text, which is what the preview and the link are
 * read out of. Buttons carry the URL the email was written around, so they
 * count as text here even though a reader sees them as a button.
 */
function flatten(content: EmailContent): string {
  const out: string[] = [];
  for (const b of content.blocks ?? []) {
    const any = b as any;
    if (any.p) out.push(String(any.p));
    if (any.h) out.push(String(any.h));
    if (any.button?.url) out.push(String(any.button.url));
    if (any.list) out.push((any.list as string[]).join(". "));
    if (any.rows) {
      out.push(
        (any.rows as { label?: string; value?: string }[])
          .map((r) => [r.label, r.value].filter(Boolean).join(": "))
          .join(". "),
      );
    }
  }
  return out.join("\n");
}

/* ── Notifying without an email ─────────────────────────────────────────── */

/**
 * Tell one person one thing.
 *
 * Until now there was no way to do this. `recordInApp` above is the only
 * writer of the notifications table and it is reachable only from
 * `sendEmail` — so an in-app notification existed if and only if an email had
 * been composed. Since guides are deliberately reached by SMS ("many have no
 * email"), and SMS never goes near that path, guides were structurally starved
 * of the bell they were given: thirty-seven booking requests produced two
 * notifications in total.
 *
 * Deliberately NOT subject to `shouldNotifyInApp`. That predicate asks "should
 * this EMAIL also become a bell", and its `_ops` rule exists to stop mail
 * addressed to a shared inbox attaching itself to one office person's account.
 * Here a caller has named a person and a reason on purpose, which is a
 * different question with a different answer.
 *
 * There is no address, so the `no_address` gate that suppresses the email path
 * is not in this one at all.
 *
 * Never throws, same rule as `recordInApp`: a notification must not take down
 * the thing it was telling somebody about.
 */
export async function notifyInApp(
  admin: SupabaseClient,
  args: {
    userId: string;
    kind: string;
    title: string;
    body?: string | null;
    /** An in-app path. Off-site links are dropped. */
    href?: string | null;
    about?: { type: string; id: string };
  },
): Promise<boolean> {
  try {
    const row = notificationRow({
      userId: args.userId,
      kind: args.kind,
      title: args.title,
      text: args.body ?? null,
      href: args.href ?? null,
      about: args.about,
    });
    if (!row) return false;
    const { error } = await admin.from("notifications").insert(row);
    return !error;
  } catch {
    return false;
  }
}

/** Everyone on the office team. Deduped, and empty when there are none. */
export async function opsUserIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from("users").select("id").eq("role", "ops");
  return [...new Set((data ?? []).map((u: { id: string }) => u.id))];
}

/**
 * Tell the office one thing. Returns how many people were told.
 *
 * One row each rather than one shared row, because the bell is per person and
 * `notifications_own_read` is already exactly the right policy for that — an
 * `is_ops()` read policy would let one office person read another's bell,
 * which nobody asked for.
 *
 * Nobody on the ops team is a fact, not an error: a fresh install must not
 * fail to cancel a booking because no admin has been made yet. It is logged,
 * because on this deployment there are two, so zero means somebody's role
 * changed and the log line is the only thing that will ever say so.
 */
export async function notifyOpsInApp(
  admin: SupabaseClient,
  args: {
    kind: string;
    title: string;
    body?: string | null;
    /** The /ops path. Callers get it from `opsHref`. */
    href: string | null;
    about?: { type: string; id: string };
    /** Ids already told about this under another hat — a guide who is also ops. */
    exclude?: string[];
  },
): Promise<number> {
  const all = await opsUserIds(admin);
  const to = recipientsFor(all, args.exclude ?? []);
  if (to.length === 0) {
    console.log(`[notify] nobody on the ops team to tell about ${args.kind}`);
    return 0;
  }
  let told = 0;
  for (const userId of to) {
    // One at a time: a single multi-row insert is fewer round trips and loses
    // the whole batch to one bad row.
    if (await notifyInApp(admin, { ...args, userId })) told++;
  }
  return told;
}
