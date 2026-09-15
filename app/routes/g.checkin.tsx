import { Form, Link, data, useNavigation } from "react-router";
import { activeTripHref } from "~/lib/active-trip";
import type { Route } from "./+types/g.checkin";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { Badge } from "~/components/ops/ui";
import { fmtDate, fmtDateRange } from "~/lib/format";
import { firstName } from "~/lib/names";
import {
  canRecord,
  checkinIsDue,
  dayLabel,
  missingDays,
  needsClosing,
  trekDay,
} from "~/lib/checkin";

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
      "id, status, start_date, end_date, party_size, trekker:users!bookings_trekker_id_fkey(full_name), offering:offerings(title, kind)",
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
      // The days with nothing against them. Not a score — a list of things
      // still to write up, which is what a guide can actually act on once
      // they have signal again.
      // Today is already the big button above, so what is left here is the
      // backlog: the days that went by out of signal.
      toFill: missingDays(b.start_date, b.end_date, today, done).filter((d) => d !== today),
    };
  });

  return data({ trips }, { headers });
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

  // Which day is being written up. Defaults to today, but any day of the trek
  // that has already happened can be filled in: guides are out of signal for
  // days at a time, and a record that can only be written on the day is a
  // record with holes in it that nobody can ever close.
  const day = String(form.get("day") ?? today).slice(0, 10);
  if (!canRecord(b.start_date, b.end_date, today, day)) {
    return data(
      { error: "That is not a day of this trek." },
      { status: 400, headers },
    );
  }

  const note = String(form.get("note") ?? "").trim().slice(0, 280) || null;
  await admin
    .from("checkins")
    .upsert(
      { booking_id: b.id, day, method: "app", note },
      { onConflict: "booking_id,day" },
    );
  const which = trekDay(b.start_date, b.end_date, day);
  return data(
    { ok: day === today ? `Sent — day ${which.day}.` : `Day ${which.day} filled in.` },
    { headers },
  );
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
          fine. Nothing to send on the days you are not walking — and if you
          were out of signal, fill those days in when you get back down.
        </p>
      </div>

      {actionData && "ok" in (actionData as any) && (
        <p className="rounded-photo bg-mist p-3 text-sm text-moss">{(actionData as any).ok}</p>
      )}
      {actionData && "error" in (actionData as any) && (
        <p role="alert" className="rounded-photo bg-danger/5 p-3 text-sm text-danger">
          {(actionData as any).error}
        </p>
      )}

      {trips.length === 0 && (
        <p className="rounded-photo border border-border bg-card p-4 text-sm text-ink-soft">
          No trek running. This page wakes up on the morning your next one
          starts.
        </p>
      )}

      {[...due, ...rest].map((t: any) => (
        <section key={t.id} className="rounded-photo border border-border bg-card p-4">
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
                the app keeps counting days that are not happening — and any
                days still to fill in stay fillable below.
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
                className="w-full rounded-photo bg-chartreuse px-6 py-4 text-lg font-medium text-pine shadow-card hover:brightness-[0.97] active:scale-[0.98]"
                disabled={busy}
              >
                {/* Not the badge's wording: "last day — day 15" twice over
                    reads like a stutter on a button. */}
                Everyone is safe —{" "}
                {t.window.lastDay ? "last day" : `day ${t.window.day}`}
              </button>
            </Form>
          )}

          {/* Out of signal for four days is the normal condition of the job,
              not a failure — so the days with nothing against them are a list
              of things to write up, not a score. They stay fillable until the
              trek is closed. */}
          {t.toFill.length > 0 && (
            <details className="mt-3 border-t border-border pt-3">
              <summary className="cursor-pointer text-sm text-ink">
                {t.toFill.length} day{t.toFill.length === 1 ? "" : "s"} still to fill in
                <span className="ml-1 text-ink-soft">— no signal is fine, just say so</span>
              </summary>
              <ul className="mt-2 divide-y divide-border border-t border-border">
                {t.toFill.map((d: string) => (
                  <li key={d} className="py-2">
                    {/* The date and the button share a line; the note gets its
                        own, because on a 360px phone three things in a row
                        leaves the note a sliver nobody can type into. */}
                    <Form method="post" className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="intent" value="checkin" />
                      <input type="hidden" name="booking_id" value={t.id} />
                      <input type="hidden" name="day" value={d} />
                      <span className="text-sm text-ink-soft">{fmtDate(d)}</span>
                      <button
                        disabled={busy}
                        className="ml-auto rounded-button border border-border px-3 py-2 text-sm text-ink hover:bg-mist"
                      >
                        All was well
                      </button>
                      <input
                        name="note"
                        maxLength={280}
                        placeholder="Anything to note (optional)"
                        className="w-full basis-full rounded-button border border-border bg-paper px-3 py-2 text-base text-ink outline-none focus:border-primary"
                      />
                    </Form>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {t.recent.length > 0 && (
            <p className="mt-3 font-mono text-caption text-ink-soft">
              Last sent: {t.recent.map((d: string) => fmtDate(d)).join(" · ")}
            </p>
          )}

          {/* Name the booking. Every one of these links used to point at a
              bare /g/active, so a guide with three open treks got the same
              one whichever they tapped — and that page carries a party's
              emergency contact. */}
          {t.window.where === "on" && (
            <Link
              to={activeTripHref(t.id)}
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
