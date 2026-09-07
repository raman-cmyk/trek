import { Link, data } from "react-router";
import type { Route } from "./+types/trips._index";
import { fmtDateRange, statusLabel } from "~/lib/format";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { firstName } from "~/lib/names";
import { SmartImage } from "~/components/SmartImage";
import { Badge } from "~/components/ops/ui";

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
  // A plan waiting on you is the most important thing on this page — it is
  // the one thing here that stops if nobody looks at it.
  const { data: proposals } = await admin
    .from("package_proposals")
    .select("id, days, party_size, start_date, total_usd_cents, deposit_usd_cents, guide_id")
    .eq("trekker_id", user.id)
    .eq("status", "proposed")
    .order("created_at", { ascending: false });

  // Named with a second query rather than an embed: guide_id points at
  // guides(user_id), so "users" is two hops away and the shorthand would
  // silently return nothing.
  const guideIds = [...new Set((proposals ?? []).map((p: any) => p.guide_id))];
  const { data: guideUsers } = guideIds.length
    ? await admin.from("users").select("id, full_name").in("id", guideIds)
    : { data: [] as any[] };
  const nameOf = new Map((guideUsers ?? []).map((u: any) => [u.id, u.full_name]));

  return data(
    {
      bookings: bookings ?? [],
      proposals: (proposals ?? []).map((p: any) => ({
        ...p,
        guideName: nameOf.get(p.guide_id) ?? null,
      })),
    },
    { headers },
  );
}

export default function MyTrips({ loaderData }: Route.ComponentProps) {
  const bookings = loaderData.bookings as any[];
  const proposals = (loaderData as any).proposals as any[];
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl text-ink">My trips</h1>

      {proposals.length > 0 && (
        <ul className="mt-6 space-y-3">
          {proposals.map((p) => (
            <li key={p.id}>
              <Link
                to={`/proposals/${p.id}`}
                prefetch="intent"
                className="block rounded-card border border-moss/50 bg-mist p-4 hover:border-moss"
              >
                <p className="label text-moss">Waiting for you</p>
                <p className="mt-1 font-medium text-ink">
                  {firstName(p.guideName) || "Your guide"} suggested a plan —{" "}
                  {p.days} {p.days === 1 ? "day" : "days"} for {p.party_size}, starting{" "}
                  {p.start_date}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  See what changed and approve it →
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
