/**
 * SEO helpers (docs/02 §SEO). SSR is the demand engine, so every public page
 * ships title/description/canonical/OpenGraph/Twitter + the right JSON-LD.
 *
 * These return React Router meta descriptors. JSON-LD uses RR's
 * `{ "script:ld+json": {...} }` descriptor so it renders in <head> at SSR.
 */

export interface PageMetaInput {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  /** OpenGraph type, default "website". */
  type?: string;
}

export function pageMeta({
  title,
  description,
  canonical,
  image,
  type = "website",
}: PageMetaInput) {
  const tags: Array<Record<string, unknown>> = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: canonical },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  if (image) {
    tags.push({ property: "og:image", content: image });
    tags.push({ name: "twitter:image", content: image });
  }
  return tags;
}

/** Wrap a JSON-LD object as an RR meta descriptor. */
export function jsonLd(obj: unknown) {
  return { "script:ld+json": obj };
}

// ---- JSON-LD builders --------------------------------------------------------

export function personLd(g: {
  name: string;
  url: string;
  image?: string | null;
  district?: string | null;
  bio?: string | null;
  rating?: { value: number; count: number } | null;
}) {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: g.name,
    url: g.url,
    jobTitle: "Trekking guide",
    ...(g.image ? { image: g.image } : {}),
    ...(g.district ? { homeLocation: g.district } : {}),
    ...(g.bio ? { description: g.bio } : {}),
  };
  if (g.rating && g.rating.count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: g.rating.value,
      reviewCount: g.rating.count,
    };
  }
  return node;
}

export function productLd(o: {
  name: string;
  url: string;
  description: string;
  image?: string | null;
  priceUsd: number; // dollars
  rating?: { value: number; count: number } | null;
  guideName: string;
}) {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: o.name,
    description: o.description,
    ...(o.image ? { image: o.image } : {}),
    brand: { "@type": "Person", name: o.guideName },
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: o.priceUsd.toFixed(2),
      availability: "https://schema.org/InStock",
      url: o.url,
    },
  };
  if (o.rating && o.rating.count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: o.rating.value,
      reviewCount: o.rating.count,
    };
  }
  return node;
}

export function touristTripLd(t: {
  name: string;
  url: string;
  description: string;
  image?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: t.name,
    url: t.url,
    description: t.description,
    ...(t.image ? { image: t.image } : {}),
  };
}

export function faqLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
}

export function breadcrumbLd(crumbs: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

/** Absolute URL from SITE_URL + path. */
export function absoluteUrl(siteUrl: string | undefined, path: string) {
  const base = (siteUrl ?? "http://localhost:5173").replace(/\/$/, "");
  return `${base}${path}`;
}
