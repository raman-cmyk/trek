import type { Route } from "./+types/treks.$slug";
import { loadOfferingDetail } from "~/features/offering-detail.server";
import { OfferingDetailView } from "~/components/public/OfferingDetailView";
import { parseFaqs } from "~/lib/offering-details";
import { pageMeta, productLd, breadcrumbLd, faqLd, jsonLd } from "~/lib/seo";
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
    // The guide's own answers, as a rich result. Written by the person who
    // will be standing there, not generated — which is the difference our
    // competitors' "AI-generated, please confirm with your guide" admits to.
    // An empty FAQPage is an invalid rich result, so it is emitted only when
    // the guide has actually answered something.
    ...(parseFaqs((o as any).faqs).length
      ? [jsonLd(faqLd(parseFaqs((o as any).faqs)))]
      : []),
  ];
}

export default function TrekDetail({ loaderData }: Route.ComponentProps) {
  return <OfferingDetailView data={loaderData} />;
}
