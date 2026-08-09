import type { RouterContextProvider } from "react-router";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings } from "~/lib/ratings.server";
import { absoluteUrl } from "~/lib/seo";
import { offeringPath } from "~/components/public/cards";

type Kind = "trek" | "experience";

export async function loadOfferingDetail(
  context: Readonly<RouterContextProvider>,
  slug: string,
  expect: Kind,
) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const { data: o } = await client
    .from("public_offerings")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!o) throw new Response("Not found", { status: 404 });

  const isTrek = o.kind === "trek";
  // Enforce canonical URL space: treks under /treks, everything else /experiences.
  if ((expect === "trek") !== isTrek) {
    throw new Response("Not found", { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: photos }, { data: permits }, { data: avail }, { data: reviews }] =
    await Promise.all([
      client
        .from("offering_photos")
        .select("url, alt_text, credit_name")
        .eq("offering_id", o.id)
        .eq("approved", true)
        .order("sort"),
      isTrek && o.route_id
        ? client.from("permits").select("cost_usd_cents").eq("route_id", o.route_id)
        : Promise.resolve({ data: [] as { cost_usd_cents: number }[] }),
      client
        .from("availability")
        .select("day")
        .eq("guide_id", o.guide_id)
        .eq("status", "open")
        .gte("day", today)
        .order("day"),
      client
        .from("public_reviews")
        .select("id, overall, body, published_at, author_name, author_country")
        .eq("offering_slug", slug)
        .order("published_at", { ascending: false }),
    ]);

  const ratings = await guideRatings(client, [o.guide_id]);
  const permitPp = (permits ?? []).reduce(
    (s: number, p: { cost_usd_cents: number }) => s + p.cost_usd_cents,
    0,
  );

  return {
    o,
    photos: (photos ?? []) as Array<{
      url: string;
      alt_text: string;
      credit_name: string | null;
    }>,
    availableDays: (avail ?? []).map((a: { day: string }) => a.day),
    reviews: (reviews ?? []) as Array<{
      id: string;
      overall: number;
      body: string | null;
      published_at: string | null;
      author_name: string;
      author_country: string | null;
    }>,
    rating: ratings[o.guide_id] ?? null,
    permitPp,
    canonical: absoluteUrl(env.SITE_URL, offeringPath(o)),
    ogImage: o.cover_photo_url ?? undefined,
  };
}

export type OfferingDetailData = Awaited<ReturnType<typeof loadOfferingDetail>>;
