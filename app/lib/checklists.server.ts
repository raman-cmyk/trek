/**
 * Reading, editing and running the checklists.
 *
 * Templates live in `checklists` / `checklist_items` (0105) and the office
 * edits them at /ops/checklists. Running one against a subject — a booking, a
 * guide, an experience — writes rows into `checklist_tasks`, which is
 * `trip_tasks` generalised rather than a second task model beside it.
 *
 * Generation is idempotent by design: insert what is missing on
 * (subject_type, subject_id, key) and touch nothing that is already there. So
 * this can run on every page load, adding a row the office added to the
 * template this morning without disturbing anything ticked yesterday.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickChecklist,
  resolveDue,
  slugKey,
  type Checklist,
  type ChecklistItem,
  type Scope,
} from "~/lib/checklists";

const LIST_COLS = "id, scope, key, name, description, applies_to, is_default, active";
const ITEM_COLS =
  "id, checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required, active";

export async function listChecklists(
  admin: SupabaseClient,
  scope?: Scope,
): Promise<Checklist[]> {
  let q = admin.from("checklists").select(LIST_COLS).order("scope").order("name");
  if (scope) q = q.eq("scope", scope);
  const { data } = await q;
  return (data ?? []) as Checklist[];
}

export async function getChecklist(
  admin: SupabaseClient,
  key: string,
): Promise<{ list: Checklist | null; items: ChecklistItem[] }> {
  const { data: list } = await admin
    .from("checklists")
    .select(LIST_COLS)
    .eq("key", key)
    .maybeSingle();
  if (!list) return { list: null, items: [] };
  const { data: items } = await admin
    .from("checklist_items")
    .select(ITEM_COLS)
    .eq("checklist_id", (list as any).id)
    .order("position");
  return { list: list as Checklist, items: (items ?? []) as ChecklistItem[] };
}

/** How many subjects are running each list, so nothing is deleted blind. */
export async function checklistUsage(
  admin: SupabaseClient,
): Promise<Record<string, number>> {
  const { data } = await admin
    .from("checklist_tasks")
    .select("checklist_id, subject_id")
    .not("checklist_id", "is", null);
  const seen = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const k = String((row as any).checklist_id);
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(String((row as any).subject_id));
  }
  return Object.fromEntries([...seen].map(([k, v]) => [k, v.size]));
}

export interface Write {
  ok: boolean;
  error?: string;
  message?: string;
  key?: string;
}

/* ── editing a template ─────────────────────────────────────────────── */

export async function createChecklist(
  admin: SupabaseClient,
  args: {
    scope: Scope;
    name: string;
    description?: string | null;
    appliesTo: string[];
    isDefault: boolean;
    by: string;
    /** Start from this list's rows rather than from nothing. */
    copyFromKey?: string | null;
  },
): Promise<Write> {
  const base = slugKey(args.name);
  // A key nobody has taken. Two lists called "Guide papers" is a thing the
  // office will do, and the second one should not fail with a database error.
  let key = base;
  for (let i = 2; i < 40; i++) {
    const { data: taken } = await admin
      .from("checklists")
      .select("id")
      .eq("key", key)
      .maybeSingle();
    if (!taken) break;
    key = `${base}_${i}`;
  }

  const ins = await admin
    .from("checklists")
    .insert({
      scope: args.scope,
      key,
      name: args.name.trim(),
      description: args.description?.trim() || null,
      applies_to: args.appliesTo,
      is_default: args.isDefault,
      created_by: args.by,
    })
    .select("id, key")
    .single();
  if (ins.error || !ins.data) {
    return { ok: false, error: "That list would not save. Try again." };
  }
  if (args.isDefault) await clearOtherDefaults(admin, args.scope, (ins.data as any).id);

  if (args.copyFromKey) {
    const from = await getChecklist(admin, args.copyFromKey);
    if (from.items.length > 0) {
      await admin.from("checklist_items").insert(
        from.items.map((i) => ({
          checklist_id: (ins.data as any).id,
          key: i.key,
          label: i.label,
          stage: i.stage,
          owner: i.owner,
          done_when: i.done_when,
          anchor: i.anchor,
          offset_days: i.offset_days,
          position: i.position,
          required: i.required,
        })),
      );
    }
  }
  return { ok: true, key: (ins.data as any).key, message: `${args.name.trim()} created.` };
}

