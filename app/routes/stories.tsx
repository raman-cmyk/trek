import { Link } from "react-router";
import type { Route } from "./+types/stories";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { SmartImage } from "~/components/SmartImage";
import { TierBadge } from "~/components/public/bits";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Trek stories — real treks, real trekkers, real guides",
    description:
      "Every card is a finished trek: the route, the days, the altitude, and the named guide who led it. Not testimonials — receipts.",
    canonical: (data as any)?.canonical ?? "",
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  // Public gallery of visible recaps (admin client to embed booking→guide, safe fields only).
  const admin = createAdminClient(env);
  const { data: recaps } = await admin
    .from("recaps")
    .select(
      "slug, photo_urls, stats, created_at, booking:bookings(start_date, offering:offerings(title, kind), guide:guides(slug, tier, users(full_name, avatar_url)))",
    )
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .limit(24);

  const cards = (recaps ?? []).map((r: any) => ({
    slug: r.slug,
    photo: (r.photo_urls ?? [])[0] ?? null,
    days: r.stats?.days ?? null,
    altitude: r.stats?.max_altitude_m ?? null,
    title: r.booking?.offering?.title ?? "A Himalayan trek",
    when: r.booking?.start_date ?? null,
    guideName: r.booking?.guide?.users?.full_name ?? null,
    guideAvatar: r.booking?.guide?.users?.avatar_url ?? null,
    guideSlug: r.booking?.guide?.slug ?? null,
    guideTier: r.booking?.guide?.tier ?? 1,
  }));

  return { cards, canonical: absoluteUrl(env.SITE_URL, "/stories") };
}

function monthYear(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function Stories({ loaderData }: Route.ComponentProps) {
  const { cards } = loaderData as any;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="label text-muted">Stories</p>
      <h1 className="mt-2 font-display text-display-l text-ink">
        Real treks. Named guides. No stock photos.
      </h1>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        Every card below is a trek that actually happened on Trek — the route, the days,
        the altitude, and the human who led it. Click through, then message that guide.
      </p>

      {cards.length === 0 ? (
        <p className="mt-10 rounded-card bg-surface p-6 text-center text-ink-soft">
          The first stories land here as treks complete.
        </p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c: any) => (
            <div key={c.slug} className="group overflow-hidden rounded-card border border-border bg-card hover:shadow-card">
              <Link to={`/recap/${c.slug}`} prefetch="intent">
                <SmartImage
                  src={c.photo ?? ""}
                  alt={c.title}
                  width={640}
                  height={360}
                  className="h-40 w-full"
                />
                <div className="p-4 pb-2">
                  <h2 className="font-display text-lg leading-snug text-ink group-hover:text-primary">
                    {c.title}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-ink-soft">
                    {[
                      c.days ? `${c.days} days` : null,
                      c.altitude ? `${c.altitude.toLocaleString("en-US")}m` : null,
                      monthYear(c.when),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
              {c.guideSlug && (
                <Link
                  to={`/guides/${c.guideSlug}`}
                  className="flex items-center gap-2 px-4 pb-4 pt-1"
                >
                  <SmartImage
                    src={c.guideAvatar ?? ""}
                    alt={c.guideName ?? ""}
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-full"
                  />
                  <span className="text-sm text-ink-soft">
                    led by <span className="font-medium text-ink">{c.guideName}</span>
                  </span>
                  <TierBadge tier={c.guideTier} static />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-card border border-accent/30 bg-accent/5 p-5 text-center">
        <p className="text-ink">
          Want yours here?{" "}
          <Link to="/match" className="font-medium text-primary hover:underline">
            Find your guide
          </Link>{" "}
          — your recap is generated automatically when your trek completes.
        </p>
      </div>
    </main>
  );
}
