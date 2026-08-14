import { describe, expect, it } from "vitest";
import {
  breadcrumbLd,
  faqLd,
  organizationLd,
  personLd,
  productLd,
  touristTripLd,
  websiteLd,
} from "./seo";

/**
 * Structural validation of every JSON-LD object we emit.
 *
 * schema.org itself has no runtime validator to call, and Google's Rich
 * Results Test is a network service we cannot run in CI — so this asserts the
 * rules those validators actually apply: every node carries an @type, the
 * @context sits on the root only, required properties per type are present,
 * enumerated values use the canonical schema.org URLs, ratings sit inside
 * their declared bounds, and nothing serialises to `undefined` (which is what
 * silently produces `"key": null` in the rendered page and trips a validator).
 *
 * The generated fixtures below mirror real loader shapes.
 */

/** Every nested node must declare a type; only the root may carry a context. */
function walk(node: unknown, path = "$", out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, `${path}[${i}]`, out));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  // A node either declares its type, or is a bare {"@id": …} reference to one
  // declared elsewhere in the graph — both are valid JSON-LD.
  const looksLikeNode = "@type" in o || "@id" in o;
  if (!looksLikeNode && path !== "$" && !path.endsWith("query-input")) {
    // A plain object that is not a typed node is a validator warning at best.
    out.push(`${path}: object with no @type`);
  }
  if (path !== "$" && "@context" in o) out.push(`${path}: @context on a nested node`);
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) out.push(`${path}.${k}: undefined`);
    if (v && typeof v === "object") walk(v, `${path}.${k}`, out);
  }
  return out;
}

/** Serialises cleanly and survives a round trip — what the page actually ships. */
function serialises(node: unknown) {
  const json = JSON.stringify(node);
  expect(json).not.toContain("undefined");
  return JSON.parse(json);
}

const ORIGIN = "https://trek.example";

describe("Organization", () => {
  const node = organizationLd(ORIGIN) as any;
  it("has the required identity properties", () => {
    expect(node["@context"]).toBe("https://schema.org");
    expect(node["@type"]).toBe("Organization");
    expect(node.name).toBeTruthy();
    expect(node.url).toBe(ORIGIN);
    expect(node["@id"]).toBe(`${ORIGIN}/#organization`);
  });
  it("is structurally clean", () => {
    expect(walk(node)).toEqual([]);
    serialises(node);
  });
});

describe("WebSite + SearchAction", () => {
  const node = websiteLd(ORIGIN) as any;
  it("declares the site and its publisher", () => {
    expect(node["@type"]).toBe("WebSite");
    expect(node.url).toBe(ORIGIN);
    expect(node.publisher["@id"]).toBe(`${ORIGIN}/#organization`);
  });
  it("carries a SearchAction Google can use", () => {
    const a = node.potentialAction;
    expect(a["@type"]).toBe("SearchAction");
    expect(a.target["@type"]).toBe("EntryPoint");
    // The placeholder and the query-input name must match, or the searchbox
    // is silently dropped.
    expect(a.target.urlTemplate).toContain("{search_term_string}");
    expect(a["query-input"]).toBe("required name=search_term_string");
  });
  it("is structurally clean", () => {
    expect(walk(node)).toEqual([]);
    serialises(node);
  });
});

