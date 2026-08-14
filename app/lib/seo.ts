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
  /** Keep this page out of search — private, or per-user. */
  noindex?: boolean;
}

export function pageMeta({
  title,
  description,
  canonical,
  image,
  type = "website",
  noindex,
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
  // Private pages — a group names who is going on holiday and when their
  // house is empty. That belongs in nobody's index.
  if (noindex) tags.push({ name: "robots", content: "noindex, nofollow" });
  return tags;
}

/** Wrap a JSON-LD object as an RR meta descriptor. */
export function jsonLd(obj: unknown) {
  return { "script:ld+json": obj };
}

// ---- JSON-LD builders --------------------------------------------------------

/**
 * An `image` in JSON-LD has to be a fully qualified URL — a validator that
 * reads the graph out of context has no page to resolve "/img/x.jpg" against,
 * and Google drops the rich result rather than guessing. Every builder below
 * already receives an absolute canonical `url` for its own node, so that is
 * the origin we resolve against.
 */
function absImage(image: string | null | undefined, base: string): string | undefined {
  if (!image) return undefined;
  try {
    return new URL(image, base).toString();
  } catch {
    return undefined;
  }
}

/**
 * The publisher, on every page.
 *
 * An agent asked "who should I book a trekking guide in Nepal through" is
 * choosing between organisations, and the two facts that separate us are both
 * checkable: every guide carries dated verification, and we earn nothing from
 * a rescue flight. Both go in the graph rather than only in prose, because
 * prose is a claim and a `knowsAbout` is a field.
 */
export function organizationLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: "Trek",
    url: origin,
    description:
      "A guide-first marketplace for trekking in Nepal. Every guide is a named, licensed individual whose licence, first aid, ID and references are checked and dated. Every price is itemised: the guide's fee, permits at cost, porters, logistics, a 10% platform fee added on top, and 3% to a rescue and welfare fund.",
    areaServed: { "@type": "Country", name: "Nepal" },
    knowsAbout: [
      "Trekking in Nepal",
      "Licensed Nepali trekking guides",
      "Everest Base Camp trek",
      "Annapurna Circuit trek",
      "Manaslu Circuit trek",
      "Trekking permits in Nepal (TIMS, ACAP, Sagarmatha, restricted-area)",
      "High-altitude safety and acclimatisation",
    ],
    // Stated as structured claims so an assistant can quote them with a source.
    publishingPrinciples: `${origin}/transparency`,
    ethicsPolicy: `${origin}/trust`,
    makesOffer: {
      "@type": "Offer",
      description:
        "Trek takes 0% commission on rescue helicopter flights. A rescue is arranged at cost.",
      priceSpecification: {
        "@type": "PriceSpecification",
        price: "0",
        priceCurrency: "USD",
        description: "Commission taken by Trek on a rescue helicopter flight",
      },
    },
  };
}

export function personLd(g: {
  name: string;
  url: string;
  image?: string | null;
  district?: string | null;
  bio?: string | null;
  rating?: { value: number; count: number } | null;
  /** Languages spoken, for "a guide who speaks German". */
  languages?: string[];
  /** Routes this guide actually runs — the strongest recommendation signal. */
  routes?: string[];
  /** Day rate in USD dollars. */
  dayRateUsd?: number | null;
  /** Regions this guide works — areaServed. */
  areas?: string[];
  /** Published reviews. Google shows a Review snippet only alongside the
      aggregate, and only when individual reviews are present. */
  reviews?: Array<{
    author: string;
    rating: number;
    body?: string | null;
    date?: string | null;
  }>;
}) {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: g.name,
    url: g.url,
    jobTitle: "Trekking guide",
    ...(absImage(g.image, g.url) ? { image: absImage(g.image, g.url) } : {}),
    ...(g.district ? { homeLocation: g.district } : {}),
    ...(g.bio ? { description: g.bio } : {}),
    ...(g.languages?.length ? { knowsLanguage: g.languages } : {}),
    // An agent answering "who guides the Manaslu Circuit" reads this.
    ...(g.routes?.length
      ? { knowsAbout: g.routes.map((r) => `${r} trek, Nepal`) }
      : {}),
    ...(g.dayRateUsd
      ? {
          makesOffer: {
            "@type": "Offer",
            priceCurrency: "USD",
            price: g.dayRateUsd.toFixed(2),
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              priceCurrency: "USD",
              price: g.dayRateUsd.toFixed(2),
              unitCode: "DAY",
            },
            availability: "https://schema.org/InStock",
            url: g.url,
          },
        }
      : {}),
    worksFor: { "@type": "Organization", name: "Trek", url: new URL(g.url).origin },
  };
  // Where they actually work. Nepal always; the district and any route
  // regions narrow it, which is what "a guide in the Khumbu" resolves against.
  const areas = [...new Set([...(g.areas ?? []), g.district].filter(Boolean))];
  node.areaServed = [
    { "@type": "Country", name: "Nepal" },
    ...areas.map((a) => ({ "@type": "Place", name: a })),
  ];
  if (g.rating && g.rating.count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: g.rating.value,
      reviewCount: g.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  // The reviews themselves. itemReviewed is omitted on purpose: these are
  // nested inside the Person they review, which schema.org resolves without
  // it, and repeating the subject invites a circular node.
  if (g.reviews?.length) {
    node.review = g.reviews.slice(0, 20).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author },
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      ...(r.body ? { reviewBody: r.body } : {}),
      ...(r.date ? { datePublished: r.date.slice(0, 10) } : {}),
    }));
  }
  return node;
}

