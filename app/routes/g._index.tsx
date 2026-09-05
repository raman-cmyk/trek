import { Link, data } from "react-router";
import type { Route } from "./+types/g._index";
import { getEnv } from "~/lib/supabase.server";
import {
  CHECK_STATUS_LABELS,
  checkLabel,
  type CheckStatus,
} from "~/lib/guide-checks";
import { requireUser } from "~/lib/auth.server";
import { cn } from "~/lib/cn";
import { CheckinButton } from "~/components/guide/CheckinButton";
import { formatNpr } from "~/lib/pricing";
import { fmtDate } from "~/lib/format";
import { firstName } from "~/lib/names";


export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, profile, admin, headers } = await requireUser(request, env, "guide");
  const today = new Date().toISOString().slice(0, 10);

  const { data: guide } = await admin
    .from("guides")
    .select("status, tier, guide_verifications(check_type, status)")
    .eq("user_id", user.id)
    .single();

  let active: any = null;
  let nextBooking: any = null;
  let enquiries = 0;
  let unansweredQuestions = 0;
  let checkedInToday = false;
  let work: { openDays: number; unrepliedReviews: number; responseMins: number | null } | null =
    null;

  if (guide?.status === "verified") {
    const [{ data: act }, { data: next }, { count }] = await Promise.all([
      admin
        .from("bookings")
        .select("id, start_date, offering:offerings(title)")
        .eq("guide_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      admin
        .from("bookings")
        .select("id, start_date, status, offering:offerings(title), trekker:users(full_name)")
        .eq("guide_id", user.id)
        .in("status", ["deposit_paid", "docs_pending", "confirmed"])
        .gte("start_date", today)
        .order("start_date")
        .limit(1)
        .maybeSingle(),
      admin
        .from("enquiries")
        .select("id", { count: "exact", head: true })
        .eq("guide_id", user.id)
        .eq("status", "open"),
    ]);
    active = act;
    nextBooking = next;
    enquiries = count ?? 0;
    // People waiting on a public answer. Surfaced on Home rather than as a
    // sixth tab — five is the 360px ceiling for the bar.
    const { count: qCount } = await admin
      .from("guide_questions")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", user.id)
      .eq("status", "pending");
    unansweredQuestions = qCount ?? 0;

    // The levers that decide whether the next booking comes. Each is a real
    // number the guide can move today, not a score.
    const in90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const [{ count: openDays }, { count: unreplied }, { data: gRow }] = await Promise.all([
      admin
        .from("availability")
        .select("day", { count: "exact", head: true })
        .eq("guide_id", user.id)
        .eq("status", "open")
        .gte("day", today)
        .lte("day", in90),
      admin
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("subject_id", user.id)
        .eq("direction", "trekker_to_guide")
        .not("published_at", "is", null)
        .is("guide_reply", null),
      admin
        .from("guides")
        .select("median_response_mins")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    work = {
      openDays: openDays ?? 0,
      unrepliedReviews: unreplied ?? 0,
      responseMins: gRow?.median_response_mins ?? null,
    };
    if (active) {
      const { data: ci } = await admin
        .from("checkins")
        .select("id")
        .eq("booking_id", active.id)
        .eq("day", today)
        .maybeSingle();
      checkedInToday = !!ci;
    }
  }

  // Treks where this guide is the named backup — a promise Trek makes to
  // trekkers that the guide could never see before (audit).
  const { data: backupFor } = await admin
    .from("offerings")
    .select("id, slug, title, guide:guides!offerings_guide_id_fkey(slug, users(full_name))")
    .eq("backup_guide_id", user.id)
    .eq("status", "live")
    .limit(10);

  // Money owed but not yet paid out.
  const { data: duePayouts } = await admin
    .from("payouts")
    .select("amount_npr_paisa, status")
    .eq("guide_id", user.id)
    .eq("status", "payable");
  const payableNprPaisa = (duePayouts ?? []).reduce((s, p) => s + p.amount_npr_paisa, 0);

  // First-run: what a new guide still has to do before their page can sell.
  // Read from the same rows the public page renders, so a step goes green
  // because the thing is actually true, not because a flag was set.
  const [
    { data: me },
    { count: langCount },
    { count: offeringCount },
    { count: journalCount },
    { count: routeCount },
  ] = await Promise.all([
      admin
        .from("guides")
        .select("only_with_me, bio, day_rate_usd_cents, users(avatar_url)")
        .eq("user_id", user.id)
        .single(),
      admin
        .from("guide_languages")
        .select("language", { count: "exact", head: true })
        .eq("guide_id", user.id),
      admin
        .from("offerings")
        .select("id", { count: "exact", head: true })
        .eq("guide_id", user.id)
        .eq("status", "live"),
      admin
        .from("journals")
        .select("id", { count: "exact", head: true })
        .eq("guide_id", user.id),
      admin
        .from("guide_route_experience")
        .select("route_id", { count: "exact", head: true })
        .eq("guide_id", user.id),
    ]);

  const setup = [
    {
      key: "photo",
      done: !!(me as any)?.users?.avatar_url,
      label: "Add your photo",
      note: "Trekkers pick a face. This is the whole product.",
      to: "/g/profile",
    },
    {
      key: "promise",
      done: !!me?.only_with_me?.trim(),
      label: "Write your one promise",
      note: "One thing only you offer. Your words — we do not tidy them.",
      to: "/g/profile",
    },
    {
      key: "rate",
      done: !!me?.day_rate_usd_cents,
      label: "Set your day rate",
      note: "You keep all of it. Trek adds its fee on top.",
      to: "/g/profile",
    },
    {
      key: "languages",
      done: (langCount ?? 0) > 0,
      label: "List your languages",
      note: "It is how people filter. Missing here means missing from the search.",
      to: "/g/profile",
    },
    {
      key: "routes",
      done: (routeCount ?? 0) > 0,
      label: "Add the routes you've walked",
      note: "How many times you have led each one. It is the first line trekkers read.",
      to: "/g/profile",
    },
    {
      key: "trip",
      done: (offeringCount ?? 0) > 0,
      label: "List a trip",
      note: "The thing people book. Start with the trek you run most.",
      to: "/g/profile",
    },
    {
      key: "journal",
      done: (journalCount ?? 0) > 0,
      label: "Write up one trek",
      note: "Photos and a few lines. Nothing sells you like a trek you led.",
      to: "/g/journals",
    },
  ];

  return data(
    {
      name: profile.full_name,
      setup,
      guide,
      active,
      nextBooking,
      enquiries,
      unansweredQuestions,
      work,
      checkedInToday,
      today,
      backupFor: backupFor ?? [],
      payableNprPaisa,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  if (String(form.get("intent")) === "checkin") {
    const bookingId = String(form.get("booking_id"));
    // Guard: only the guide's own active booking.
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
          { booking_id: bookingId, day: new Date().toISOString().slice(0, 10), method: "app" },
          { onConflict: "booking_id,day" },
        );
    }
    return data({ ok: true }, { headers });
  }
  return data({ ok: false }, { headers });
}

const STEPS = ["applied", "in_review", "verified"] as const;
const STEP_LABEL: Record<string, string> = {
  applied: "Applied",
  in_review: "In review",
  verified: "Verified",
};

export default function GuideHome({ loaderData }: Route.ComponentProps) {
  const { name, setup, guide, active, nextBooking, enquiries, unansweredQuestions, work, checkedInToday, today, backupFor, payableNprPaisa } =
    loaderData as any;
  const status: string = guide?.status ?? "applied";
  const first = name.split(" ")[0];

  if (status !== "verified")
    return <StatusView name={first} guide={guide} status={status} setup={setup} />;

  const dayNum = active
    ? Math.max(
        1,
        Math.round(
          (Date.parse(today) - Date.parse(active.start_date)) / 86400000,
        ) + 1,
      )
    : 0;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink">Namaste, {first}</h1>

      <SetupChecklist steps={setup} />

      {active ? (
        <Link
          to="/g/active"
          className="block rounded-card border border-moss/50 bg-mist p-4"
        >
          <p className="text-xs text-ink-soft">On the trail — day {dayNum}</p>
          <p className="mt-0.5 font-medium text-ink">{active.offering?.title}</p>
          <p className="mt-1 text-sm text-primary">Open the trek →</p>
        </Link>
      ) : (
        <section className="grid grid-cols-2 gap-3">
          <Tile to="/g/enquiries" label="Open enquiries" value={enquiries} highlight={enquiries > 0} />
          <Tile
            to="/g/bookings"
            label="Next trip"
            value={nextBooking ? nextBooking.offering?.title ?? "—" : "None yet"}
            small
          />
        </section>
      )}

      {nextBooking && (
        <section className="rounded-card border border-border bg-card p-4">
          <p className="text-xs text-ink-soft">Next trip</p>
          <p className="font-medium text-ink">{nextBooking.offering?.title}</p>
          <p className="text-sm text-ink-soft">
            {firstName(nextBooking.trekker?.full_name)} · {fmtDate(nextBooking.start_date)}
          </p>
        </section>
      )}

      {payableNprPaisa > 0 && (
        <Link to="/g/earnings" className="block rounded-card border border-moss/40 bg-mist p-4">
          <p className="text-xs text-ink-soft">Owed to you</p>
          <p className="mt-0.5 font-mono text-xl text-ink">{formatNpr(payableNprPaisa)}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Paid within 7 days of each trek ending.</p>
        </Link>
      )}

      {backupFor.length > 0 && (
        <section className="rounded-card border border-border bg-card p-4">
          <p className="text-sm font-medium text-ink">
            You're the backup guide on {backupFor.length} trek{backupFor.length === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            If the lead guide can't go, you step in. Keep these dates in mind.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {backupFor.map((o: any) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span className="truncate text-ink">{o.title}</span>
                <span className="shrink-0 text-ink-soft">
                  for {o.guide?.users?.full_name?.split(" ")[0] ?? "a guide"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/g/experiences" className="rounded-card border border-border bg-card p-4 text-sm font-medium">
          Your experiences →
        </Link>
        <Link to="/g/journals" className="rounded-card border border-border bg-card p-4 text-sm font-medium">
          Your journeys →
        </Link>
        <Link to="/g/bookings" className="rounded-card border border-border bg-card p-4 text-sm font-medium">
          Booked trips →
        </Link>
        <Link to="/g/calendar" className="rounded-card border border-border bg-card p-4 text-sm font-medium">
          Block dates →
        </Link>
        <Link to="/g/earnings" className="rounded-card border border-border bg-card p-4 text-sm font-medium">
          Your money →
        </Link>
        <Link to="/g/reviews" className="rounded-card border border-border bg-card p-4 text-sm font-medium">
          Reviews →
        </Link>
        {/* Journals are how a guide wins the next booking, so they sit with
            the money links, not buried in profile settings. */}
        <Link
          to="/g/questions"
          className={cn(
            "col-span-2 flex items-center justify-between rounded-card border p-4 text-sm font-medium",
            unansweredQuestions > 0
              ? "border-moss/50 bg-mist text-ink"
              : "border-border bg-card text-ink",
          )}
        >
          <span>
            {unansweredQuestions > 0
              ? `${unansweredQuestions} ${unansweredQuestions === 1 ? "person is" : "people are"} waiting on an answer`
              : "Questions people asked you"}
          </span>
          <span className="text-primary">→</span>
        </Link>

        <Link
          to="/g/journals"
          className="col-span-2 rounded-card border border-moss/40 bg-mist p-4 text-sm font-medium"
        >
          Write up a trek →
          <span className="mt-0.5 block text-xs font-normal text-ink-soft">
            Your photos and your words. This is what makes people pick you.
          </span>
        </Link>
      </div>
      {/* ── How the next booking comes ─────────────────────────────────
           Not a score, not a percentage: three real numbers, each with the
           thing to do about it. The calendar one matters most — a guide with
           no open days is invisible in every dated search, and nothing on
           this phone told him that. */}
      {work && (
        <section className="rounded-card border border-border bg-card p-4">
          <p className="text-sm font-medium text-ink">Get more work</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li>
              {work.openDays === 0 ? (
                <Link to="/g/calendar" className="flex items-start gap-2 text-ink">
                  <Dot tone="ember" />
                  <span>
                    <span className="font-medium text-ember">Your calendar has no open days.</span>{" "}
                    People searching with dates cannot find you at all.{" "}
                    <span className="text-primary underline">Open days →</span>
                  </span>
                </Link>
              ) : (
                <Link to="/g/calendar" className="flex items-start gap-2 text-ink">
                  <Dot tone={work.openDays < 20 ? "amber" : "moss"} />
                  <span>
                    <span className="font-mono">{work.openDays}</span> open days in the
                    next 3 months. More open days, more searches you appear in.
                  </span>
                </Link>
              )}
            </li>
            {work.responseMins != null && (
              <li className="flex items-start gap-2">
                <Dot tone={work.responseMins <= 120 ? "moss" : "amber"} />
                <span>
                  Trekkers see &ldquo;usually responds in ~
                  <span className="font-mono">
                    {work.responseMins >= 60
                      ? `${Math.round(work.responseMins / 60)} h`
                      : `${work.responseMins} min`}
                  </span>
                  &rdquo;. Fast answers win bookings from slow ones.
                </span>
              </li>
            )}
            {work.unrepliedReviews > 0 && (
              <li>
                <Link to="/g/reviews" className="flex items-start gap-2 text-ink">
                  <Dot tone="amber" />
                  <span>
                    <span className="font-mono">{work.unrepliedReviews}</span>{" "}
                    {work.unrepliedReviews === 1 ? "review has" : "reviews have"} no reply.
                    A thank-you under each shows you read them.{" "}
                    <span className="text-primary underline">Reply →</span>
                  </span>
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {active && !checkedInToday && (
        <CheckinButton
          bookingId={active.id}
          dayNumber={dayNum}
          alreadyToday={checkedInToday}
        />
      )}

      <Link to="/g/profile" className="block text-center text-sm text-primary">
        View my profile
      </Link>
    </div>
  );
}

function Tile({
  to,
  label,
  value,
  highlight,
  small,
}: {
  to: string;
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "rounded-card border p-4",
        highlight ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={cn("mt-1 font-medium text-ink", small ? "text-sm" : "text-2xl")}>
        {value}
      </p>
    </Link>
  );
}

function StatusView({
  name,
  guide,
  status,
  setup,
}: {
  name: string;
  guide: any;
  status: string;
  setup: Array<{ key: string; done: boolean; label: string; note: string; to: string }>;
}) {
  const rejected = status === "removed" || status === "suspended";
  const activeIdx = STEPS.indexOf(status as any);
  const checks = guide?.guide_verifications ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Namaste, {name}</h1>
        <p className="text-sm text-ink-soft">Here’s where your application stands.</p>
      </div>
      {rejected ? (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-4">
          <p className="font-medium text-danger">Application not approved</p>
          <p className="mt-1 text-sm text-ink-soft">
            We couldn’t verify your application this time. We’ll be in touch.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {STEPS.map((s, i) => {
            const done = activeIdx >= 0 && i <= activeIdx;
            return (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-sm",
                    done ? "bg-accent text-white" : "bg-border text-ink-soft",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="text-sm">{STEP_LABEL[s]}</span>
              </li>
            );
          })}
        </ol>
      )}
      {/* Waiting on us is not the same as having nothing to do. The welcome
          email tells a new guide to start straight away — this is where they
          see what "start" means, and it is what gets them booked the day they
          are verified rather than a fortnight later. */}
      {!rejected && <SetupChecklist steps={setup} />}
      {checks.length > 0 && (
        <div className="rounded-card border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium text-ink">Verification checklist</p>
          <ul className="space-y-1.5 text-sm">
            {checks.map((c: any) => (
              <li key={c.check_type} className="flex items-center justify-between">
                <span>{checkLabel(c.check_type)}</span>
                <span
                  className={cn(
                    "text-xs",
                    c.status === "passed"
                      ? "text-accent"
                      : c.status === "failed"
                        ? "text-danger"
                        : "text-ink-soft",
                  )}
                >
                  {CHECK_STATUS_LABELS[c.status as CheckStatus] ?? c.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


/**
 * What is still missing from a guide's page.
 *
 * A verified guide used to land on a dashboard that told them about bookings
 * they did not have yet, with nothing to do and no idea why nobody was
 * enquiring — the answer being that their page had no photo, no rate and no
 * promise on it. Each step is derived from the row the public page actually
 * reads, so it goes green because the thing is true.
 *
 * It disappears the moment everything is done. A permanent checklist on a
 * dashboard is a permanent reminder that you are behind.
 */
function SetupChecklist({
  steps,
}: {
  steps: Array<{ key: string; done: boolean; label: string; note: string; to: string }>;
}) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;

  return (
    <section className="rounded-md border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium text-ink">Finish your page</h2>
        <p className="font-mono text-caption text-muted">
          {done}/{steps.length} done
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist">
        <div
          className="h-full rounded-full bg-moss transition-[width] duration-slow ease-out-soft"
          style={{ width: `${Math.round((done / steps.length) * 100)}%` }}
        />
      </div>
      <p className="mt-2.5 text-sm text-muted">
        Until these are in, your page is not really findable.
      </p>

      <ul className="mt-3 space-y-1">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              to={s.to}
              className={cn(
                "flex items-start gap-2.5 rounded px-2 py-2 -mx-2 transition-colors",
                s.done ? "text-muted" : "text-ink hover:bg-mist",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]",
                  s.done ? "border-moss bg-moss text-paper" : "border-line",
                )}
              >
                {s.done ? "✓" : ""}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm", s.done && "line-through")}>{s.label}</span>
                {!s.done && <span className="block text-caption text-muted">{s.note}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        to={next.to}
        className="mt-3 inline-block rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
      >
        {next.label} →
      </Link>
    </section>
  );
}

function Dot({ tone }: { tone: "moss" | "amber" | "ember" }) {
  const c =
    tone === "moss" ? "bg-moss" : tone === "amber" ? "bg-amber-500" : "bg-ember";
  return <span aria-hidden className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + c} />;
}
