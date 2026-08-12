import type { Route } from "./+types/robots.txt";
import { getEnv } from "~/lib/supabase.server";
import { absoluteUrl } from "~/lib/seo";

export function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  // Private by path, for everyone. Anything behind a login, anything with a
  // person's documents or money in it.
  const PRIVATE = [
    "/ops",
    "/_dev",
    "/g",
    "/trips",
    "/checkout",
    "/messages",
    "/conversations",
    "/groups",
    "/pdf",
    "/api",
    "/logout",
  ];

  /**
   * The model crawlers get their own blocks, spelled out rather than left to
   * the wildcard.
   *
   * A wildcard Allow already permits them, but an agent operator reading this
   * file cannot tell whether that was a decision or an oversight — and several
   * of these crawlers are conservative when a site is silent about them. We
   * are not silent: our whole product is checked, structured facts about real
   * people, which is exactly what an assistant can recommend. Read it.
   *
   * They get the same private-path list as everyone else. Being legible is not
   * the same as being open, and a checkout page is nobody's training data.
   */
  const AI_AGENTS = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-User",
    "anthropic-ai",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "CCBot",
    "Applebot-Extended",
    "cohere-ai",
    "Meta-ExternalAgent",
  ];

  const PUBLIC = ["/guides", "/routes", "/journals", "/experiences", "/treks", "/events"];

  const block = (agent: string, allowFirst: boolean) => [
    `User-agent: ${agent}`,
    ...(allowFirst ? PUBLIC.map((p) => `Allow: ${p}`) : []),
    "Allow: /",
    ...PRIVATE.map((p) => `Disallow: ${p}`),
    "",
  ];

  const body = [
    ...block("*", false),
    ...AI_AGENTS.flatMap((a) => block(a, true)),
    `Sitemap: ${absoluteUrl(env.SITE_URL, "/sitemap.xml")}`,
    "",
    "# A markdown map of this site, written for agents:",
    `# ${absoluteUrl(env.SITE_URL, "/llms.txt")}`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
