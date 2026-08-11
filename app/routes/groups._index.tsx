import { Link, redirect } from "react-router";
import type { Route } from "./+types/groups._index";
import { pageMeta } from "~/lib/seo";
import { getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { createAdminClient } from "~/lib/supabase.server";
import { useMoney } from "~/lib/currency-context";
import { groupMoney, type GroupMember } from "~/lib/groups";

export function meta() {
  return pageMeta({
    title: "Your trips together",
    description: "Trips you are planning with other people.",
    canonical: "",
    noindex: true,
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) throw redirect("/login?next=/groups", { headers });
  const admin = createAdminClient(env);

  const { data: mine } = await admin
    .from("trip_group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .in("status", ["invited", "joined"]);
  const ids = [...new Set((mine ?? []).map((m) => m.group_id))];
  if (ids.length === 0) {
    return { groups: [], userId: user.id };
  }

  const [{ data: groups }, { data: members }, { data: offerings }] = await Promise.all([
    admin.from("trip_groups").select("*").in("id", ids).order("created_at", { ascending: false }),
    admin.from("trip_group_members").select("*").in("group_id", ids).order("created_at"),
    admin.from("public_offerings").select("id, title, days, kind, slug, cover_photo_url"),
  ]);

  // Booked groups price off their booking, not off the shares that happen to
  // exist — otherwise a trip for four with one member signed in advertises a
  // quarter of its own cost.
  const bookingIds = (groups ?? []).map((g) => g.booking_id).filter(Boolean) as string[];
  const { data: bookings } = bookingIds.length
    ? await admin
        .from("bookings")
        .select("id, total_usd_cents, party_size")
        .in("id", bookingIds)
    : { data: [] };
  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));

  const byGroup = new Map<string, GroupMember[]>();
  for (const m of (members ?? []) as GroupMember[] & { group_id: string }[]) {
    const list = byGroup.get((m as any).group_id) ?? [];
    list.push(m);
    byGroup.set((m as any).group_id, list);
  }
  const offeringById = new Map((offerings ?? []).map((o) => [o.id, o]));

  return {
    userId: user.id,
    groups: (groups ?? []).map((g) => {
      const list = byGroup.get(g.id) ?? [];
      const bk = g.booking_id ? bookingById.get(g.booking_id) : null;
      return {
        ...g,
        members: list,
        money: groupMoney(list, bk?.total_usd_cents, bk?.party_size),
        seats: bk?.party_size ?? g.party_target,
        offering: g.offering_id ? (offeringById.get(g.offering_id) ?? null) : null,
        youAreInvited: list.some((m) => m.user_id === user.id && m.status === "invited"),
      };
    }),
  };
}

export default function Groups({ loaderData }: Route.ComponentProps) {
  const { groups } = loaderData as any;
  const { mr } = useMoney();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label text-muted">Going with people</p>
          <h1 className="mt-2 font-display text-4xl text-ink">Your trips together</h1>
        </div>
        <Link
          to="/groups/new"
          className="rounded bg-pine px-4 py-2.5 text-sm font-medium text-paper hover:bg-moss"
        >
          Start a trip
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="mt-10 rounded-md border border-line bg-card p-8">
          <p className="font-display text-xl text-ink">No trips together yet.</p>
          <p className="mt-2 max-w-[54ch] text-muted">
            Start one, send the link to whoever is coming, and everyone can see
            the same dates, the same guide, and who has paid. You choose whether
            one person pays for everyone or you all pay your own share.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/groups/new"
              className="rounded bg-pine px-4 py-2.5 text-sm font-medium text-paper hover:bg-moss"
            >
              Start a trip
            </Link>
            <Link
              to="/experiences"
              className="rounded border border-line px-4 py-2.5 text-sm text-ink hover:bg-mist"
            >
              Find a trek first
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {groups.map((g: any) => {
            const joined = g.members.filter((m: GroupMember) => m.status === "joined").length;
            return (
              <li key={g.id}>
                <Link
                  to={`/groups/${g.slug}`}
                  prefetch="intent"
                  className="block rounded-md border border-line bg-card p-4 transition-colors hover:border-sage hover:bg-mist"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-xl text-ink">{g.name}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {g.offering ? g.offering.title : "No trek picked yet"}
                        {g.start_date && ` · ${g.start_date}`}
                      </p>
                    </div>
                    <span
                      className={
                        "shrink-0 rounded-pill px-2.5 py-1 text-caption font-medium " +
                        (g.status === "booked"
                          ? "bg-moss text-paper"
                          : g.youAreInvited
                            ? "bg-chartreuse text-pine"
                            : "border border-line text-muted")
                      }
                    >
                      {g.status === "booked"
                        ? "Booked"
                        : g.youAreInvited
                          ? "You're invited"
                          : "Planning"}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-caption text-muted">
                    {joined}/{g.seats} in
                    {g.money.totalUsdCents > 0 && (
                      <>
                        {" · "}
                        {mr(g.money.paidUsdCents)} of {mr(g.money.totalUsdCents)} paid
                      </>
                    )}
                    {g.payment_mode === "organiser" && " · one person paying"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
