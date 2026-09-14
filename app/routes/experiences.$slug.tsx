import type { Route } from "./+types/experiences.$slug";
import { loadOfferingDetail } from "~/features/offering-detail.server";
import { OfferingDetailView } from "~/components/public/OfferingDetailView";
import { parseFaqs } from "~/lib/offering-details";
import { pageMeta, productLd, breadcrumbLd, faqLd, jsonLd } from "~/lib/seo";

export async function loader({ params, context }: Route.LoaderArgs) {
  return loadOfferingDetail(context, params.slug, "experience");
}

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

export default function ExperienceDetail({ loaderData }: Route.ComponentProps) {
  return <OfferingDetailView data={loaderData} />;
}