/**
 * One default per scope.
 *
 * Two defaults is worse than none: `pickChecklist` would take whichever the
 * database happened to return first, and which list a new guide got would
 * depend on the sort order.
 */
async function clearOtherDefaults(admin: SupabaseClient, scope: Scope, keepId: string) {
  await admin
    .from("checklists")
    .update({ is_default: false })
    .eq("scope", scope)
    .eq("is_default", true)
    .neq("id", keepId);
}

export async function updateChecklist(
  admin: SupabaseClient,
  args: {
    id: string;
    name: string;
    description?: string | null;
    appliesTo: string[];
    isDefault: boolean;
    active: boolean;
  },
): Promise<Write> {
  const upd = await admin
    .from("checklists")
    .update({
      name: args.name.trim(),
      description: args.description?.trim() || null,
      applies_to: args.appliesTo,
      is_default: args.isDefault,
      active: args.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.id)
    .select("scope, key");
  if (upd.error || (upd.data ?? []).length === 0) {
    return { ok: false, error: "We could not find that list." };
  }
  if (args.isDefault) {
    await clearOtherDefaults(admin, (upd.data as any)[0].scope as Scope, args.id);
  }
  return { ok: true, key: (upd.data as any)[0].key, message: "Saved." };
}

/**
 * Delete a list, unless somebody is running it.
 *
 * A template with runs behind it is the definition of what those runs mean;
 * removing it would leave rows nobody can explain. Switching it off instead
 * stops it being handed out and leaves the history readable.
 */
export async function deleteChecklist(
  admin: SupabaseClient,
  id: string,
): Promise<Write> {
  const { data: used } = await admin
    .from("checklist_tasks")
    .select("id")
    .eq("checklist_id", id)
    .limit(1);
  if ((used ?? []).length > 0) {
    return {
      ok: false,
      error: "This list is already running somewhere. Switch it off instead — that stops it being handed out and keeps the history readable.",
    };
  }
  const del = await admin.from("checklists").delete().eq("id", id).select("id");
  if (del.error) return { ok: false, error: "That would not delete. Try again." };
  return { ok: true, message: "List deleted." };
}

export async function addItem(
  admin: SupabaseClient,
  args: {
    checklistId: string;
    label: string;
    stage: string;
    owner: string;
    doneWhen?: string | null;
    anchor: string;
    offsetDays: number | null;
    required: boolean;
  },
): Promise<Write> {
  const { data: existing } = await admin
    .from("checklist_items")
    .select("key, position")
    .eq("checklist_id", args.checklistId);
  const taken = new Set((existing ?? []).map((i: any) => i.key));
  const base = slugKey(args.label) || "item";
  let key = base;
  for (let i = 2; taken.has(key) && i < 60; i++) key = `${base}_${i}`;
  const position =
    (existing ?? []).reduce((max: number, i: any) => Math.max(max, i.position), -1) + 1;

  const ins = await admin.from("checklist_items").insert({
    checklist_id: args.checklistId,
    key,
    label: args.label.trim(),
    stage: args.stage.trim() || "General",
    owner: args.owner,
    done_when: args.doneWhen?.trim() || null,
    anchor: args.anchor,
    offset_days: args.anchor === "none" ? null : args.offsetDays,
    position,
    required: args.required,
  });
  if (ins.error) return { ok: false, error: "That row would not save. Try again." };
  return { ok: true, message: `“${args.label.trim()}” added.` };
}

export async function updateItem(
  admin: SupabaseClient,
  args: {
    id: string;
    label: string;
    stage: string;
    owner: string;
    doneWhen?: string | null;
    anchor: string;
    offsetDays: number | null;
    required: boolean;
    active: boolean;
  },
): Promise<Write> {
  const upd = await admin
    .from("checklist_items")
    .update({
      label: args.label.trim(),
      stage: args.stage.trim() || "General",
      owner: args.owner,
      done_when: args.doneWhen?.trim() || null,
      anchor: args.anchor,
      offset_days: args.anchor === "none" ? null : args.offsetDays,
      required: args.required,
      active: args.active,
    })
    .eq("id", args.id)
    .select("id");
  if (upd.error || (upd.data ?? []).length === 0) {
    return { ok: false, error: "We could not find that row." };
  }
  return { ok: true, message: "Saved." };
}

/**
 * Remove a row.
 *
 * The tasks already generated from it stay: somebody ticked those, and a
 * template changing its mind does not un-do the morning they spent on it.
 * They simply stop being generated for anyone new.
 */
export async function deleteItem(admin: SupabaseClient, id: string): Promise<Write> {
  const del = await admin.from("checklist_items").delete().eq("id", id).select("id");
  if (del.error) return { ok: false, error: "That would not delete. Try again." };
  return { ok: true, message: "Row removed. Anything already ticked against it stays ticked." };
}

/** Move a row up or down, renumbering the whole list so positions stay tidy. */
export async function moveItem(
  admin: SupabaseClient,
  args: { checklistId: string; itemId: string; dir: -1 | 1 },
): Promise<Write> {
  const { data: items } = await admin
    .from("checklist_items")
    .select("id, position")
    .eq("checklist_id", args.checklistId)
    .order("position");
  const rows = (items ?? []) as Array<{ id: string; position: number }>;
  const i = rows.findIndex((r) => r.id === args.itemId);
  if (i < 0) return { ok: false, error: "We could not find that row." };
  const j = i + args.dir;
  if (j < 0 || j >= rows.length) return { ok: true, message: "" };
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].position !== k) {
      await admin.from("checklist_items").update({ position: k }).eq("id", rows[k].id);
    }
  }
  return { ok: true, message: "" };
}

