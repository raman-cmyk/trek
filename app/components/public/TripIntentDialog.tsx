import { useEffect, useState } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";
import { Sheet } from "~/components/Sheet";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";
import {
  SEASONS,
  intentSummary,
  monthsLabel,
  type IntentMode,
  type TripIntentDraft,
} from "~/lib/trip-intent";

/**
 * "When are you planning your Nepal trip?" — three seconds after they land.
 *
 * The bet: somebody who has just arrived on a trekking site has a rough
 * answer to this question in their head already, and asking while it is
 * there costs them one tap. Asking later, on a booking form, costs them a
 * decision they were not ready to make.
 *
 * All three answers are real buttons, and this is the whole design:
 *
 *   "I know my dates"   →  take them, show who is free.
 *   "Sometime in ___"   →  a season is an answer. Most people have this one.
 *   "Just looking"      →  also an answer. A popup that will not let you say
 *                          "I don't know" teaches people to type a date they
 *                          made up, and then we plan around fiction.
 *
 * It appears once per browser, never to somebody signed in, never on a
 * checkout or account page, and it is dismissible with Escape, the backdrop
 * and an X. It rides on the existing Sheet, which already does the focus
 * trap, the reduced-motion path and the mobile bottom-sheet presentation —
 * there is one transient surface on this site and this is not a second one.
 */

const SEEN_KEY = "gon.trip-intent.v1";
const DELAY_MS = 3000;

/** Pages where an interruption would be rude or actively harmful. */
const QUIET_PREFIXES = [
  "/book",
  "/trips",
  "/checkout",
  "/pay",
  "/login",
  "/signup",
  "/g/",
  "/ops",
  "/apply",
  "/reset",
  "/forgot",
  "/notifications",
  "/suspended",
];

