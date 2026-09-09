/**
 * The ten kinds of block a route page is made of.
 *
 * The Langtang Valley page — the one that climbs, a photograph and a paragraph
 * per day, the background cooling from forest green to alpine white — is a
 * TypeScript constant one route deep. Giving a second route that page means a
 * developer and a deploy, which is the wrong cost for an editorial decision.
 *
 * So a page is an ordered list of blocks, and this file is the vocabulary: the
 * kinds, the fields each one has, and what an empty one looks like. The ops
 * editor is generated from FIELDS rather than hand-written ten times over, so
 * a new kind is a few lines here and it appears in the console, renders on the
 * page, and is covered by the same normaliser.
 *
 * Closed on purpose. An open schema becomes a page builder, a page builder
 * becomes a CMS, and a CMS is a project rather than a feature.
 */

export type BlockKind =
  | "hero"
  | "prose"
  | "stats"
  | "climb_day"
  | "itinerary"
  | "elevation"
  | "gallery"
  | "quote"
  | "faq"
  | "guides";

/** How a field is edited, which is all the console needs to know. */
export type FieldType = "text" | "long" | "number" | "image" | "list" | "pairs";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** The line under the input — what to write, not what the field is called. */
  hint?: string;
  max?: number;
}

export interface BlockDef {
  kind: BlockKind;
  label: string;
  /** What this block is for, in the console's own list. */
  blurb: string;
  fields: FieldDef[];
  /** A fresh one, so adding a block never starts on a blank screen. */
  empty: Record<string, unknown>;
}

export const BLOCKS: BlockDef[] = [
  {
    kind: "hero",
    label: "Opening",
    blurb: "The photograph, the name, and the one line under it.",
    fields: [
      { key: "image", label: "Photograph", type: "image" },
      { key: "eyebrow", label: "Small line above", type: "text", max: 40 },
      { key: "title", label: "Heading", type: "text", max: 90 },
      { key: "standfirst", label: "The line under it", type: "long", max: 300 },
    ],
    empty: { image: "", eyebrow: "", title: "", standfirst: "" },
  },
  {
    kind: "prose",
    label: "Words",
    blurb: "A heading and a few paragraphs. The workhorse.",
    fields: [
      { key: "heading", label: "Heading", type: "text", max: 90 },
      {
        key: "body",
        label: "Paragraphs",
        type: "long",
        hint: "A blank line between paragraphs.",
        max: 4000,
      },
    ],
    empty: { heading: "", body: "" },
  },
  {
    kind: "stats",
    label: "The numbers",
    blurb: "Days, altitude, difficulty — the strip a reader scans first.",
    fields: [
      { key: "heading", label: "Heading", type: "text", max: 90 },
      {
        key: "items",
        label: "The numbers",
        type: "pairs",
        hint: "One per line: label, then the value. “Max altitude | 4,984 m”.",
      },
    ],
    empty: { heading: "", items: [] },
  },
  {
    kind: "climb_day",
    label: "A day that climbs",
    blurb:
      "The Langtang treatment: one photograph, one paragraph, and the page colour climbing with the altitude.",
    fields: [
      { key: "day", label: "Day number", type: "number" },
      { key: "place", label: "Where you sleep", type: "text", max: 60 },
      { key: "altitude", label: "Altitude in metres", type: "number" },
      { key: "image", label: "Photograph", type: "image" },
      {
        key: "text",
        label: "What the day is",
        type: "long",
        hint: "One paragraph, written like somebody who walked it.",
        max: 700,
      },
    ],
    empty: { day: 1, place: "", altitude: 0, image: "", text: "" },
  },
  {
    kind: "itinerary",
    label: "Day by day",
    blurb: "The plain list, for the reader who is comparing two routes.",
    fields: [
      { key: "heading", label: "Heading", type: "text", max: 90 },
      {
        key: "days",
        label: "The days",
        type: "pairs",
        hint: "One per line: “Day 3 | Lama Hotel to Langtang Village, 4h”.",
      },
    ],
    empty: { heading: "Day by day", days: [] },
  },
  {
    kind: "elevation",
    label: "The shape of it",
    blurb: "The elevation profile, drawn from the route's own day stops.",
    fields: [
      { key: "heading", label: "Heading", type: "text", max: 90 },
      { key: "note", label: "A line under it", type: "text", max: 200 },
    ],
    empty: { heading: "The shape of it", note: "" },
  },
  {
    kind: "gallery",
    label: "Photographs",
    blurb: "Three or more, with what each one is.",
    fields: [
      { key: "heading", label: "Heading", type: "text", max: 90 },
      {
        key: "photos",
        label: "Photographs",
        type: "pairs",
        hint: "One per line: the image path, then what it shows.",
      },
    ],
    empty: { heading: "", photos: [] },
  },
  {
    kind: "quote",
    label: "Somebody's words",
    blurb: "A guide on their own route. Worth more than a paragraph of ours.",
    fields: [
      { key: "text", label: "What they said", type: "long", max: 500 },
      { key: "who", label: "Who said it", type: "text", max: 60 },
      { key: "role", label: "What they are", type: "text", max: 80 },
    ],
    empty: { text: "", who: "", role: "" },
  },
  {
    kind: "faq",
    label: "Questions",
    blurb: "The five people actually ask. These become the page's FAQ markup.",
    fields: [
      { key: "heading", label: "Heading", type: "text", max: 90 },
      {
        key: "items",
        label: "Questions",
        type: "pairs",
        hint: "One per line: the question, then the answer.",
      },
    ],
    empty: { heading: "Common questions", items: [] },
  },
  {
    kind: "guides",
    label: "Who leads it",
    blurb: "The verified guides who walk this route, from their own claims.",
    fields: [
      { key: "heading", label: "Heading", type: "text", max: 90 },
      { key: "note", label: "A line under it", type: "text", max: 200 },
    ],
    empty: { heading: "", note: "" },
  },
];