describe("Person (guide profile)", () => {
  const node = personLd({
    name: "Pemba",
    url: `${ORIGIN}/guides/pemba-sherpa`,
    image: `${ORIGIN}/img/guides/pemba.jpg`,
    district: "Solukhumbu",
    bio: "I grew up in Khumjung.",
    rating: { value: 5, count: 2 },
    languages: ["Nepali", "English", "Sherpa"],
    routes: ["Everest Base Camp"],
    dayRateUsd: 45,
    areas: ["Khumbu"],
    reviews: [
      { author: "Liam", rating: 5, body: "Unhurried and safe.", date: "2026-08-01T09:00:00Z" },
      { author: "Sarah", rating: 5, body: null, date: null },
    ],
  }) as any;

  it("has the required Person properties", () => {
    expect(node["@type"]).toBe("Person");
    expect(node.name).toBe("Pemba");
    expect(node.url).toBeTruthy();
  });

  it("carries the discovery fields", () => {
    expect(node.knowsLanguage).toEqual(["Nepali", "English", "Sherpa"]);
    expect(node.knowsAbout[0]).toContain("Everest Base Camp");
    expect(node.description).toBeTruthy();
    expect(node.image).toBeTruthy();
  });

  it("absolutises a relative image, because a validator has no page context", () => {
    const rel = personLd({
      name: "Pemba",
      url: `${ORIGIN}/guides/pemba-sherpa`,
      image: "/img/guides/pemba.jpg",
    }) as any;
    expect(rel.image).toBe(`${ORIGIN}/img/guides/pemba.jpg`);
  });

  it("areaServed is a list of typed places, always including Nepal", () => {
    expect(Array.isArray(node.areaServed)).toBe(true);
    expect(node.areaServed[0]).toEqual({ "@type": "Country", name: "Nepal" });
    expect(node.areaServed.map((a: any) => a.name)).toContain("Khumbu");
    expect(node.areaServed.every((a: any) => a["@type"])).toBe(true);
  });

  it("the Offer uses a canonical availability URL and a real currency", () => {
    expect(node.makesOffer.priceCurrency).toBe("USD");
    expect(node.makesOffer.availability).toBe("https://schema.org/InStock");
    // Price must be a string that parses — Google rejects "$45" and 45.0.
    expect(Number(node.makesOffer.price)).toBeCloseTo(45);
  });

  it("AggregateRating sits inside its declared bounds", () => {
    const r = node.aggregateRating;
    expect(r["@type"]).toBe("AggregateRating");
    expect(r.ratingValue).toBeGreaterThanOrEqual(r.worstRating);
    expect(r.ratingValue).toBeLessThanOrEqual(r.bestRating);
    expect(r.reviewCount).toBeGreaterThan(0);
  });

  it("each Review has an author and a bounded rating", () => {
    expect(node.review).toHaveLength(2);
    for (const rev of node.review) {
      expect(rev["@type"]).toBe("Review");
      expect(rev.author["@type"]).toBe("Person");
      expect(rev.author.name).toBeTruthy();
      expect(rev.reviewRating["@type"]).toBe("Rating");
      expect(rev.reviewRating.ratingValue).toBeLessThanOrEqual(rev.reviewRating.bestRating);
    }
    // datePublished is ISO date only, and absent rather than null when unknown.
    expect(node.review[0].datePublished).toBe("2026-08-01");
    expect("datePublished" in node.review[1]).toBe(false);
    expect("reviewBody" in node.review[1]).toBe(false);
  });

  it("caps reviews so the payload cannot grow without bound", () => {
    const many = personLd({
      name: "A",
      url: `${ORIGIN}/guides/a`,
      reviews: Array.from({ length: 60 }, (_, i) => ({ author: `R${i}`, rating: 5 })),
    }) as any;
    expect(many.review.length).toBeLessThanOrEqual(20);
  });

  it("omits every optional block when the guide is brand new", () => {
    const bare = personLd({ name: "New", url: `${ORIGIN}/guides/new` }) as any;
    expect(bare.aggregateRating).toBeUndefined();
    expect(bare.review).toBeUndefined();
    expect(bare.makesOffer).toBeUndefined();
    // areaServed still asserts Nepal — true of every guide on the platform.
    expect(bare.areaServed).toHaveLength(1);
    expect(walk(bare)).toEqual([]);
    serialises(bare);
  });

  it("is structurally clean", () => {
    expect(walk(node)).toEqual([]);
    serialises(node);
  });
});