/* ── running one ────────────────────────────────────────────────────── */

export interface Subject {
  type: Scope;
  id: string;
  /** What decides which list applies: an offering kind, or a guide label. */
  appliesTo?: string | null;
  /** Departure or slot date, for the `start` anchor. */
  startDate?: string | null;
  /** When this subject came into being, for the `created` anchor. */
  createdAt?: string | null;
}

/**
 * Make sure this subject is running its checklist, and add anything the
 * office has put on the template since.
 *
 * Returns the number of rows added, which is 0 on all but the first call and
 * after a template grows. `listKey` forces a particular list — that is how
 * ops starts the trekking-guide list on a guide the data cannot classify.
 */
export async function runChecklist(
  admin: SupabaseClient,
  subject: Subject,
  listKey?: string | null,
): Promise<{ added: number; checklist: Checklist | null }> {
  const lists = await listChecklists(admin, subject.type);
  const chosen = listKey
    ? lists.find((l) => l.key === listKey) ?? null
    : pickChecklist(lists, subject.type, subject.appliesTo);
  if (!chosen) return { added: 0, checklist: null };

  const { items } = await getChecklist(admin, chosen.key);
  const live = items.filter((i) => i.active);
  if (live.length === 0) return { added: 0, checklist: chosen };

  const { data: existing } = await admin
    .from("checklist_tasks")
    .select("key")
    .eq("subject_type", subject.type)
    .eq("subject_id", subject.id);
  const have = new Set((existing ?? []).map((t: any) => t.key));
  const missing = live.filter((i) => !have.has(i.key));
  if (missing.length === 0) return { added: 0, checklist: chosen };

  const createdAt = subject.createdAt ?? new Date().toISOString();
  const ins = await admin.from("checklist_tasks").insert(
    missing.map((i) => ({
      subject_type: subject.type,
      subject_id: subject.id,
      booking_id: subject.type === "booking" ? subject.id : null,
      checklist_id: chosen.id,
      key: i.key,
      stage: i.stage,
      label: i.label,
      owner: i.owner,
      done_when: i.done_when,
      due_on: resolveDue(i, { startDate: subject.startDate, createdAt }),
      position: i.position,
    })),
  );
  // Two page loads at once both see nothing and both insert; the unique index
  // decides, and losing that race is not an error worth showing anybody.
  if (ins.error && !String(ins.error.message).includes("duplicate key")) {
    return { added: 0, checklist: chosen };
  }
  return { added: missing.length, checklist: chosen };
}

const TASK_COLS =
  "id, key, stage, label, owner, done_when, due_on, state, done_at, waived_reason, note, position, checklist_id";

export async function listTasksFor(
  admin: SupabaseClient,
  subject: { type: Scope; id: string },
) {
  const { data } = await admin
    .from("checklist_tasks")
    .select(TASK_COLS)
    .eq("subject_type", subject.type)
    .eq("subject_id", subject.id)
    .order("position")
    .order("created_at");
  return data ?? [];
}

