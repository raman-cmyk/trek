/**
 * Generating and working a trip's checklist.
 *
 * The rows come from `task-template.ts` and nowhere else. Nothing here writes
 * a task the template does not name, which is what makes regeneration safe:
 * run it as often as you like, it inserts what is missing and touches nothing
 * that is already there.
 *
 * Generated when a booking is paid for rather than when it is enquired about.
 * A trip nobody has put money on has no logistics, and thirty open tasks
 * against it would bury the trips that do.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface TripTask {
  id: string;
  key: string;
  stage: string;
  label: string;
  owner: "client" | "guide" | "office" | "system";
  done_when: string | null;
  due_on: string | null;
  state: "open" | "done" | "waived" | "blocked";
  done_at: string | null;
  waived_reason: string | null;
  note: string | null;
}

const SELECT =
  "id, key, stage, label, owner, done_when, due_on, state, done_at, waived_reason, note";

/**
 * Make sure this booking is running its checklist.
 *
 * The list itself is no longer in this file. It is a template the office
 * writes and edits at /ops/checklists (0105), picked by the offering's kind —
 * a trek gets the trek list, a momo crawl gets the day list — so adding a
 * step no longer needs a deploy by somebody who cannot deploy.
 *
 * Safe on every page load: it inserts what is missing and touches nothing
 * that is there, so a row the office added this morning appears on every live
 * trip without disturbing anything ticked yesterday.
 *
 * Generated when a booking is paid for rather than when it is enquired about.
 * A trip nobody has put money on has no logistics, and thirty open tasks
 * against it would bury the trips that do.
 */
export async function generateTasks(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ added: number }> {
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, start_date, created_at, offering:offerings(kind)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return { added: 0 };

  // Nothing before the money. `pending_deposit` is a trip that may never
  // happen, and a cancelled one has no work left in it.
  const status = String((b as any).status ?? "");
  if (status === "pending_deposit" || status.startsWith("cancelled")) {
    return { added: 0 };
  }

  const { runChecklist } = await import("~/lib/checklists.server");
  const res = await runChecklist(admin, {
    type: "booking",
    id: bookingId,
    appliesTo: (b as any).offering?.kind ?? null,
    startDate: (b as any).start_date,
    createdAt: (b as any).created_at,
  });
  return { added: res.added };
}

export async function listTasks(
  admin: SupabaseClient,
  bookingId: string,
): Promise<TripTask[]> {
  const { data } = await admin
    .from("checklist_tasks")
    .select(SELECT)
    .eq("subject_type", "booking")
    .eq("subject_id", bookingId)
    // Dated first, soonest first; the undated ones ("Daily", "As needed")
    // sit at the bottom where they belong rather than at the top where an
    // empty date would otherwise put them.
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("created_at");
  return (data ?? []) as TripTask[];
}

