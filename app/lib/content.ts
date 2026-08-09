import { marked } from "marked";

/**
 * Route landing-page content is markdown in /content/routes/*.md (docs/02 §SEO)
 * — copywriter edits markdown, never components. Vite bundles them as raw
 * strings so this works on Cloudflare Workers (no fs).
 */
const RAW = import.meta.glob("../../content/routes/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface RouteArticle {
  slug: string;
  title: string;
  meta: string;
  hero?: string;
  region?: string;
  relatedSlugs: string[];
  faq: Array<{ q: string; a: string }>;
  html: string;
  toc: Array<{ id: string; text: string }>;
}

function slugFromPath(p: string): string {
  return p.split("/").pop()!.replace(/\.md$/, "");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parse(raw: string, slug: string): RouteArticle {
  const fm: Record<string, string> = {};
  let body = raw;
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      fm[line.slice(0, idx).trim()] = line
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    body = m[2];
  }

  // FAQ blocks: lines like "Q: ...\nA: ..." are pulled out for JSON-LD + render.
  const faq: Array<{ q: string; a: string }> = [];
  body = body.replace(/^Q:\s*(.+)\nA:\s*(.+)$/gm, (_full, q, a) => {
    faq.push({ q: q.trim(), a: a.trim() });
    return `### ${q.trim()}\n\n${a.trim()}\n`;
  });

  const toc: Array<{ id: string; text: string }> = [];
  for (const line of body.split("\n")) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) toc.push({ id: slugify(h[1]), text: h[1].trim() });
  }

  // Render, giving h2/h3 ids for in-page anchors / TOC.
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text.replace(/<[^>]+>/g, ""));
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
    },
  });
  const html = marked.parse(body, { async: false }) as string;

  return {
    slug,
    title: fm.title ?? slug,
    meta: fm.meta ?? "",
    hero: fm.hero,
    region: fm.region,
    relatedSlugs: (fm.related_slugs ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    faq,
    html,
    toc,
  };
}

const ARTICLES: Record<string, RouteArticle> = Object.fromEntries(
  Object.entries(RAW).map(([p, raw]) => {
    const slug = slugFromPath(p);
    return [slug, parse(raw, slug)];
  }),
);

export function getRouteArticle(slug: string): RouteArticle | null {
  return ARTICLES[slug] ?? null;
}

export function allRouteArticleSlugs(): string[] {
  return Object.keys(ARTICLES);
}
