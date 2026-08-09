import type { Route } from "./+types/experiences.$slug";
import { loadOfferingDetail } from "~/features/offering-detail.server";
import { OfferingDetailView } from "~/components/public/OfferingDetailView";
import { pageMeta, productLd, breadcrumbLd, jsonLd } from "~/lib/seo";

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
  ];
}

export default function ExperienceDetail({ loaderData }: Route.ComponentProps) {
  return <OfferingDetailView data={loaderData} />;
}
