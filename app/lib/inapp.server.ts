import type { SupabaseClient } from "@supabase/supabase-js";
import { hrefFromBody, previewOf, shouldNotifyInApp } from "~/lib/inapp";
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

    const text = flatten(args.content);
    await admin.from("notifications").insert({
      user_id: userId,
      kind: args.kind,
      title: args.subject.slice(0, 200),
      body: previewOf(text),
      href: hrefFromBody(text, siteUrl),
      about_type: args.about?.type ?? null,
      about_id: args.about?.id ?? null,
    });
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
