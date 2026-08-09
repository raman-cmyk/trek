import { Link, data } from "react-router";
import type { Route } from "./+types/g._index";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { cn } from "~/lib/cn";
import { CheckinButton } from "~/components/guide/CheckinButton";

const CHECK_LABELS: Record<string, string> = {
  licence: "Trekking licence",
  id_match: "ID match",
  phone: "Phone",
  payout_account: "Payout account",
  reference_1: "Reference call",
  reference_2: "Reference call 2",
  police_cert: "Police clearance",
  first_aid: "First-aid cert",
  altitude_training: "Altitude training",
  insurance: "Insurance",
};

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
  let checkedInToday = false;

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

  return data(
    { name: profile.full_name, guide, active, nextBooking, enquiries, checkedInToday, today },
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
  const { name, guide, active, nextBooking, enquiries, checkedInToday, today } =
    loaderData as any;
  const status: string = guide?.status ?? "applied";
  const first = name.split(" ")[0];

  if (status !== "verified") return <StatusView name={first} guide={guide} status={status} />;

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

      {active ? (
        <section className="space-y-2">
          <p className="text-sm text-ink-soft">
            You’re on the trail: {active.offering?.title}
          </p>
          <CheckinButton
            bookingId={active.id}
            dayNumber={dayNum}
            alreadyToday={checkedInToday}
          />
        </section>
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
            {nextBooking.trekker?.full_name} · {nextBooking.start_date}
          </p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/g/calendar" className="rounded-card border border-border bg-card p-4 text-sm font-medium">
          Block dates →
        </Link>
        <Link to="/g/earnings" className="rounded-card border border-border bg-card p-4 text-sm font-medium">
          Earnings →
        </Link>
      </div>
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

function StatusView({ name, guide, status }: { name: string; guide: any; status: string }) {
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
      {checks.length > 0 && (
        <div className="rounded-card border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium text-ink">Verification checklist</p>
          <ul className="space-y-1.5 text-sm">
            {checks.map((c: any) => (
              <li key={c.check_type} className="flex items-center justify-between">
                <span>{CHECK_LABELS[c.check_type] ?? c.check_type}</span>
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
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
