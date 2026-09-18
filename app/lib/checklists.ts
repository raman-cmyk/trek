/**
 * Checklists the office writes, instead of checklists we ship.
 *
 * Three hardcoded lists had grown up in three different shapes — the guide
 * verification check types, a trek's thirty tasks, and nothing at all for
 * putting an experience live — and every change to any of them needed a
 * deploy. The founder cannot deploy. So the lists became data (0105), and
 * this is the part that reads them.
 *
 * Pure: picking which list applies, resolving a due date, and saying what is
 * wrong with a list somebody is editing. The database half is in
 * `checklists.server.ts`.
 */

export const SCOPES = ["booking", "guide", "offering"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABEL: Record<Scope, string> = {
  booking: "A booking",
  guide: "A guide",
  offering: "An experience",
};

/** What "applies to" means in each scope — the words the builder shows. */
export const SCOPE_APPLIES_HINT: Record<Scope, string> = {
  booking: "Which kinds of experience this runs for: trek, day_hike, food_culture, adventure, city.",
  guide: "A label you choose, so you can tell the lists apart — “trek guide”, “food host”, “driver”. Ops picks which list to run.",
  offering: "Which kinds of experience this runs for.",
};

export const OWNERS = ["client", "guide", "office", "system"] as const;
export type Owner = (typeof OWNERS)[number];

export const OWNER_LABEL: Record<Owner, string> = {
  client: "Trekker",
  guide: "Guide",
  office: "Office",
  system: "Automatic",
};

export const ANCHORS = ["start", "created", "none"] as const;
export type Anchor = (typeof ANCHORS)[number];

export const ANCHOR_LABEL: Record<Anchor, string> = {
  start: "Before/after the start date",
  created: "After this list was started",
  none: "No date",
};

export interface Checklist {
  id: string;
  scope: Scope;
  key: string;
  name: string;
  description?: string | null;
  applies_to: string[];
  is_default: boolean;
  active: boolean;
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  key: string;
  label: string;
  stage: string;
  owner: Owner;
  done_when?: string | null;
  anchor: Anchor;
  offset_days?: number | null;
  position: number;
  required: boolean;
  active: boolean;
}

export interface Problem {
  field: string;
  message: string;
}

const problem = (field: string, message: string): Problem => ({ field, message });

/** A key somebody typed, made safe to use as one. */
export function slugKey(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/**
 * Which list applies to this subject.
 *
 * The most specific match wins: a list naming this kind beats the default,
 * and a default beats nothing. Returns null rather than guessing when there
 * is no default — an empty checklist is better than the wrong one.
 */
export function pickChecklist(
  lists: Checklist[],
  scope: Scope,
  appliesTo: string | null | undefined,
): Checklist | null {
  const live = lists.filter((l) => l.active && l.scope === scope);
  const key = String(appliesTo ?? "").trim();
  if (key) {
    const match = live.find((l) => l.applies_to.includes(key));
    if (match) return match;
  }
  return live.find((l) => l.is_default) ?? null;
}

/**
 * When this item is due.
 *
 * `start` counts from the trip's departure or the experience's slot, so a
 * negative offset is T-minus. `created` counts from the day the list was
 * started, which is how "within 7 days" on a guide's papers is expressed.
 * `none` has no date, and an item with no date can never be late — that badge
 * would sit on a guide's evening check-in for ever.
 */
export function resolveDue(
  item: Pick<ChecklistItem, "anchor" | "offset_days">,
  dates: { startDate?: string | null; createdAt?: string | null },
): string | null {
  if (item.anchor === "none" || item.offset_days == null) return null;
  const anchor =
    item.anchor === "start" ? dates.startDate : String(dates.createdAt ?? "").slice(0, 10);
  const base = String(anchor ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  const t = Date.parse(`${base}T00:00:00Z`);
  return new Date(t + item.offset_days * 86_400_000).toISOString().slice(0, 10);
}

/** Everything wrong with a list somebody is saving, at once. */
export function checklistProblems(input: {
  name?: string | null;
  key?: string | null;
  scope?: string | null;
  appliesTo?: string[] | null;
}): Problem[] {
  const out: Problem[] = [];
  const name = String(input.name ?? "").trim();
  if (name.length < 2) out.push(problem("name", "Give the list a name."));
  if (name.length > 80) out.push(problem("name", "That is a long name for a list."));
  if (!slugKey(input.key ?? name)) {
    out.push(problem("key", "That name has no letters or numbers in it."));
  }
  if (!SCOPES.includes(String(input.scope) as Scope)) {
    out.push(problem("scope", "Say whether this is for a booking, a guide or an experience."));
  }
  for (const a of input.appliesTo ?? []) {
    if (a.trim().length > 40) out.push(problem("applies_to", `“${a.slice(0, 20)}…” is too long.`));
  }
  return out;
}

/** Everything wrong with one row of a list. */
export function itemProblems(input: {
  label?: string | null;
  stage?: string | null;
  owner?: string | null;
  anchor?: string | null;
  offsetDays?: number | string | null;
  doneWhen?: string | null;
}): Problem[] {
  const out: Problem[] = [];
  const label = String(input.label ?? "").trim();
  if (label.length < 2) out.push(problem("label", "Say what has to be done."));
  if (label.length > 160) out.push(problem("label", "Keep it to one line somebody can read at a glance."));
  if (String(input.stage ?? "").trim().length > 40) {
    out.push(problem("stage", "That is a long heading."));
  }
  if (input.owner && !OWNERS.includes(String(input.owner) as Owner)) {
    out.push(problem("owner", "Whose job is it — the trekker, the guide, the office, or automatic?"));
  }
  const anchor = String(input.anchor ?? "none");
  if (!ANCHORS.includes(anchor as Anchor)) {
    out.push(problem("anchor", "That is not a way of counting a date."));
  }
  const rawOffset = input.offsetDays;
  const hasOffset = rawOffset !== null && rawOffset !== undefined && String(rawOffset).trim() !== "";
  if (anchor === "none" && hasOffset) {
    out.push(problem("offset_days", "This one has no date, so there is nothing to count from."));
  }
  if (anchor !== "none") {
    if (!hasOffset) {
      out.push(problem("offset_days", "How many days? Negative is before, positive is after."));
    } else {
      const n = Number(rawOffset);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        out.push(problem("offset_days", "Give it in whole days."));
      } else if (Math.abs(n) > 400) {
        out.push(problem("offset_days", "That is more than a year either side."));
      }
      if (anchor === "created" && Number(rawOffset) < 0) {
        out.push(problem("offset_days", "This counts forward from the day the list starts, so it cannot be negative."));
      }
    }
  }
  if (String(input.doneWhen ?? "").length > 200) {
    out.push(problem("done_when", "Keep “done when” short."));
  }
  return out;
}

/** The stages in the order the items sit in, for a grouped checklist. */
export function stagesOf(items: ChecklistItem[]): string[] {
  const out: string[] = [];
  for (const i of [...items].sort((a, b) => a.position - b.position)) {
    if (!out.includes(i.stage)) out.push(i.stage);
  }
  return out;
}

/**
 * Where an item lands when it is moved up or down.
 *
 * Positions are renumbered from zero on every save, so a list edited twenty
 * times does not end up with everything at position 0.
 */
export function reorder<T extends { id: string }>(items: T[], id: string, dir: -1 | 1): T[] {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return items;
  const j = i + dir;
  if (j < 0 || j >= items.length) return items;
  const out = [...items];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