/** Which lists are running on this subject, for the "add another list" picker. */
export async function runningLists(
  admin: SupabaseClient,
  subject: { type: Scope; id: string },
): Promise<string[]> {
  const { data } = await admin
    .from("checklist_tasks")
    .select("checklist_id")
    .eq("subject_type", subject.type)
    .eq("subject_id", subject.id)
    .not("checklist_id", "is", null);
  return [...new Set((data ?? []).map((r: any) => String(r.checklist_id)))];
}

/* ── ticking off what is already known ──────────────────────────────── */

/**
 * A guide's checklist, reconciled against the verification checks.
 *
 * Six of the core steps are not new work: `guide_verifications` has held the
 * licence, the ID match, the phone call, the PAN card, the payout account and
 * the police clearance since the first migration, and asking the office to
 * tick them twice is how two records start disagreeing. The item keys are the
 * check types on purpose, so they tick themselves.
 *
 * The rest of the list — the introduction call, a reference somebody actually
 * rang, the porter welfare rules, the languages heard — is what nothing else
 * knows, which is what the checklist is for.
 *
 * One-way: it ticks and never un-ticks. A check that later expires is the
 * verification record's business, not an argument with a morning's work.
 */
export async function syncGuideChecklist(
  admin: SupabaseClient,
  guideId: string,
): Promise<{ ticked: number }> {
  const [{ data: checks }, { data: guide }] = await Promise.all([
    admin
      .from("guide_verifications")
      .select("check_type, status")
      .eq("guide_id", guideId),
    admin
      .from("guides")
      .select("bio, hook_line, user_id, users(avatar_url)")
      .eq("user_id", guideId)
      .maybeSingle(),
  ]);

  // `passed` and `not_required` both mean the office is finished with it —
  // "we looked, this one does not apply" is a real answer, not a gap.
  const cleared = new Set(
    (checks ?? [])
      .filter((c: any) => c.status === "passed" || c.status === "not_required")
      .map((c: any) => String(c.check_type)),
  );

  const keys = [...cleared];
  if ((guide as any)?.users?.avatar_url && String((guide as any)?.hook_line ?? "").trim()) {
    keys.push("photo");
  }
  if (keys.length === 0) return { ticked: 0 };

  await admin
    .from("checklist_tasks")
    .update({ state: "done", done_at: new Date().toISOString() })
    .eq("subject_type", "guide")
    .eq("subject_id", guideId)
    .in("key", keys)
    .eq("state", "open");
  return { ticked: keys.length };
}

/**
 * An experience's checklist, reconciled against the experience itself.
 *
 * Most of "is this ready to go live" is answerable from the row: it either has
 * photographs or it does not. The steps that are not — the test booking, the
 * price checked line by line, the link preview — are the ones a person has to
 * say they did.
 */
export async function syncOfferingChecklist(
  admin: SupabaseClient,
  offeringId: string,
): Promise<{ ticked: number }> {
  const { data: o } = await admin
    .from("offerings")
    .select(
      "id, title, summary, cover_photo_url, price_usd_cents, included, excluded, meeting_point, min_party, max_party, itinerary, route_id, activity_level, accessibility, kind",
    )
    .eq("id", offeringId)
    .maybeSingle();
  if (!o) return { ticked: 0 };

  const has = (v: unknown) =>
    Array.isArray(v) ? v.length > 0 : String(v ?? "").trim().length > 0;

  const done: Record<string, boolean> = {
    title: has((o as any).title),
    summary: String((o as any).summary ?? "").trim().length >= 40,
    photos: has((o as any).cover_photo_url),
    included: has((o as any).included) && has((o as any).excluded),
    meeting_point: has((o as any).meeting_point),
    capacity: !!(o as any).min_party && !!(o as any).max_party,
    itinerary: has((o as any).itinerary),
    accessibility: has((o as any).activity_level) && has((o as any).accessibility),
    // Only a route-backed experience needs a route; the step is optional, and
    // an experience that has one has answered it.
    route: !!(o as any).route_id,
  };

  const keys = Object.entries(done)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (keys.length === 0) return { ticked: 0 };

  await admin
    .from("checklist_tasks")
    .update({ state: "done", done_at: new Date().toISOString() })
    .eq("subject_type", "offering")
    .eq("subject_id", offeringId)
    .in("key", keys)
    .eq("state", "open");
  return { ticked: keys.length };
}
