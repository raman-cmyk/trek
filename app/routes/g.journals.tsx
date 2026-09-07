import { useState } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/g.journals";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { journalableBookings, uniqueSlug, validateDraft } from "~/lib/journals.server";
import { fmtDate } from "~/lib/format";
import { cn } from "~/lib/cn";

/**
 * A guide's own journals. Plain words, big targets, two taps to start one —
 * this gets used standing in a lodge on a phone, not at a desk.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const [{ data: journals }, bookings, { data: routes }] = await Promise.all([
    admin
      .from("journals")
      .select("id, slug, title, status, start_date, end_date, pre_platform")
      .eq("guide_id", user.id)
      .order("start_date", { ascending: false }),
    journalableBookings(admin, user.id),
    // For a trek that was not booked here, the route is how the write-up
    // still connects to the rest of the site.
    admin
      .from("routes")
      .select("id, name")
      .or(`status.eq.live,created_by_guide_id.eq.${user.id}`)
      .order("name"),
  ]);
  return data({ journals: journals ?? [], bookings, routes: routes ?? [] }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();

  // A trek this guide led that we did not arrange. The schema always allowed
  // it (0032's pre_platform); nothing ever offered it, so a guide with fifteen
  // years behind them and no bookings here had nothing to write.
  if (String(form.get("source") ?? "") === "own") {
    const title = String(form.get("title") ?? "").trim();
    const startDate = String(form.get("start_date") ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return data({ error: "Add the day you set off." }, { status: 400, headers });
    }
    if (startDate > new Date().toISOString().slice(0, 10)) {
      return data({ error: "That day is in the future — write it up afterwards." }, { status: 400, headers });
    }
    const routeId = String(form.get("route_id") ?? "").trim() || null;
    const draft = {
      guide_id: user.id,
      title: title || "A trek",
      start_date: startDate,
      // The end date follows the days as they are written (syncJournalDates).
      end_date: startDate,
      route_id: routeId,
      booking_id: null,
      pre_platform: true,
      pre_platform_note: String(form.get("note") ?? "").trim().slice(0, 200) || null,
    };
    const bad = validateDraft(draft);
    if (bad) return data({ error: bad }, { status: 400, headers });

    const slug = await uniqueSlug(admin, draft.title, draft.start_date);
    const { data: made, error: err } = await admin
      .from("journals")
      .insert({ ...draft, slug })
      .select("id")
      .single();
    if (err) return data({ error: err.message }, { status: 400, headers });
    return redirect(`/g/journals/${made.id}`, { headers });
  }

  const bookingId = String(form.get("booking_id") ?? "");
  if (!bookingId) {
    return data({ error: "Pick which trek this was." }, { status: 400, headers });
  }
  const { data: b } = await admin
    .from("bookings")
    .select("id, start_date, end_date, guide_id, offering:offerings(title, route_id)")
    .eq("id", bookingId)
    .eq("guide_id", user.id)
    .maybeSingle();
  if (!b) return data({ error: "That trek isn't yours." }, { status: 400, headers });

  const draft = {
    guide_id: user.id,
    title: String(form.get("title") ?? "").trim() || (b as any).offering?.title || "A trek",
    start_date: b.start_date,
    end_date: b.end_date,
    route_id: (b as any).offering?.route_id ?? null,
    booking_id: b.id,
  };
  const bad = validateDraft(draft);
  if (bad) return data({ error: bad }, { status: 400, headers });

  const slug = await uniqueSlug(admin, draft.title, draft.start_date);
  const { data: created, error } = await admin
    .from("journals")
    .insert({ ...draft, slug })
    .select("id")
    .single();
  if (error) return data({ error: error.message }, { status: 400, headers });
  return redirect(`/g/journals/${created.id}`, { headers });
}

export default function GuideJournals({ loaderData, actionData }: Route.ComponentProps) {
  const { journals, bookings, routes } = loaderData as any;
  const nav = useNavigation();
  const cls = "mt-1 w-full rounded border border-line px-3 py-2.5 text-base";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Your treks, written up</h1>
        <p className="mt-1 max-w-[46ch] text-sm text-ink-soft">
          Each finished trek can become a page with your photos and your words.
          This is what makes people choose you.
        </p>
      </div>

      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      <WriteUp bookings={bookings} routes={routes} busy={nav.state !== "idle"} cls={cls} />

      <section className="space-y-2">
        {journals.map((j: any) => (
          <Link
            key={j.id}
            to={`/g/journals/${j.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-line bg-card p-3.5 hover:border-sage"
          >
            <span className="min-w-0">
              <span className="block font-medium text-ink">{j.title}</span>
              <span className="block font-mono text-xs text-muted">
                {fmtDate(j.start_date)}
                {j.pre_platform && " · your own trek"}
              </span>
            </span>
            <span
              className={
                j.status === "published"
                  ? "shrink-0 rounded-pill bg-mist px-2.5 py-1 text-xs text-moss"
                  : "shrink-0 rounded-pill bg-wheat/40 px-2.5 py-1 text-xs text-ink"
              }
            >
              {j.status === "published" ? "live" : "draft"}
            </span>
          </Link>
        ))}
        {journals.length === 0 && (
          <p className="text-sm text-muted">Nothing written up yet.</p>
        )}
      </section>
    </div>
  );
}

/**
 * The two ways a trek gets written up.
 *
 * One is a trek we arranged: pick it from the list, and the dates and route
 * come with it. The other is a trek the guide led another way — before they
 * joined, or for somebody who found them directly — which the schema has
 * always allowed and nothing ever offered. A guide who joined last week has
 * only the second kind, and it is the one thing that would make a trekker
 * choose them.
 *
 * Closed by default on the first tab, because most write-ups are of trips we
 * arranged and that path stays two taps.
 */
