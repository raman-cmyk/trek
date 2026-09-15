import type { Route } from "./+types/experiences.$slug";
import { loadOfferingDetail } from "~/features/offering-detail.server";
import { OfferingDetailView } from "~/components/public/OfferingDetailView";
import { pageMeta, productLd, breadcrumbLd, faqLd, jsonLd } from "~/lib/seo";
import { parseFaqs } from "~/lib/offering-details";

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
    // FAQPage, but only where a guide has actually answered something. An
    // empty FAQPage is a structured-data error in Search Console, and a rich
    // result promising answers that are not on the page is worse than none.
    ...(parseFaqs((o as any).faqs).length > 0
      ? [jsonLd(faqLd(parseFaqs((o as any).faqs)))]
      : []),
  ];
}

export default function ExperienceDetail({ loaderData }: Route.ComponentProps) {
  return <OfferingDetailView data={loaderData} />;
}
