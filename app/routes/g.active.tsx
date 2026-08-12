import { Link, data } from "react-router";
import type { Route } from "./+types/g.active";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { fmtDate } from "~/lib/format";
import { firstName } from "~/lib/names";
import { cn } from "~/lib/cn";

/**
 * The trek that is happening right now — the guide's operations screen.
 *
 * On the trail a guide needs exactly four things from a phone: what day it
 * is, where today goes, who to call, and the one button that tells the
 * office everyone is fine. This screen is those four things and nothing
 * else, with the check-in at the bottom where a thumb ends up.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const today = new Date().toISOString().slice(0, 10);

  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, start_date, end_date, party_size, trekker:users(full_name, phone), offering:offerings(title, itinerary, route:routes(day_stops))",
    )
    .eq("guide_id", user.id)
    .eq("status", "active")
    .order("start_date")
    .limit(1)
    .maybeSingle();

  let checkedInToday = false;
  if (b) {
    const { data: ci } = await admin
      .from("checkins")
      .select("id")
      .eq("booking_id", b.id)
      .eq("day", today)
      .maybeSingle();
    checkedInToday = !!ci;
  }
  return data({ booking: b, today, checkedInToday }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const bookingId = String(form.get("booking_id"));
  const { data: b } = await admin
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .eq("guide_id", user.id)
    .maybeSingle();
  if (b) {
    await admin
      .from("checkins")
      .upsert(
        { booking_id: b.id, day: new Date().toISOString().slice(0, 10), method: "app" },
        { onConflict: "booking_id,day" },
      );
  }
  return data({ ok: true }, { headers });
}

export default function GuideActive({ loaderData }: Route.ComponentProps) {
  const { booking: b, today, checkedInToday } = loaderData as any;

  if (!b) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-2xl text-ink">On the trail</h1>
        <p className="text-sm text-ink-soft">
          Nothing active today. When a trek starts, this screen becomes its
          control room — the day, the plan, and the check-in.
        </p>
        <Link to="/g/bookings" className="text-sm text-primary hover:underline">
          Your trips →
        </Link>
      </div>
    );
  }

  const dayNum = Math.max(
    1,
    Math.round((Date.parse(today) - Date.parse(b.start_date)) / 86400000) + 1,
  );
  const total =
    Math.round((Date.parse(b.end_date) - Date.parse(b.start_date)) / 86400000) + 1;
  const stops = (b.offering?.route?.day_stops ?? []) as Array<{
    day: number;
    place: string;
    altitude_m: number;
    note?: string;
  }>;

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="font-display text-2xl text-ink">{b.offering?.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Day <span className="font-mono text-ink">{dayNum}</span> of{" "}
          <span className="font-mono text-ink">{total}</span> ·{" "}
          {firstName(b.trekker?.full_name)} · {b.party_size}p ·{" "}
          {fmtDate(b.start_date)} → {fmtDate(b.end_date)}
        </p>
      </div>

      {stops.length > 0 && (
        <ol className="space-y-1.5">
          {stops.map((s) => {
            const state = s.day < dayNum ? "done" : s.day === dayNum ? "today" : "ahead";
            return (
              <li
                key={s.day}
                className={cn(
                  "flex items-baseline gap-3 rounded-card border p-3",
                  state === "today"
                    ? "border-moss/60 bg-mist"
                    : state === "done"
                      ? "border-border bg-card opacity-55"
                      : "border-border bg-card",
                )}
              >
                <span className="w-14 shrink-0 font-mono text-xs text-ink-soft">
                  Day {s.day}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", state === "today" ? "font-semibold text-ink" : "text-ink")}>
                    {s.place}
                    <span className="ml-2 font-mono text-xs text-ink-soft">
                      {s.altitude_m.toLocaleString("en-US")} m
                    </span>
                  </span>
                  {state === "today" && s.note && (
                    <span className="mt-0.5 block text-xs text-ink-soft">{s.note}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="rounded-card border border-border bg-card p-4 text-sm">
        <p className="font-medium text-ink">If something goes wrong</p>
        <p className="mt-1 text-ink-soft">
          Message the office from any signal — we watch this trek daily. For a
          medical emergency, rescue first, message second.
        </p>
        <Link to="/g/messages" className="mt-2 inline-block text-primary hover:underline">
          Message the office →
        </Link>
      </div>

      {/* The one button, at the bottom, where the thumb is. */}
      {checkedInToday ? (
        <p className="rounded-card bg-mist p-4 text-center text-sm text-ink">
          Checked in for day {dayNum} — the office knows you&rsquo;re fine. See
          you tomorrow.
        </p>
      ) : (
        <form method="post">
          <input type="hidden" name="booking_id" value={b.id} />
          <button className="w-full rounded-card bg-pine px-6 py-4 text-lg font-medium text-paper hover:bg-moss">
            I&rsquo;m safe — day {dayNum}
          </button>
        </form>
      )}
    </div>
  );
}