describe("TouristTrip (route page)", () => {
  const node = touristTripLd({
    name: "Everest Base Camp Trek",
    url: `${ORIGIN}/routes/everest-base-camp`,
    description: "The walk everyone means.",
    image: "/img/routes/ebc.jpg",
    days: 14,
    maxAltitudeM: 5644,
    region: "Khumbu",
    fromUsdCents: 54297,
    rating: { value: 5, count: 2 },
    stops: [
      { day: 1, place: "Phakding", altitude_m: 2610 },
      { day: 2, place: "Namche Bazaar", altitude_m: 3440 },
    ],
    provider: { name: "Pemba", url: `${ORIGIN}/guides/pemba-sherpa` },
    origin: ORIGIN,
  }) as any;

  it("has the required trip properties", () => {
    expect(node["@type"]).toBe("TouristTrip");
    expect(node.name).toBeTruthy();
    expect(node.description).toBeTruthy();
    expect(node.touristType).toBe("Trekkers");
  });

  it("the itinerary is an ordered ItemList of typed Places", () => {
    const it = node.itinerary;
    expect(it["@type"]).toBe("ItemList");
    expect(it.numberOfItems).toBe(2);
    expect(it.itemListElement[0]["@type"]).toBe("ListItem");
    expect(it.itemListElement[0].position).toBe(1);
    expect(it.itemListElement[0].item["@type"]).toBe("Place");
    expect(it.itemListElement[0].item.name).toBe("Phakding");
    // Positions must be unique and ascending or the list is invalid.
    const positions = it.itemListElement.map((e: any) => e.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("offers is an AggregateOffer with a numeric lowPrice and a currency", () => {
    expect(node.offers["@type"]).toBe("AggregateOffer");
    expect(node.offers.priceCurrency).toBe("USD");
    expect(Number(node.offers.lowPrice)).toBeCloseTo(542.97);
    expect(node.offers.availability).toBe("https://schema.org/InStock");
  });

  it("ships an absolute image URL", () => {
    expect(node.image).toBe(`${ORIGIN}/img/routes/ebc.jpg`);
  });

  it("names a Person as provider, not the platform", () => {
    expect(node.provider["@type"]).toBe("Person");
    expect(node.provider.name).toBe("Pemba");
    expect(node.provider.url).toContain("/guides/");
  });

  it("additionalProperty uses UN/CEFACT unit codes", () => {
    const units = node.additionalProperty.map((p: any) => p.unitCode);
    expect(units).toContain("MTR"); // metres
    expect(units).toContain("DAY");
    expect(node.additionalProperty.every((p: any) => p["@type"] === "PropertyValue")).toBe(true);
  });

  it("is structurally clean", () => {
    expect(walk(node)).toEqual([]);
    serialises(node);
  });
});

describe("Product + Offer (trek/experience page)", () => {
  const node = productLd({
    name: "Gokyo Lakes, properly acclimatised",
    description: "Thirteen days instead of twelve.",
    image: "/img/gokyo.jpg",
    url: `${ORIGIN}/treks/gokyo`,
    priceUsd: 578,
    guideName: "Pasang",
    rating: { value: 5, count: 1 },
  }) as any;

  it("has a valid Offer", () => {
    expect(node["@type"]).toBe("Product");
    expect(node.offers["@type"]).toBe("Offer");
    expect(node.offers.priceCurrency).toBe("USD");
    expect(Number(node.offers.price)).toBeCloseTo(578);
    expect(node.offers.availability).toMatch(/^https:\/\/schema\.org\//);
  });

  it("ships an absolute image URL", () => {
    expect(node.image).toBe(`${ORIGIN}/img/gokyo.jpg`);
  });

  it("is structurally clean", () => {
    expect(walk(node)).toEqual([]);
    serialises(node);
  });
});

describe("BreadcrumbList", () => {
  const node = breadcrumbLd([
    { name: "Routes", url: `${ORIGIN}/routes` },
    { name: "Everest Base Camp", url: `${ORIGIN}/routes/everest-base-camp` },
  ]) as any;

  it("positions start at 1 and ascend without gaps", () => {
    expect(node["@type"]).toBe("BreadcrumbList");
    const p = node.itemListElement.map((e: any) => e.position);
    expect(p).toEqual([1, 2]);
    expect(node.itemListElement.every((e: any) => e["@type"] === "ListItem")).toBe(true);
    expect(node.itemListElement.every((e: any) => e.item && e.name)).toBe(true);
  });

  it("is structurally clean", () => {
    expect(walk(node)).toEqual([]);
    serialises(node);
  });
});

describe("FAQPage", () => {
  const node = faqLd([
    { q: "Do I need a guide?", a: "Yes, since 2023 for most national parks." },
    { q: "How fit must I be?", a: "Fit enough to walk five hours a day." },
  ]) as any;

  it("every entry is a Question with an accepted Answer", () => {
    expect(node["@type"]).toBe("FAQPage");
    for (const q of node.mainEntity) {
      expect(q["@type"]).toBe("Question");
      expect(q.name).toBeTruthy();
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.acceptedAnswer.text).toBeTruthy();
    }
  });

  it("rejects nothing but also invents nothing on an empty list", () => {
    const empty = faqLd([]) as any;
    expect(empty.mainEntity).toEqual([]);
  });

  it("is structurally clean", () => {
    expect(walk(node)).toEqual([]);
    serialises(node);
  });
});
