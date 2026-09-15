import type { Route } from "./+types/experiences.$slug";
import { loadOfferingDetail } from "~/features/offering-detail.server";
import { OfferingDetailView } from "~/components/public/OfferingDetailView";
import { pageMeta, productLd, breadcrumbLd, jsonLd } from "~/lib/seo";

export async function loader({ params, context, request }: Route.LoaderArgs) {
  return loadOfferingDetail(context, params.slug, "experience", request);
}

/**
 * This page now carries the signed-in visitor's own standing request for
 * this trip, so it must never be handed to the next visitor from a shared
 * cache. Anonymous traffic — nearly all of it, and every crawler — still
 * gets the shared 300s cache it had; anyone signed in gets nothing shared.
 */
export { publicCacheHeaders as headers } from "~/lib/cache-headers";

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Not found" }];
  const o = data.o;
  return [
    ...pageMeta({
      title: `${o.title} — with ${o.guide_name}`,
      description: o.summary,
      canonical: data.canonical,
      image: data.ogImage,
      type: "product",
    }),
    jsonLd(
      productLd({
        name: o.title,
        url: data.canonical,
        description: o.summary,
        image: data.ogImage,
        priceUsd: (o.price_usd_cents ?? 0) / 100,
        rating: data.rating,
        guideName: o.guide_name,
      }),
    ),
    jsonLd(
      breadcrumbLd([
        { name: "Experiences", url: new URL(data.canonical).origin + "/experiences" },
        { name: o.title, url: data.canonical },
      ]),
    ),
  ];
}

export default function ExperienceDetail({ loaderData }: Route.ComponentProps) {
  return <OfferingDetailView data={loaderData} />;
}
