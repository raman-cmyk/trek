import { data, redirect } from "react-router";
import type { Route } from "./+types/enquiry";
import { getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { submitEnquiry } from "~/lib/enquiry.server";
import { packPending } from "~/lib/pending-enquiry";
import { parkedCookie } from "~/lib/pending-enquiry.server";

// Action-only route: a trekker sends an enquiry from an offering page.
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const form = await request.formData();

  const returnTo = String(form.get("return_to") ?? "/");
  // The optional lines they ticked. Parsed defensively — it arrives as JSON in
  // a form field — and capped, because it is a list of ids, not an essay.
  let selectedOptions: string[] = [];
  try {
    const raw = JSON.parse(String(form.get("selected_options") ?? "[]"));
    if (Array.isArray(raw)) {
      selectedOptions = raw
        .filter((v) => typeof v === "string")
        .map((v: string) => v.slice(0, 60))
        .slice(0, 20);
    }
  } catch {
    // A malformed list is not a reason to lose the enquiry.
  }

  const fields = {
    offeringId: String(form.get("offering_id")),
    guideId: String(form.get("guide_id")),
    startDate: String(form.get("start_date")),
    partySize: Number(form.get("party_size") ?? 1),
    message: String(form.get("message") ?? "").trim() || null,
    arrivalDate: String(form.get("arrival_date") ?? "").trim() || null,
    selectedOptions,
  };

  if (!user) {
    // Park the request, then sign them in, then send it.
    //
    // This used to redirect to the login page and throw the request away: the
    // trekker came back to an empty form and had to pick the date, the party
    // size and the extras again. On a phone, where the form is a bottom sheet
    // that closes behind them, the tap looked like it had done nothing at all.
    const payload = packPending({ ...fields, returnTo });
    const cookie = await parkedCookie(env, payload);
    const out = new Headers(headers);
    out.append("Set-Cookie", cookie);
    out.set("Location", "/login?next=%2Fenquiry%2Fresume");
    return new Response(null, { status: 302, headers: out });
  }

  // Only trekkers send enquiries.
  const profile = await getProfile(env, user.id);
  if (profile?.role && profile.role !== "trekker") {
    return data({ error: "Only trekker accounts can book." }, { status: 403 });
  }

  const { createAdminClient } = await import("~/lib/supabase.server");
  const result = await submitEnquiry(env, createAdminClient(env), user.id, fields);
  if (!result.ok) {
    return data({ error: result.error }, { status: result.status, headers });
  }
  return data({ ok: true, enquiryId: result.enquiryId }, { headers });
}