export function TripIntentDialog({ signedIn }: { signedIn: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const fetcher = useFetcher<{
    ok: boolean;
    summary?: string;
    next?: string;
    existing?: boolean;
    problems?: { field: string; message: string }[];
  }>();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<IntentMode | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [season, setSeason] = useState("");
  const [email, setEmail] = useState("");

  const quiet = QUIET_PREFIXES.some((p) => location.pathname.startsWith(p));

  // Three seconds, once, and only for a stranger on a browsing page.
  useEffect(() => {
    if (signedIn || quiet) return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) !== null;
    } catch {
      // Private mode, or storage blocked. Treat it as "already seen" rather
      // than showing the same popup on every page of their visit.
      seen = true;
    }
    if (seen) return;
    const t = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [signedIn, quiet]);

  const remember = () => {
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      /* Nothing to do — worst case they see it once more on another device. */
    }
  };

  const close = () => {
    remember();
    setOpen(false);
  };

  const done = fetcher.data?.ok === true;
  const problems = fetcher.data?.problems ?? [];
  const problem = (field: string) => problems.find((p) => p.field === field)?.message;
  const busy = fetcher.state !== "idle";

  // Once it has worked, the answer is kept — reopening to ask again would be
  // the most annoying possible behaviour.
  useEffect(() => {
    if (done) remember();
  }, [done]);

  const draft: TripIntentDraft = {
    mode: mode ?? "unsure",
    start,
    end,
    season,
    email,
  };

  return (
    <Sheet open={open} onClose={close} title={done ? "Saved" : "When are you thinking of coming?"}>
      {done ? (
        <div className="p-5 sm:p-6">
          <p className="text-lg font-medium text-ink">
            {fetcher.data?.summary ?? "Your trip is saved."}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {fetcher.data?.existing
              ? "You already have an account with us — we've added this trip to it."
              : "We've made you an account and emailed you a link to open it. No password to choose."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const next = fetcher.data?.next ?? "/guides";
                close();
                navigate(next);
              }}
            >
              Meet the guides
            </Button>
            <Button variant="ghost" onClick={close}>
              Keep looking around
            </Button>
          </div>
        </div>
      ) : (
        <fetcher.Form method="post" action="/api/trip-intent" className="p-5 sm:p-6">
          <input type="hidden" name="sourcePath" value={location.pathname} />
          <input type="hidden" name="mode" value={mode ?? ""} />

          <p className="text-sm text-ink-soft">
            Nepal has seasons, and the good guides get booked out in them. No
            dates needed if you don't have them yet.
          </p>

          {/* Step one: which kind of visitor are you. */}
          <div className="mt-4 grid gap-2">
            <Choice
              checked={mode === "dates"}
              onPick={() => setMode("dates")}
              title="I know my dates"
              sub="Show me who's free then"
            />
            <Choice
              checked={mode === "season"}
              onPick={() => setMode("season")}
              title="I know roughly the season"
              sub="Autumn, next spring, that sort of thing"
            />
            <Choice
              checked={mode === "unsure"}
              onPick={() => setMode("unsure")}
              title="No idea yet — just looking"
              sub="Perfectly normal. Most people start here."
            />
          </div>
          {problem("mode") && <Problem>{problem("mode")}</Problem>}

          {/* Step two: only the follow-up their answer actually needs. */}
          {mode === "dates" && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label mb-1 block">Arrive</span>
                <input
                  type="date"
                  name="start"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-moss focus:ring-3 focus:ring-moss/25"
                />
              </label>
              <label className="block">
                <span className="label mb-1 block">Leave</span>
                <input
                  type="date"
                  name="end"
                  value={end}
                  min={start || undefined}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-moss focus:ring-3 focus:ring-moss/25"
                />
              </label>
            </div>
          )}
          {problem("dates") && <Problem>{problem("dates")}</Problem>}

          {mode === "season" && (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-2">
                {SEASONS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSeason(s.key)}
                    aria-pressed={season === s.key}
                    className={cn(
                      "rounded-card border px-3 py-2 text-left transition",
                      season === s.key
                        ? "border-pine bg-mist"
                        : "border-line hover:border-pine/40",
                    )}
                  >
                    <span className="block text-sm font-medium text-ink">{s.label}</span>
                    <span className="block text-caption text-muted">{monthsLabel(s)}</span>
                  </button>
                ))}
              </div>
              {/* One note, for the season they actually picked. Four
                  descriptions at once is a wall nobody reads, and it pushed
                  the submit button below the fold. */}
              {season && (
                <p className="mt-2 text-caption text-muted">
                  {SEASONS.find((s) => s.key === season)?.note}
                </p>
              )}
              <input type="hidden" name="season" value={season} />
            </div>
          )}
          {problem("season") && <Problem>{problem("season")}</Problem>}

          {/* Step three: the email, and what it buys them, said plainly. */}
          {mode && (
            <div className="mt-5">
              <label className="block">
                <span className="label mb-1 block">Your email</span>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-moss focus:ring-3 focus:ring-moss/25"
                />
              </label>
              {problem("email") && <Problem>{problem("email")}</Problem>}
              <p className="mt-2 text-caption text-muted">
                We'll save <strong className="font-medium text-ink-soft">{intentSummary(draft)}</strong>{" "}
                and set up your account — no password to pick. No newsletter,
                and we never pass your address to anyone.
              </p>
            </div>
          )}

          {/* Sticky, because on a short laptop the form is taller than the
              sheet and a primary action you have to go looking for is a
              primary action people do not press. */}
          <div className="sticky bottom-0 -mx-5 -mb-6 mt-5 flex flex-wrap items-center gap-2 border-t border-line bg-card px-5 py-3 sm:-mx-6 sm:px-6">
            <Button type="submit" disabled={!mode} loading={busy} loadingText="Saving…">
              Save my trip
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              Not now
            </Button>
          </div>
        </fetcher.Form>
      )}
    </Sheet>
  );
}

function Choice({
  checked,
  onPick,
  title,
  sub,
}: {
  checked: boolean;
  onPick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={checked}
      className={cn(
        "flex items-center gap-3 rounded-card border p-3 text-left transition",
        checked ? "border-pine bg-mist" : "border-line hover:border-pine/40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
          checked ? "border-pine" : "border-line",
        )}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-pine" />}
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-caption text-muted">{sub}</span>
      </span>
    </button>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 text-caption text-ember">
      {children}
    </p>
  );
}
