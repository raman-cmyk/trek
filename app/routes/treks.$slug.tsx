import type { Route } from "./+types/treks.$slug";
import { loadOfferingDetail } from "~/features/offering-detail.server";
import { OfferingDetailView } from "~/components/public/OfferingDetailView";
import { pageMeta, productLd, breadcrumbLd, jsonLd } from "~/lib/seo";
import { fromPerPersonUsdCents, type PriceBreakdown , hasBreakdown } from "~/lib/experience-pricing";

export async function loader({ params, context }: Route.LoaderArgs) {
  return loadOfferingDetail(context, params.slug, "trek");
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Not found" }];
  const o = data.o;
  const bd = (o.price_breakdown ?? null) as PriceBreakdown | null;
  const fromCents = hasBreakdown(bd)
        ? fromPerPersonUsdCents(bd, (o as any).max_party)
    : (o.price_usd_cents ?? 0);
  return [
    ...pageMeta({
      title: `${o.title} — guided by ${o.guide_name}`,
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
        priceUsd: fromCents / 100,
        rating: data.rating,
        guideName: o.guide_name,
      }),
    ),
    jsonLd(
      breadcrumbLd([
        { name: "Treks", url: new URL(data.canonical).origin + "/experiences" },
        { name: o.title, url: data.canonical },
      ]),
    ),
  ];
}

export default function TrekDetail({ loaderData }: Route.ComponentProps) {
  return <OfferingDetailView data={loaderData} />;
}
