import { Link } from "react-router";
import type { Route } from "./+types/experiences";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { OfferingCard, type PublicOffering } from "~/components/public/cards";

const CATEGORIES = [
  { kind: "", label: "All" },
  { kind: "trek", label: "Treks" },
  { kind: "day_hike", label: "Day hikes" },
  { kind: "food_culture", label: "Food & culture" },
  { kind: "adventure", label: "Adventure" },
  { kind: "city", label: "City" },
] as const;

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Browse experiences in Nepal — treks, day hikes, food & culture",
    description:
      "Every experience is led by a specific, verified guide. Browse multi-day treks, day hikes, food walks, adventures and city tours across Nepal.",
    canonical: data?.canonical ?? "",
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const kind = new URL(request.url).searchParams.get("kind") ?? "";

  let query = client
    .from("public_offerings")
    .select(
      "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, cover_photo_url, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents",
    );
  if (kind) query = query.eq("kind", kind);
  const { data: offerings } = await query;

  return {
    offerings: (offerings ?? []) as PublicOffering[],
    kind,
    canonical: absoluteUrl(env.SITE_URL, "/experiences"),
  };
}

export default function Experiences({ loaderData }: Route.ComponentProps) {
  const { offerings, kind } = loaderData;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl text-ink">Browse experiences</h1>
      <div className="mt-5 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link
            key={c.kind}
            to={c.kind ? `/experiences?kind=${c.kind}` : "/experiences"}
            prefetch="intent"
            className={
              "rounded-pill px-3 py-1.5 text-sm transition-colors " +
              (kind === c.kind
                ? "bg-primary text-white"
                : "bg-card text-ink hover:bg-black/5")
            }
          >
            {c.label}
          </Link>
        ))}
      </div>

      {offerings.length === 0 ? (
        <p className="mt-10 text-ink-soft">Nothing here yet.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {offerings.map((o) => (
            <OfferingCard key={o.id} offering={o} />
          ))}
        </div>
      )}
    </main>
  );
}
