import { Link, data } from "react-router";
import type { Route } from "./+types/trips._index";
import { fmtDateRange, statusLabel } from "~/lib/format";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { SmartImage } from "~/components/SmartImage";
import { Badge } from "~/components/ops/ui";
import { firstName } from "~/lib/names";

const TONE: Record<string, "amber" | "blue" | "teal" | "green" | "neutral" | "red"> = {
  pending_deposit: "amber",
  deposit_paid: "amber",
  docs_pending: "amber",
  confirmed: "blue",
  active: "teal",
  completed: "green",
};

export function meta() {
  return [{ title: "My trips" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, offering:offerings(title, cover_photo_url), guide:guides(users(full_name))",
    )
    .eq("trekker_id", user.id)
    .order("start_date", { ascending: false });
  return data({ bookings: bookings ?? [] }, { headers });
}

export default function MyTrips({ loaderData }: Route.ComponentProps) {
  const bookings = loaderData.bookings as any[];
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl text-ink">My trips</h1>
      {bookings.length === 0 ? (
        <div className="mt-8 rounded-card border border-border bg-card p-8 text-center">
          <p className="text-ink-soft">No trips yet.</p>
          <Link to="/guides" className="mt-3 inline-block font-medium text-primary">
            Find your guide →
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                to={`/trips/${b.id}`}
                prefetch="intent"
                className="flex gap-3 rounded-card border border-border bg-card p-3 hover:shadow-card"
              >
                <SmartImage
                  src={b.offering?.cover_photo_url ?? ""}
                  alt={b.offering?.title ?? ""}
                  width={96}
                  height={96}

                  className="h-20 w-20 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-ink">
                      {b.offering?.title}
                    </p>
                    <Badge tone={TONE[b.status] ?? "neutral"}>
                      {statusLabel(b.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-soft">
                    {firstName(b.guide?.users?.full_name)}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {fmtDateRange(b.start_date, b.end_date)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
