import { Link } from "react-router";
import type { Route } from "./+types/stories";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { firstName } from "~/lib/names";
import { SmartImage } from "~/components/SmartImage";
import { TierBadge } from "~/components/public/bits";
import { Eyebrow } from "~/components/design/Eyebrow";
import { PhotoCard } from "~/components/design/PhotoCard";
import { GlassPill } from "~/components/design/Glass";
import { Glyph } from "~/components/design/Chip";

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
    guideName: firstName(r.booking?.guide?.users?.full_name) || null,
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
      <Eyebrow>Stories</Eyebrow>
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
            <PhotoCard
              key={c.slug}
              to={`/recap/${c.slug}`}
              photo={c.photo}
              alt={c.title}
              aspect="aspect-[4/5]"
              topLeft={c.altitude ? <GlassPill><Glyph name="altitude" className="text-moss" /><span className="font-mono">{c.altitude.toLocaleString("en-US")}</span> m</GlassPill> : undefined}
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-paper/75">
                {[c.days ? `${c.days} days` : null, monthYear(c.when)].filter(Boolean).join(" · ")}
              </p>
              <h2 className="mt-1 font-display text-lg leading-snug">{c.title}</h2>
              {c.guideName && (
                <div className="mt-2 flex items-center gap-2 text-caption text-paper/85">
                  <SmartImage src={c.guideAvatar ?? ""} alt="" width={28} height={28} className="h-6 w-6 rounded-full ring-1 ring-paper/60" />
                  <span>led by <span className="font-medium text-paper">{c.guideName}</span></span>
                </div>
              )}
            </PhotoCard>
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
