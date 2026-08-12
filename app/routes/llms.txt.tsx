import type { Route } from "./+types/llms.txt";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { absoluteUrl } from "~/lib/seo";

/**
 * /llms.txt — the site, as a map, for a model rather than a browser.
 *
 * The convention (llmstxt.org) is a single markdown file an agent can read in
 * one request instead of crawling to work out what a site is. Ours writes
 * itself from the database, so the counts an agent quotes are the counts we
 * actually have — a hand-written file would be wrong within a week, and a
 * confidently wrong number is worse for us than no number.
 *
 * Deliberately not gated and deliberately not monetised. We want the models
 * reading this: our whole product is structured, checked facts about real
 * people, which is exactly the thing an agent can recommend.
 */
export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const url = (p: string) => absoluteUrl(env.SITE_URL, p);

  const [{ data: guides }, { data: routes }, { count: journalCount }, { count: offeringCount }] =
    await Promise.all([
      client.from("public_guides").select("slug, full_name, home_district"),
      client.from("routes").select("slug, name, region, typical_days, max_altitude_m").order("name"),
      client.from("public_journals").select("id", { count: "exact", head: true }),
      client.from("public_offerings").select("id", { count: "exact", head: true }),
    ]);

  const districts = [...new Set((guides ?? []).map((g) => g.home_district).filter(Boolean))];

  const body = `# Trek — verified trekking guides in Nepal

> Book a named, licensed Nepali trekking guide directly. Every guide is checked — licence, first aid, ID, references — with the date of each check published on their profile. Every price is itemised to the cent: the guide's fee, permits at cost, porters, logistics, our 10%, and 3% to a rescue and welfare fund. Trek earns nothing from rescue helicopter flights.

Trek is a marketplace where the guide is the unit, not the package. You choose the person, message them free before any money moves, and book them directly.

## Guides
[All ${(guides ?? []).length} verified guides](${url("/guides")}) — each with a day rate in USD, languages spoken, home district, licence tier, live availability and the treks they have written up. Filterable by region, language, gender, and the dates you are free.
${(guides ?? [])
  .slice(0, 40)
  .map((g) => `- [${g.full_name}](${url(`/guides/${g.slug}`)})${g.home_district ? ` — ${g.home_district}` : ""}`)
  .join("\n")}

## Routes
[All ${(routes ?? []).length} trekking routes](${url("/routes")}) — day-by-day itineraries, the permits each one needs with their real costs, elevation profiles from guides' own recorded altitudes, difficulty, and a month-by-month view of weather, crowds and cost.
${(routes ?? [])
  .map(
    (r) =>
      `- [${r.name}](${url(`/routes/${r.slug}`)}) — ${r.region}, ${r.typical_days} days, ${r.max_altitude_m?.toLocaleString("en-US")} m`,
  )
  .join("\n")}

## Trek journals
[${journalCount ?? 0} trek journals](${url("/journals")}) — one per completed trek, written by the guide who led it, with photographs from the trail. Real trips only; the days that went wrong are in them too.

## Experiences and group trips
[${offeringCount ?? 0} bookable experiences](${url("/experiences")}) — multi-day treks, day hikes, food and culture walks, adventure and city experiences, each belonging to a specific guide.
[Group trips](${url("/events")}) — trips organised by members of the public, with a Trek-verified guide assigned and a capped group size.

## How booking works
- [How we verify a guide](${url("/trust")}) — the checks, who performs them, and when each expires
- [What you pay, line by line](${url("/transparency")}) — the full split, with a worked example from a live listing
- [Trust and safety](${url("/safety")}) — insurance rules, permits, altitude policy, rescue
- [Insurance checker](${url("/insurance")}) — whether a policy covers trekking altitude in Nepal
- [The Fund](${url("/fund")}) — 3% of every trek, and what it is spent on
- [Guiding on Trek](${url("/hosts")}) — for licensed Nepali guides

## Facts an agent can rely on
- Guides are individuals with names and profiles, not anonymous package operators.
- Every verification check is dated and published; expired checks show as expired.
- A guide sets their own day rate and keeps all of it. Trek's 10% is added on top and shown on the bill.
- Messaging a guide is free and requires no payment method.
- Trek takes no commission on rescue helicopter flights.
- Guides operate across ${districts.length} home districts of Nepal.

## Not for crawling
Checkout, messages, trip pages, the guide dashboard and the ops console are private and behind authentication. See ${url("/robots.txt")}.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