const BY_KIND = new Map(BLOCKS.map((b) => [b.kind, b]));

export function blockDef(kind: string): BlockDef | null {
  return BY_KIND.get(kind as BlockKind) ?? null;
}

export interface RouteBlock {
  id: string;
  kind: BlockKind;
  sort: number;
  live: boolean;
  data: Record<string, any>;
}

/**
 * A pair, as the console types it and the page reads it.
 *
 * One textarea, one pair per line, split on the first pipe. A repeating
 * sub-form would be more correct and would also mean four taps to add a line
 * on a phone — and the person editing this is as likely to be on a phone as
 * at a desk.
 */
export function parsePairs(raw: unknown): Array<[string, string]> {
  if (Array.isArray(raw)) {
    return raw
      .map((r) =>
        Array.isArray(r)
          ? ([String(r[0] ?? ""), String(r[1] ?? "")] as [string, string])
          : ([String(r ?? ""), ""] as [string, string]),
      )
      .filter(([a, b]) => a.trim() || b.trim());
  }
  return String(raw ?? "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("|");
      return at === -1
        ? ([line.trim(), ""] as [string, string])
        : ([line.slice(0, at).trim(), line.slice(at + 1).trim()] as [string, string]);
    })
    .filter(([a, b]) => a || b);
}

/** Back to the textarea's own text, so editing a saved block is not retyping. */
export function pairsToText(pairs: unknown): string {
  return parsePairs(pairs)
    .map(([a, b]) => (b ? `${a} | ${b}` : a))
    .join("\n");
}

/**
 * Everything a block of this kind should have, whatever it was saved with.
 *
 * Blocks outlive the editor that wrote them: a kind gains a field, and every
 * block saved before that has to keep rendering. Missing fields come back as
 * the empty ones rather than undefined.
 */
export function normaliseBlock(kind: string, data: unknown): Record<string, any> {
  const def = blockDef(kind);
  if (!def) return {};
  const raw = (data ?? {}) as Record<string, unknown>;
  const out: Record<string, any> = { ...def.empty };
  for (const f of def.fields) {
    const v = raw[f.key];
    if (v === undefined || v === null) continue;
    out[f.key] =
      f.type === "number"
        ? Number(v) || 0
        : f.type === "pairs" || f.type === "list"
          ? parsePairs(v)
          : String(v);
  }
  return out;
}

/** Is there enough in this block to put it in front of a reader? */
export function blockIsEmpty(kind: string, data: Record<string, any>): boolean {
  const def = blockDef(kind);
  if (!def) return true;
  return def.fields.every((f) => {
    const v = data[f.key];
    if (f.type === "pairs" || f.type === "list") return !Array.isArray(v) || v.length === 0;
    if (f.type === "number") return !v;
    return !String(v ?? "").trim();
  });
}

/** Page order: what the console said, then oldest first for anything tied. */
export function orderBlocks(blocks: RouteBlock[]): RouteBlock[] {
  return [...blocks].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}

/** The blocks a reader gets: live, in order, and with something in them. */
export function publishedBlocks(blocks: RouteBlock[]): RouteBlock[] {
  return orderBlocks(blocks).filter(
    (b) => b.live && blockDef(b.kind) && !blockIsEmpty(b.kind, b.data),
  );
}

/**
 * The sort value that puts a block between two others.
 *
 * Moving a block is a swap of two numbers rather than a renumbering of the
 * page, which keeps "move up" to one write and means two people editing two
 * different blocks cannot renumber each other's work.
 */
export function swapSorts(
  blocks: RouteBlock[],
  id: string,
  direction: "up" | "down",
): Array<{ id: string; sort: number }> {
  const ordered = orderBlocks(blocks);
  const from = ordered.findIndex((b) => b.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= ordered.length) return [];

  const moved = ordered[from];
  const neighbour = ordered[to];
  // They trade places: the moved block takes the neighbour's number and the
  // neighbour takes the moved block's.
  if (moved.sort !== neighbour.sort) {
    return [
      { id: moved.id, sort: neighbour.sort },
      { id: neighbour.id, sort: moved.sort },
    ];
  }
  // Equal sorts would leave the order to the id tiebreak and look like the
  // button did nothing, so give them numbers that genuinely differ.
  const step = direction === "up" ? -1 : 1;
  return [
    { id: moved.id, sort: moved.sort + step },
    { id: neighbour.id, sort: neighbour.sort - step },
  ];
}