function WriteUp({
  bookings,
  routes,
  busy,
  cls,
}: {
  bookings: any[];
  routes: Array<{ id: string; name: string }>;
  busy: boolean;
  cls: string;
}) {
  const [own, setOwn] = useState(bookings.length === 0);

  return (
    <div className="rounded-md border border-line bg-card p-4">
      <p className="text-sm font-medium text-ink">Write up a trek</p>

      <div className="mt-3 flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!own}
          onClick={() => setOwn(false)}
          disabled={bookings.length === 0}
          className={cn(
            "flex-1 rounded-button border px-3 py-2 text-sm",
            !own ? "border-moss bg-mist font-medium text-moss" : "border-line text-ink-soft",
            bookings.length === 0 && "opacity-40",
          )}
        >
          A trek from Trek
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={own}
          onClick={() => setOwn(true)}
          className={cn(
            "flex-1 rounded-button border px-3 py-2 text-sm",
            own ? "border-moss bg-mist font-medium text-moss" : "border-line text-ink-soft",
          )}
        >
          One of your own
        </button>
      </div>

      {own ? (
        <Form method="post" className="mt-3 space-y-3">
          <input type="hidden" name="source" value="own" />
          <p className="text-sm text-ink-soft">
            A trek you led another way — before you joined, or for somebody who
            found you directly. It goes on your page marked as your own trek, so
            nobody is told we arranged it.
          </p>
          <label className="block text-sm text-ink-soft">
            Title
            <input name="title" className={cls} placeholder="Manaslu in late October" required />
          </label>
          <label className="block text-sm text-ink-soft">
            The day you set off
            <input type="date" name="start_date" className={cls} required />
          </label>
          <label className="block text-sm text-ink-soft">
            Which route (if it was one of these)
            <select name="route_id" className={cls}>
              <option value="">— not listed —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-ink-soft">
            Anything the office should know (optional)
            <input
              name="note"
              maxLength={200}
              className={cls}
              placeholder="Led for a Dutch family who came through a friend."
            />
          </label>
          <Button type="submit" loading={busy}>
            Start writing
          </Button>
        </Form>
      ) : (
        <Form method="post" className="mt-3 space-y-3">
          <label className="block text-sm text-ink-soft">
            Which one?
            <select name="booking_id" className={cls} required>
              <option value="">— pick a finished trek —</option>
              {bookings.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {fmtDate(b.start_date)} · {b.offering?.title ?? "trek"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-ink-soft">
            Title (you can change it later)
            <input name="title" className={cls} placeholder="Manaslu in late October" />
          </label>
          <Button type="submit" loading={busy}>
            Start writing
          </Button>
        </Form>
      )}
    </div>
  );
}