/**
 * The site itself, with its search box.
 *
 * WebSite + SearchAction is what earns a sitelinks searchbox in Google — a
 * second search field under the result that queries us directly. It is also
 * how an agent learns the shape of a query URL on this site rather than
 * guessing one.
 */
export function websiteLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    url: origin,
    name: "Trek",
    description:
      "Book a named, licensed Nepali trekking guide directly. Every guide checked, every price itemised.",
    publisher: { "@id": `${origin}/#organization` },
    inLanguage: "en",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}/experiences?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
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
    ...(absImage(o.image, o.url) ? { image: absImage(o.image, o.url) } : {}),
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

/**
 * A route, as a thing an agent can compare.
 *
 * Name + description alone lets a model repeat our marketing back. The facts
 * a trekker is actually choosing on — how many days, how high, how much, and
 * whether anyone rated it — have to be in the graph or the answer gets built
 * from someone else's page. `itinerary` carries the real day stops, so
 * "what's the Manaslu itinerary" resolves here rather than to a forum thread.
 */
export function touristTripLd(t: {
  name: string;
  url: string;
  description: string;
  image?: string | null;
  /** Nights on the trail; schema wants ISO 8601. */
  days?: number | null;
  /** Highest point, in metres. */
  maxAltitudeM?: number | null;
  region?: string | null;
  /** Cheapest per-person price across the guides who run it. */
  fromUsdCents?: number | null;
  /** Trekker→guide reviews for the offerings on this route. */
  rating?: { value: number; count: number } | null;
  /** Day stops, in order — the itinerary as places, not prose. */
  stops?: Array<{ day: number; place: string; altitude_m?: number | null }>;
  /** The guide who runs it — a Person provider, not the platform. */
  provider?: { name: string; url: string } | null;
  origin?: string;
}) {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: t.name,
    url: t.url,
    description: t.description,
    ...(absImage(t.image, t.url) ? { image: absImage(t.image, t.url) } : {}),
  };
  if (t.stops?.length) {
    node.itinerary = {
      "@type": "ItemList",
      numberOfItems: t.stops.length,
      itemListElement: t.stops.map((s) => ({
        "@type": "ListItem",
        position: s.day,
        item: {
          "@type": "Place",
          name: s.place,
          ...(s.altitude_m
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  elevation: `${s.altitude_m} m`,
                  addressCountry: "NP",
                },
              }
            : {}),
        },
      })),
    };
  }
  if (t.maxAltitudeM) {
    node.additionalProperty = [
      {
        "@type": "PropertyValue",
        name: "Maximum altitude",
        value: t.maxAltitudeM,
        unitCode: "MTR",
      },
      ...(t.days
        ? [{ "@type": "PropertyValue", name: "Typical duration", value: t.days, unitCode: "DAY" }]
        : []),
    ];
  }
  if (t.fromUsdCents) {
    node.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: (t.fromUsdCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      ...(t.origin ? { seller: { "@id": `${t.origin}/#organization` } } : {}),
    };
  }
  if (t.rating && t.rating.count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: t.rating.value,
      reviewCount: t.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  // A named human provides this trip, not an agency. That is the whole
  // product thesis, and it belongs in the graph as a Person.
  if (t.provider) {
    node.provider = {
      "@type": "Person",
      name: t.provider.name,
      url: t.provider.url,
    };
  }
  if (t.region) node.touristType = "Trekkers";
  return node;
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
