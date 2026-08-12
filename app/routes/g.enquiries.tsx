import { Form, data } from "react-router";
import type { Route } from "./+types/g.enquiries";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { firstName } from "~/lib/names";
import { Button } from "~/components/Button";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { data: enquiries } = await admin
    .from("enquiries")
    .select(
      "id, start_date, party_size, message, status, expires_at, trekker:users(full_name, country_code), offering:offerings(title)",
    )
    .eq("guide_id", user.id)
    .eq("status", "open")
    .order("expires_at");
  return data({ enquiries: enquiries ?? [] }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const id = String(form.get("id"));
  const decision = String(form.get("decision")); // 'accepted' | 'declined'

  if (decision === "accepted") {
    // Create the booking (pending_deposit), hold the calendar, quote via pricing.
    const { acceptEnquiry } = await import("~/lib/booking.server");
    const bookingId = await acceptEnquiry(admin, id, user.id);
    if (!bookingId) {
      // Race: expired or already handled — never a silent fake success.
      return data({ error: "This request has expired or was already handled." }, { status: 409, headers });
    }
    // Tell the trekker to come pay the deposit.
    const { notifyEnquiryAccepted } = await import("~/lib/notifications.server");
    await notifyEnquiryAccepted(env, admin, bookingId);
  } else {
    await admin
      .from("enquiries")
      .update({ status: "declined" })
      .eq("id", id)
      .eq("guide_id", user.id)
      .eq("status", "open");
  }
  return data({ ok: true }, { headers });
}

export default function GuideEnquiries({ loaderData, actionData }: Route.ComponentProps) {
  const enquiries = loaderData.enquiries as any[];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-ink">Enquiries</h1>
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded-card bg-ember/10 p-3 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}
      {enquiries.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-6 text-center text-sm text-ink-soft">
          No new enquiries right now. Most guides get their first within 2 weeks —
          keep your calendar open and your profile fresh.
        </div>
      ) : (
        <ul className="space-y-3">
          {enquiries.map((e) => (
            <li key={e.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">
                  {firstName(e.trekker?.full_name)}
                  {e.trekker?.country_code ? ` · ${e.trekker.country_code}` : ""}
                </p>
                <span className="text-xs text-ink-soft">{e.party_size}p</span>
              </div>
              <p className="text-sm text-ink-soft">{e.offering?.title}</p>
              <p className="text-sm text-ink-soft">Start {e.start_date}</p>
              {e.message && (
                <p className="mt-2 rounded-md bg-surface p-2 text-sm text-ink">
                  “{e.message}”
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Form method="post" className="flex-1">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="decision" value="accepted" />
                  <Button type="submit" className="w-full">
                    Accept
                  </Button>
                </Form>
                <Form method="post" className="flex-1">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="decision" value="declined" />
                  <Button type="submit" variant="secondary" className="w-full">
                    Decline
                  </Button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
