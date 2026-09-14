import { redirect } from "react-router";
import type { Route } from "./+types/conversations";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, ensureTrekkerProfile } from "~/lib/auth.server";
import { findOrCreateConversation } from "~/lib/conversations.server";

function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

// POST { guide_id, offering_id?, next } → open (or resume) the pre-booking chat.
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user } = await getSessionUser(request, env);
  const form = await request.formData();
  const guideId = String(form.get("guide_id") ?? "");
  const offeringId = form.get("offering_id") ? String(form.get("offering_id")) : null;
  const back = safeNext(String(form.get("next") ?? "/"));
  // Dates picked on the guide's calendar, carried into the thread as a draft
  // rather than sent. What you say to a guide is yours to edit — we write the
  // dates so nobody has to retype them, and they press send.
  const ask = String(form.get("ask") ?? "").trim().slice(0, 300);

  if (!user) throw redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!guideId || guideId === user.id) throw redirect(back); // can't message yourself

  await ensureTrekkerProfile(env, user); // first-time trekkers get a profile
  const admin = createAdminClient(env);
  const id = await findOrCreateConversation(admin, user.id, guideId, offeringId);
  const to = id
    ? `/messages/c/${id}${ask ? `?ask=${encodeURIComponent(ask)}` : ""}`
    : back;
  throw redirect(to);
}

export function loader() {
  return redirect("/");
}
