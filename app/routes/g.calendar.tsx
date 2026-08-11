import { useFetcher, data } from "react-router";
import type { Route } from "./+types/g.calendar";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { cn } from "~/lib/cn";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await admin
    .from("availability")
    .select("day, status")
    .eq("guide_id", user.id)
    .gte("day", today)
    .order("day");
  const anchor = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`;
  return data({ rows: rows ?? [], anchor, todayIso: today }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const day = String(form.get("day"));
  const next = String(form.get("next"));
  const today = new Date().toISOString().slice(0, 10);
  // Server-side guards (the UI disables these, but never trust the form):
  // only open/blocked are settable, never in the past, and a held/booked day
  // is a trekker's money — it cannot be flipped from here.
  if (!["open", "blocked"].includes(next) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today) {
    return data({ ok: false }, { status: 400, headers });
  }
  const { data: existing } = await admin
    .from("availability")
    .select("status")
    .eq("guide_id", user.id)
    .eq("day", day)
    .maybeSingle();
  if (existing && !["open", "blocked"].includes(existing.status)) {
    return data({ ok: false }, { status: 409, headers });
  }
  await admin
    .from("availability")
    .upsert(
      { guide_id: user.id, day, status: next },
      { onConflict: "guide_id,day" },
    );
  return data({ ok: true }, { headers });
}

export default function GuideCalendar({ loaderData }: Route.ComponentProps) {
  const { rows, anchor, todayIso } = loaderData as { rows: any[]; anchor: string; todayIso: string };
  const fetcher = useFetcher();
  const map = new Map<string, string>(rows.map((r) => [r.day, r.status]));

  // Optimistic toggle reflected immediately.
  if (fetcher.formData) {
    const d = String(fetcher.formData.get("day"));
    const n = String(fetcher.formData.get("next"));
    map.set(d, n);
  }

  const [y0, m0] = anchor.split("-").map(Number);
  const months = [0, 1, 2].map((off) => {
    const dt = new Date(Date.UTC(y0, m0 - 1 + off, 1));
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Calendar</h1>
        <p className="text-sm text-ink-soft">Tap a day to block or open it.</p>
      </div>
      {months.map(({ year, month }) => {
        const first = new Date(Date.UTC(year, month, 1));
        const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const lead = first.getUTCDay();
        return (
          <div key={`${year}-${month}`}>
            <p className="mb-2 text-sm font-medium">
              {first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
            </p>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i} className="text-ink-soft">{d}</span>
              ))}
              {Array.from({ length: lead }).map((_, i) => (
                <span key={`l${i}`} />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                const st = map.get(iso) ?? "open";
                const past = iso < todayIso;
                const locked = st === "held" || st === "booked" || past;
                const booked = st === "held" || st === "booked";
                const blocked = st === "blocked";
                return (
                  <fetcher.Form method="post" key={iso}>
                    <input type="hidden" name="day" value={iso} />
                    <input type="hidden" name="next" value={blocked ? "open" : "blocked"} />
                    <button
                      type="submit"
                      disabled={locked}
                      className={cn(
                        "w-full rounded py-2",
                        booked
                          // Booked/held days are money — distinct from blocked.
                          ? "bg-primary/20 font-medium text-primary"
                          : past
                            ? "bg-transparent text-ink-soft/40"
                            : blocked
                              ? "bg-ink-soft/15 text-ink-soft line-through"
                              : "bg-accent/10 font-medium text-accent",
                      )}
                    >
                      {i + 1}
                    </button>
                  </fetcher.Form>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-ink-soft">
        Green = open for bookings · struck through = you blocked it ·{" "}
        <span className="text-primary">highlighted</span> = a trekker booked you (can't be changed
        here) · faded = past.
      </p>
    </div>
  );
}
