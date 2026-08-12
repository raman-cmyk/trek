import { Link } from "react-router";
import type { Route } from "./+types/recap.$slug";
import { fmtDateRange, fmtMetres } from "~/lib/format";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { firstName } from "~/lib/names";
import { SmartImage } from "~/components/SmartImage";
import { GuideChip } from "~/components/public/bits";

export function meta({ loaderData: d }: Route.MetaArgs) {
  if (!d) return [{ title: "Recap not found" }];
  return pageMeta({
    title: `${d.title} — a trek recap`,
    description: `${d.days} days in the Himalaya, guided by ${d.guideName}. ${d.altitude ? `Up to ${fmtMetres(d.altitude)}.` : ""}`.trim(),
    canonical: d.canonical,
    image: d.ogImage,
    type: "article",
  });
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const admin = createAdminClient(env);
  const { data: recap } = await admin
    .from("recaps")
    .select(
      "slug, photo_urls, stats, booking:bookings(start_date, end_date, offering:offerings(title), guide:guides(slug, tier, users(full_name, avatar_url)))",
    )
    .eq("slug", params.slug)
    .eq("visible", true)
    .maybeSingle();
  if (!recap) throw new Response("Recap not found", { status: 404 });

  const b: any = (recap as any).booking;
  return {
    slug: recap.slug,
    title: b?.offering?.title ?? "A Himalayan trek",
    guideName: firstName(b?.guide?.users?.full_name) || "your guide",
    guideSlug: b?.guide?.slug ?? "",
    guideAvatar: b?.guide?.users?.avatar_url ?? null,
    guideTier: b?.guide?.tier ?? 1,
    startDate: b?.start_date,
    endDate: b?.end_date,
    days: (recap.stats as any)?.days ?? null,
    altitude: (recap.stats as any)?.max_altitude_m ?? null,
    photos: (recap.photo_urls ?? []) as string[],
    canonical: absoluteUrl(env.SITE_URL, `/recap/${params.slug}`),
    ogImage: absoluteUrl(env.SITE_URL, `/recap/${params.slug}/og`),
  };
}

function ShareRecap({ title }: { title: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = window.location.href;
        if (navigator.share) {
          void navigator.share({ title, url }).catch(() => {});
        } else {
          void navigator.clipboard.writeText(url);
        }
      }}
      className="rounded-button border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-mist"
    >
      Share this recap
    </button>
  );
}

export default function Recap({ loaderData: d }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-card bg-pine p-8 text-white">
        <p className="text-sm uppercase tracking-wide opacity-80">Trek · Nepal</p>
        <h1 className="mt-2 font-display text-4xl">{d.title}</h1>
        <div className="mt-3 flex flex-wrap gap-6 text-lg">
          {d.days && <span>{d.days} days</span>}
          {d.altitude && <span>{fmtMetres(d.altitude)} max</span>}
          <span>
            {fmtDateRange(d.startDate, d.endDate)}
          </span>
        </div>
      </div>

      {d.photos.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {d.photos.map((url, i) => (
            <SmartImage
              key={i}
              src={url}
              alt="Trek photo"
              width={400}
              height={300}

              className="aspect-[4/3] w-full rounded-card"
            />
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-4 rounded-card border border-border bg-card p-6 text-center">
        <p className="text-ink-soft">Guided by</p>
        <GuideChip
          slug={d.guideSlug}
          name={d.guideName}
          avatarUrl={d.guideAvatar}
          tier={d.guideTier}
        />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to={`/guides/${d.guideSlug}`}
            className="rounded-button bg-primary px-5 py-3 font-medium text-white hover:bg-primary-hover"
          >
            Book {d.guideName.split(" ")[0]} →
          </Link>
          <ShareRecap title={d.title} />
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-ink-soft">
        <Link to="/stories" className="text-primary hover:underline">
          More real treks →
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-ink-soft">
        Know who’s walking with you.
      </p>
    </main>
  );
}
