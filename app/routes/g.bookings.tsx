import { data } from "react-router";
import type { Route } from "./+types/g.bookings";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Badge } from "~/components/ops/ui";

const STATUS_TONE: Record<string, "amber" | "teal" | "green" | "neutral" | "blue"> = {
  deposit_paid: "amber",
  docs_pending: "amber",
  confirmed: "blue",
  active: "teal",
  completed: "green",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, start_date, end_date, party_size, status, offering:offerings(title), trekker:users(full_name, country_code, phone)",
    )
    .eq("guide_id", user.id)
    .not("status", "in", "(cancelled_trekker,cancelled_guide,cancelled_force_majeure)")
    .order("start_date", { ascending: false });
  return data({ bookings: bookings ?? [] }, { headers });
}

export default function GuideBookings({ loaderData }: Route.ComponentProps) {
  const bookings = loaderData.bookings as any[];
  const upcoming = bookings.filter((b) => b.status !== "completed");
  const past = bookings.filter((b) => b.status === "completed");

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink">Your trips</h1>

      <Group title="Upcoming & active" items={upcoming} showContact />
      <Group title="Completed" items={past} />
    </div>
  );
}

function Group({
  title,
  items,
  showContact,
}: {
  title: string;
  items: any[];
  showContact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      <ul className="space-y-2">
        {items.map((b) => (
          <li key={b.id} className="rounded-card border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-ink">{b.offering?.title}</p>
              <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>
                {b.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-ink-soft">
              {b.trekker?.full_name}
              {b.trekker?.country_code ? ` · ${b.trekker.country_code}` : ""} ·{" "}
              {b.party_size}p
            </p>
            <p className="text-sm text-ink-soft">
              {b.start_date} → {b.end_date}
            </p>
            {/* Trekker phone released post-deposit (docs/04). */}
            {showContact && b.trekker?.phone && b.status !== "deposit_paid" && (
              <a
                href={`tel:${b.trekker.phone}`}
                className="mt-2 inline-block text-sm font-medium text-primary"
              >
                Call {b.trekker.full_name.split(" ")[0]}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
