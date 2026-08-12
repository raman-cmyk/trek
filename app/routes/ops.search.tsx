import { Link, data } from "react-router";
import type { Route } from "./+types/ops.search";
import { Badge } from "~/components/ops/ui";
import { fmtDate } from "~/lib/format";
import { escapeLike } from "~/lib/browse";
import { getEnv, requireOps } from "~/lib/supabase.server";

/**
 * One box that finds anybody.
 *
 * The support moment this exists for: an email arrives saying "hi, it's Sarah,
 * about my trek". Before this, turning "Sarah" into her booking meant knowing
 * which page to start from. Now it is typed once in the sidebar and answered
 * with every person, guide and booking that matches, each one linking to the
 * page where something can be done about it.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);

  if (q.length < 2) {
    return data({ q, guides: [], trekkers: [], bookings: [] }, { headers });
  }
  const like = `%${escapeLike(q)}%`;

  const [{ data: people }, { data: guideRows }] = await Promise.all([
    admin
      .from("users")
      .select("id, full_name, email, phone, role")
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(20),
    admin.from("guides").select("user_id, slug, status, tier, home_district").limit(1000),
  ]);

  const guideBy = new Map((guideRows ?? []).map((g: any) => [g.user_id, g]));
  const guides = (people ?? []).filter((p: any) => guideBy.has(p.id));
  const trekkers = (people ?? []).filter(
    (p: any) => !guideBy.has(p.id) && p.role !== "ops",
  );

  // Bookings for everybody matched, either side of the trip.
  const ids = (people ?? []).map((p: any) => p.id);
  let bookings: any[] = [];
  if (ids.length) {
    const { data: b } = await admin
      .from("bookings")
      .select(
        "id, status, start_date, trekker_id, guide_id, trekker:users(full_name), guide:guides(users(full_name)), offering:offerings(title)",
      )
      .or(`trekker_id.in.(${ids.join(",")}),guide_id.in.(${ids.join(",")})`)
      .order("start_date", { ascending: false })
      .limit(30);
    bookings = b ?? [];
  }

  return data(
    {
      q,
      guides: guides.map((p: any) => ({ ...p, guide: guideBy.get(p.id) })),
      trekkers,
      bookings,
    },
    { headers },
  );
}

export default function OpsSearch({ loaderData }: Route.ComponentProps) {
  const { q, guides, trekkers, bookings } = loaderData as any;
  const nothing = !guides.length && !trekkers.length && !bookings.length;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink">
        {q ? <>Results for &ldquo;{q}&rdquo;</> : "Search"}
      </h1>

      {q.length < 2 ? (
        <p className="text-sm text-ink-soft">
          Type a name, an email, or a phone number in the box on the left.
        </p>
      ) : nothing ? (
        <p className="rounded-md border border-line bg-card p-4 text-sm text-ink-soft">
          Nobody matches &ldquo;{q}&rdquo;. Emails match exactly on spelling —
          try just the part before the @.
        </p>
      ) : (
        <>
          {guides.length > 0 && (
            <Block title="Guides">
              {guides.map((p: any) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{p.full_name}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {p.email} {p.phone && `· ${p.phone}`} · {p.guide.home_district}
                    </p>
                  </div>
                  <Badge tone={p.guide.status === "verified" ? "green" : "amber"}>
                    {p.guide.status}
                  </Badge>
                  <Link
                    to={`/ops/verifications/${p.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    File →
                  </Link>
                  <Link
                    to={`/guides/${p.guide.slug}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Public page →
                  </Link>
                </li>
              ))}
            </Block>
          )}

          {trekkers.length > 0 && (
            <Block title="Trekkers">
              {trekkers.map((p: any) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{p.full_name}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {p.email} {p.phone && `· ${p.phone}`}
                    </p>
                  </div>
                </li>
              ))}
            </Block>
          )}

          {bookings.length > 0 && (
            <Block title="Their bookings">
              {bookings.map((b: any) => (
                <li key={b.id}>
                  <Link
                    to={`/ops/bookings/${b.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-mist/60"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs">{fmtDate(b.start_date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {b.offering?.title ?? "Trek"}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {b.trekker?.full_name} with {b.guide?.users?.full_name}
                      </span>
                    </span>
                    <Badge>{b.status}</Badge>
                  </Link>
                </li>
              ))}
            </Block>
          )}
        </>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-card">
        {children}
      </ul>
    </section>
  );
}