export interface TaskWrite {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Tick one off. */
export async function completeTask(
  admin: SupabaseClient,
  args: { subjectId: string; taskId: string; by: string; note?: string | null },
): Promise<TaskWrite> {
  const upd = await admin
    .from("checklist_tasks")
    .update({
      state: "done",
      done_at: new Date().toISOString(),
      done_by: args.by,
      note: args.note?.trim() || null,
      // Ticking it clears a waiver, the way verifying a document clears a
      // rejection (0073).
      waived_reason: null,
    })
    .eq("id", args.taskId)
    .eq("subject_id", args.subjectId)
    .select("label");
  if (upd.error || (upd.data ?? []).length === 0) {
    return { ok: false, error: "We could not find that task on this trip." };
  }
  return { ok: true, message: `${(upd.data as any)[0].label} — done.` };
}

/** Put it back. Somebody ticked the wrong row, which happens. */
export async function reopenTask(
  admin: SupabaseClient,
  args: { subjectId: string; taskId: string },
): Promise<TaskWrite> {
  const upd = await admin
    .from("checklist_tasks")
    .update({ state: "open", done_at: null, done_by: null, waived_reason: null })
    .eq("id", args.taskId)
    .eq("subject_id", args.subjectId)
    .select("label");
  if (upd.error || (upd.data ?? []).length === 0) {
    return { ok: false, error: "We could not find that task on this trip." };
  }
  return { ok: true, message: `${(upd.data as any)[0].label} — back on the list.` };
}

const MIN_REASON = 3;
const MAX_REASON = 600;

/**
 * Say this one does not apply, and why.
 *
 * The reason is required at every layer, here and in the database, because a
 * waived task with no reason is a checklist that has quietly stopped being a
 * checklist — six months later nobody can tell whether the porter was waived
 * because the trekker carries their own pack or because somebody was in a
 * hurry.
 */
export async function waiveTask(
  admin: SupabaseClient,
  args: { subjectId: string; taskId: string; by: string; reason: string },
): Promise<TaskWrite> {
  const reason = args.reason.trim();
  if (reason.length < MIN_REASON) {
    return { ok: false, error: "Say why this one does not apply." };
  }
  const upd = await admin
    .from("checklist_tasks")
    .update({
      state: "waived",
      waived_reason: reason.slice(0, MAX_REASON),
      done_at: null,
      done_by: args.by,
    })
    .eq("id", args.taskId)
    .eq("subject_id", args.subjectId)
    .select("label");
  if (upd.error || (upd.data ?? []).length === 0) {
    return { ok: false, error: "We could not find that task on this trip." };
  }
  return { ok: true, message: `${(upd.data as any)[0].label} — waived.` };
}

/**
 * Tick off the tasks whose answer already exists somewhere else.
 *
 * Half the spec's checklist asks about facts this database already holds: the
 * deposit is in `payments`, the contract is in `contracts`, the permits are in
 * `permit_applications`. Generating those as open rows and waiting for the
 * office to tick them would be asking somebody to re-key what the system
 * knows — and on the 38 bookings that already exist it would put a confirmed
 * trek on the board with "Deposit charged" still outstanding.
 *
 * So these stay derived, and this reconciles the rows to them. The other
 * tasks — flights, porter, hotel, briefing pack, cash advance — have no fact
 * behind them anywhere, which is what `trip_tasks` is actually for.
 *
 * One-way on purpose: it ticks, and it never un-ticks. A task somebody
 * deliberately marked done or waived is not something a query should argue
 * with.
 */
export async function syncDerivedTasks(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ ticked: string[] }> {
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, deposit_paid_at, balance_paid_at, insurance_verified_at, party_size, completed_confirmed_at",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return { ticked: [] };

  const [contract, permits, docs, travellers, payouts, review, recap] = await Promise.all([
    admin.from("contracts").select("status").eq("booking_id", bookingId).maybeSingle(),
    admin.from("permit_applications").select("status").eq("booking_id", bookingId),
    admin
      .from("booking_documents")
      .select("type, traveller_id, verified_at, rejected_at, superseded_at")
      .eq("booking_id", bookingId),
    admin.from("booking_travellers").select("id, full_name").eq("booking_id", bookingId),
    admin.from("payouts").select("kind, status").eq("booking_id", bookingId),
    admin.from("reviews").select("id").eq("booking_id", bookingId).limit(1),
    admin.from("recaps").select("id").eq("booking_id", bookingId).limit(1),
  ]);

  const { missingDocs } = await import("~/lib/travellers");
  const owed = missingDocs((travellers.data ?? []) as any, (docs.data ?? []) as any);
  const everyone = (travellers.data ?? []).length >= Math.max(1, Number((b as any).party_size ?? 1));
  const allHave = (type: "passport" | "insurance") =>
    everyone &&
    owed.length > 0 &&
    owed.every((o) => !o.missing.includes(type) && !o.pending.includes(type));

  const permitRows = permits.data ?? [];
  const payoutRows = payouts.data ?? [];

  const done: Record<string, boolean> = {
    deposit: !!(b as any).deposit_paid_at,
    // The guide accepting is what turns a held booking into a paid one; by
    // the time a deposit exists it has happened.
    guide_accept: !!(b as any).deposit_paid_at,
    contract: (contract.data as any)?.status === "signed",
    passport: allHave("passport"),
    insurance: allHave("insurance") && !!(b as any).insurance_verified_at,
    permits: permitRows.length > 0 && permitRows.every((p: any) => p.status === "ready"),
    balance: !!(b as any).balance_paid_at,
    payout: payoutRows.some((p: any) => p.kind === "final" && p.status === "paid"),
    advance: payoutRows.some((p: any) => p.kind === "advance" && p.status === "paid"),
    review: (review.data ?? []).length > 0,
    journal: (recap.data ?? []).length > 0,
  };

  const keys = Object.entries(done)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (keys.length === 0) return { ticked: [] };

  await admin
    .from("checklist_tasks")
    .update({ state: "done", done_at: new Date().toISOString() })
    .eq("subject_id", bookingId)
    .in("key", keys)
    .eq("state", "open");
  return { ticked: keys };
}

/**
 * The three things anybody does to a task, from any page.
 *
 * The guide page, the experience page and the booking page all run the same
 * checklists, so they answer the same three intents the same way rather than
 * growing three copies of this.
 */
export async function handleTaskIntent(
  admin: SupabaseClient,
  args: { intent: string; subjectId: string; form: FormData; by: string },
): Promise<TaskWrite | null> {
  const taskId = String(args.form.get("task_id") ?? "");
  const shared = { subjectId: args.subjectId, taskId };
  if (args.intent === "task_done") {
    return completeTask(admin, {
      ...shared,
      by: args.by,
      note: String(args.form.get("note") ?? ""),
    });
  }
  if (args.intent === "task_reopen") return reopenTask(admin, shared);
  if (args.intent === "task_waive") {
    return waiveTask(admin, {
      ...shared,
      by: args.by,
      reason: String(args.form.get("reason") ?? ""),
    });
  }
  return null;
}
