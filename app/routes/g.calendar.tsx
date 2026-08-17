import { useState } from "react";
import { useFetcher, data } from "react-router";
import type { Route } from "./+types/g.calendar";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { cn } from "~/lib/cn";
import { fmtDate } from "~/lib/format";

/** A year is as far ahead as anyone books a trek, and further than any guide
    plans. Twelve months, one scroll, no paging controls to learn. */
const MONTHS_SHOWN = 12;

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Every day from a to b inclusive, as ISO strings. */
function span(a: string, b: string): string[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  const d = new Date(lo + "T00:00:00Z");
  const end = new Date(hi + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

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
  const now = new Date();
  const anchor = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return data({ rows: rows ?? [], anchor, todayIso: today }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const next = String(form.get("next"));
  const today = new Date().toISOString().slice(0, 10);

  // One day or a run of them — blocking a fortnight away was fourteen
  // round trips before, which on a phone in a lodge is how a calendar stops
  // being kept at all.
  const from = String(form.get("from") ?? form.get("day") ?? "");
  const to = String(form.get("to") ?? from);
  const dateish = /^\d{4}-\d{2}-\d{2}$/;
  if (!["open", "blocked"].includes(next) || !dateish.test(from) || !dateish.test(to)) {
    return data({ ok: false, error: "That didn't look like a date." }, { status: 400, headers });
  }
  const days = span(from, to).filter((d) => d >= today);
  if (!days.length) {
    return data({ ok: false, error: "Those days have already been." }, { status: 400, headers });
  }
  if (days.length > 400) {
    return data({ ok: false, error: "That's too long a stretch at once." }, { status: 400, headers });
  }

  // A held or booked day is a trekker's money. Those are skipped rather than
  // refused, so blocking a month around a booking does the sane thing instead
  // of failing on the one day in the middle.
  const { data: taken } = await admin
    .from("availability")
    .select("day, status")
    .eq("guide_id", user.id)
    .in("day", days);
  const locked = new Set(
    (taken ?? []).filter((r) => !["open", "blocked"].includes(r.status)).map((r) => r.day),
  );
  const settable = days.filter((d) => !locked.has(d));
  if (!settable.length) {
    return data(
      { ok: false, error: "Every one of those days is already booked." },
      { status: 409, headers },
    );
  }

  await admin
    .from("availability")
    .upsert(
      settable.map((day) => ({ guide_id: user.id, day, status: next })),
      { onConflict: "guide_id,day" },
    );
  return data(
    {
      ok: true,
      changed: settable.length,
      skipped: locked.size,
      next,
    },
    { headers },
  );
}

type DayState = "past" | "booked" | "blocked" | "open";

export default function GuideCalendar({ loaderData }: Route.ComponentProps) {
  const { rows, anchor, todayIso } = loaderData as {
    rows: any[];
    anchor: string;
    todayIso: string;
  };
  const fetcher = useFetcher<{
    ok: boolean;
    changed?: number;
    skipped?: number;
    next?: string;
    error?: string;
  }>();
  const [pick, setPick] = useState<{ from: string; to: string } | null>(null);

  const map = new Map<string, string>(rows.map((r) => [r.day, r.status]));
  // Optimistic: the days in flight already look the way they will land.
  if (fetcher.formData) {
    const f = String(fetcher.formData.get("from") ?? "");
    const t = String(fetcher.formData.get("to") ?? f);
    const n = String(fetcher.formData.get("next"));
    if (f) for (const d of span(f, t)) if (!["held", "booked"].includes(map.get(d) ?? "")) map.set(d, n);
  }

  const stateOf = (day: string): DayState => {
    if (day < todayIso) return "past";
    const st = map.get(day);
    if (st === "held" || st === "booked") return "booked";
    if (st === "blocked") return "blocked";
    return "open";
  };

  const [y0, m0] = anchor.split("-").map(Number);
  const months = Array.from({ length: MONTHS_SHOWN }, (_, off) => {
    const dt = new Date(Date.UTC(y0, m0 - 1 + off, 1));
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() };
  });

  /** First tap sets the start; second closes the range. */
  function tap(day: string) {
    if (!pick || pick.from !== pick.to) setPick({ from: day, to: day });
    else setPick({ from: pick.from, to: day });
  }

  const chosen = pick ? span(pick.from, pick.to) : [];
  const chosenSet = new Set(chosen);
  const settable = chosen.filter((d) => stateOf(d) !== "booked" && stateOf(d) !== "past");

  const submit = (next: "open" | "blocked") => {
    if (!pick) return;
    const [from, to] = pick.from <= pick.to ? [pick.from, pick.to] : [pick.to, pick.from];
    fetcher.submit({ from, to, next }, { method: "post" });
    setPick(null);
  };

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="font-display text-2xl text-ink">Calendar</h1>
        <p className="text-sm text-ink-soft">
          Tap a day. Tap a second day to take the whole stretch between them.
        </p>
      </div>

      {/* The legend belongs at the top. It used to sit under twelve weeks of
          grid, behind the tab bar, where nobody read it. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink-soft">
        <Key className="bg-card ring-1 ring-inset ring-border">Free to book</Key>
        <Key className="bg-ink-soft/20 text-ink-soft line-through">You blocked it</Key>
        <Key className="bg-primary text-white">Booked — can't change</Key>
      </ul>

      {fetcher.data?.error && (
        <p className="rounded-button bg-ember/10 px-3 py-2 text-sm text-ember">
          {fetcher.data.error}
        </p>
      )}
      {fetcher.data?.ok && fetcher.data.changed ? (
        <p className="rounded-button bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {fetcher.data.changed} {fetcher.data.changed === 1 ? "day" : "days"}{" "}
          {fetcher.data.next === "blocked" ? "blocked" : "opened"}
          {fetcher.data.skipped
            ? ` · ${fetcher.data.skipped} left alone because they're booked`
            : ""}
          .
        </p>
      ) : null}

      {months.map(({ year, month }) => {
        const first = new Date(Date.UTC(year, month, 1));
        const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const lead = first.getUTCDay();
        // A month entirely in the past is noise on a phone.
        if (iso(year, month, days) < todayIso) return null;
        return (
          <section key={`${year}-${month}`}>
            <h2 className="mb-1.5 text-sm font-medium text-ink">
              {first.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </h2>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i} className="pb-0.5 text-ink-soft">
                  {d}
                </span>
              ))}
              {Array.from({ length: lead }).map((_, i) => (
                <span key={`l${i}`} />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const day = iso(year, month, i + 1);
                const st = stateOf(day);
                const picked = chosenSet.has(day);
                const isStart = pick && day === pick.from;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={st === "past" || st === "booked"}
                    onClick={() => tap(day)}
                    aria-pressed={picked}
                    aria-label={`${fmtDate(day)} — ${
                      st === "booked"
                        ? "booked, cannot change"
                        : st === "blocked"
                          ? "you blocked it"
                          : st === "past"
                            ? "in the past"
                            : "free to book"
                    }`}
                    className={cn(
                      "relative w-full rounded py-2 tabular-nums transition-colors",
                      st === "past" && "text-ink-soft/35",
                      // Booked is the loudest thing on the grid: it is money,
                      // and it is the one state a guide must never misread.
                      st === "booked" && "bg-primary font-semibold text-white",
                      st === "blocked" && "bg-ink-soft/20 text-ink-soft line-through",
                      st === "open" && "bg-card text-ink ring-1 ring-inset ring-border",
                      picked && st !== "booked" && st !== "past" && "ring-2 ring-accent",
                      isStart && "ring-2 ring-moss",
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* The action bar appears only once something is chosen, and says what
          will happen to how many days before it happens. */}
      {pick && (
        <div className="sticky bottom-16 z-20 rounded-card border border-border bg-card p-3 shadow-lift">
          <p className="text-sm text-ink">
            {pick.from === pick.to ? (
              <>
                <span className="font-medium">{fmtDate(pick.from)}</span> — tap another day for a
                stretch
              </>
            ) : (
              <>
                <span className="font-medium">
                  {fmtDate(pick.from <= pick.to ? pick.from : pick.to)}
                </span>{" "}
                to{" "}
                <span className="font-medium">
                  {fmtDate(pick.from <= pick.to ? pick.to : pick.from)}
                </span>{" "}
                · <span className="font-mono">{settable.length}</span>{" "}
                {settable.length === 1 ? "day" : "days"}
              </>
            )}
          </p>
          {/* Both actions, always. Inferring one from whether the stretch
              happened to contain a free day meant the same gesture did
              different things on different weeks — the guide had to work out
              what the app had decided before they could use it. */}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => submit("blocked")}
              disabled={!settable.length || fetcher.state !== "idle"}
              className="flex-1 rounded-button bg-pine px-3 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
            >
              Block
            </button>
            <button
              type="button"
              onClick={() => submit("open")}
              disabled={!settable.length || fetcher.state !== "idle"}
              className="flex-1 rounded-button border border-moss px-3 py-2.5 text-sm font-medium text-moss disabled:opacity-50"
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setPick(null)}
              className="rounded-button border border-border px-3 py-2.5 text-sm text-ink"
            >
              Cancel
            </button>
          </div>
          {chosen.length !== settable.length && (
            <p className="mt-1.5 text-caption text-ink-soft">
              {chosen.length - settable.length} booked or past{" "}
              {chosen.length - settable.length === 1 ? "day is" : "days are"} left alone.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Key({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("inline-block h-4 w-6 rounded", className)} />
      {children}
    </li>
  );
}
