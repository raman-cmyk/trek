import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/g.checkin";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { Badge } from "~/components/ops/ui";
import { fmtDate, fmtDateRange } from "~/lib/format";
import { firstName } from "~/lib/names";
import { checkinIsDue, dayLabel, needsClosing, trekDay } from "~/lib/checkin";

export function meta() {
  return [{ title: "Daily safety update" }, { name: "robots", content: "noindex" }];
}

/**
 * The daily safety update, on a screen of its own.
 *
 * It used to be a button at the bottom of the home page, under the earnings
 * and the setup checklist, and a second copy on the active-trip screen. The
 * one thing on this platform that somebody in Kathmandu is waiting for every
 * evening was the least findable thing in the app.
 *
 * Two rules, both from the founder and both correcting real behaviour:
 *   - Day 1 is the day the trek starts and the last day is the day it ends.
 *     The home screen was saying "day 34" of a fourteen-day trek, because it
 *     counted days since the start date and nothing stopped it.
 *   - It is not every day. Only during a trek. Before one there is nothing to
 *     report, and after one the guide is home — an app that keeps asking is
 *     an app whose asking means nothing.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const today = new Date().toISOString().slice(0, 10);

  // Every trek of theirs that is running or has run and not been closed.
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, party_size, trekker:users(full_name), offering:offerings(title, kind)",
    )
    .eq("guide_id", user.id)
    .in("status", ["active", "confirmed"])
    .order("start_date");

  const ids = (bookings ?? []).map((b: any) => b.id);
  const { data: checkins } = ids.length
    ? await admin
        .from("checkins")
        .select("booking_id, day, received_at")
        .in("booking_id", ids)
        .order("day", { ascending: false })
    : { data: [] as any[] };

  const daysByBooking: Record<string, string[]> = {};
  for (const c of checkins ?? []) (daysByBooking[c.booking_id] ??= []).push(c.day);

  const trips = (bookings ?? []).map((b: any) => {
    const window = trekDay(b.start_date, b.end_date, today);
    const done = daysByBooking[b.id] ?? [];
    return {
      id: b.id,
      title: b.offering?.title ?? "Your trek",
      trekker: firstName(b.trekker?.full_name),
      startDate: b.start_date,
      endDate: b.end_date,
      partySize: b.party_size,
      status: b.status,
      window,
      label: dayLabel(window),
      checkedInToday: done.includes(today),
      due: checkinIsDue(window, done.includes(today)),
      closeUp: needsClosing(window, b.status),
      // The last few, so a guide can see the office has them.
      recent: done.slice(0, 5),
      missed:
        window.where === "on"
          ? Math.max(0, window.day - done.filter((d) => d <= today).length)
          : 0,
    };
  });

  return data({ trips, today }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const bookingId = String(form.get("booking_id") ?? "");
  const intent = String(form.get("intent") ?? "checkin");
  const today = new Date().toISOString().slice(0, 10);

  const { data: b } = await admin
    .from("bookings")
    .select("id, status, start_date, end_date")
    .eq("id", bookingId)
    .eq("guide_id", user.id)
    .maybeSingle();
  if (!b) return data({ error: "Not your trek." }, { status: 403, headers });

  const window = trekDay(b.start_date, b.end_date, today);

  if (intent === "close") {
    // The guide is the person who knows first that everyone is down. The
    // trekker's own "we're back" still exists; this stops a finished trek
    // sitting open for a month, asking for check-ins nobody owes.
    if (!needsClosing(window, b.status)) {
      return data({ error: "That trek is not finished yet." }, { status: 400, headers });
    }
    const deleteAfter = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    await admin
      .from("bookings")
      .update({ status: "completed", completed_confirmed_at: new Date().toISOString() })
      .eq("id", b.id)
      .eq("status", "active");
    await admin.from("booking_documents").update({ delete_after: deleteAfter }).eq("booking_id", b.id);
    const { createRecap } = await import("~/lib/reviews.server");
    const { createPayoutForBooking } = await import("~/lib/booking.server");
    await createRecap(admin, b.id);
    await createPayoutForBooking(admin, b.id);
    return data({ ok: "Closed. Your payout is queued." }, { headers });
  }

  if (window.where !== "on") {
    return data(
      { error: "There is no update to send today — you are not on the trail." },
      { status: 400, headers },
    );
  }

  const note = String(form.get("note") ?? "").trim().slice(0, 280) || null;
  await admin
    .from("checkins")
    .upsert(
      { booking_id: b.id, day: today, method: "app", note },
      { onConflict: "booking_id,day" },
    );
  return data({ ok: `Sent — day ${window.day}.` }, { headers });
}

export default function GuideCheckin({ loaderData, actionData }: Route.ComponentProps) {
  const { trips } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const due = trips.filter((t: any) => t.due || t.closeUp);
  const rest = trips.filter((t: any) => !t.due && !t.closeUp);

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="font-display text-2xl text-ink">Daily safety update</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          One tap a day while you are on a trek, so the office knows everyone is
          fine. Nothing to send on the days you are not walking.
        </p>
      </div>

      {actionData && "ok" in (actionData as any) && (
        <p className="rounded-card bg-mist p-3 text-sm text-moss">{(actionData as any).ok}</p>
      )}
      {actionData && "error" in (actionData as any) && (
        <p role="alert" className="rounded-card bg-danger/5 p-3 text-sm text-danger">
          {(actionData as any).error}
        </p>
      )}

      {trips.length === 0 && (
        <p className="rounded-card border border-border bg-card p-4 text-sm text-ink-soft">
          No trek running. This page wakes up on the morning your next one
          starts.
        </p>
      )}

      {[...due, ...rest].map((t: any) => (
        <section key={t.id} className="rounded-card border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-ink">{t.title}</p>
            <Badge
              tone={
                t.window.where === "on" ? (t.checkedInToday ? "green" : "amber") : "neutral"
              }
            >
              {t.label}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-ink-soft">
            {t.trekker} · {t.partySize}p · {fmtDateRange(t.startDate, t.endDate)}
          </p>

          {t.closeUp ? (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-sm text-ink">
                This trek finished on {fmtDate(t.endDate)} and is still open.
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">
                Close it and your payout goes into the next batch. Until then
                the app keeps counting days that are not happening.
              </p>
              <Form method="post" className="mt-2">
                <input type="hidden" name="intent" value="close" />
                <input type="hidden" name="booking_id" value={t.id} />
                <Button type="submit" size="sm" loading={busy}>
                  We are back — close it
                </Button>
              </Form>
            </div>
          ) : t.window.where === "before" ? (
            <p className="mt-3 border-t border-border pt-3 text-sm text-ink-soft">
              Nothing to send yet. The first update is due on{" "}
              {fmtDate(t.startDate)}, the day you set off.
            </p>
          ) : t.checkedInToday ? (
            <p className="mt-3 border-t border-border pt-3 text-sm text-moss">
              Sent for today. See you tomorrow.
            </p>
          ) : (
            <Form method="post" className="mt-3 space-y-2 border-t border-border pt-3">
              <input type="hidden" name="intent" value="checkin" />
              <input type="hidden" name="booking_id" value={t.id} />
              <input
                name="note"
                maxLength={280}
                placeholder="Anything the office should know (optional)"
                className="w-full rounded-button border border-border bg-paper px-3 py-2 text-base text-ink outline-none focus:border-primary"
              />
              <button
                className="w-full rounded-card bg-pine px-6 py-4 text-lg font-medium text-paper hover:bg-moss"
                disabled={busy}
              >
                {/* Not the badge's wording: "last day — day 15" twice over
                    reads like a stutter on a button. */}
                Everyone is safe —{" "}
                {t.window.lastDay ? "last day" : `day ${t.window.day}`}
              </button>
            </Form>
          )}

          {t.recent.length > 0 && (
            <p className="mt-3 font-mono text-caption text-ink-soft">
              Last sent: {t.recent.map((d: string) => fmtDate(d)).join(" · ")}
            </p>
          )}

          {t.window.where === "on" && (
            <Link
              to="/g/active"
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              Open the trek →
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}
