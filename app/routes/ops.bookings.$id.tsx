import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.bookings.$id";
import { getEnv } from "~/lib/supabase.server";
import { emergencyLine } from "~/lib/emergency";
import { requireOps } from "~/lib/supabase.server";
import {
  verifyDocument,
  rejectDocument,
  uploadDocument,
  deleteBookingDocument,
  uploadPermitScan,
} from "~/lib/documents.server";
import { cleanReason, docState, liveDocs, rejectionProblem } from "~/lib/doc-review";
import {
  completeTask,
  generateTasks,
  listTasks,
  reopenTask,
  syncDerivedTasks,
  waiveTask,
} from "~/lib/tasks.server";
import { byStage, dueLabel, isOverdue, taskSummary } from "~/lib/tasks";
import {
  addTraveller,
  ensureLeadTraveller,
  listTravellers,
  removeTraveller,
  renameTraveller,
  setLeadTraveller,
} from "~/lib/roster.server";
import {
  PERMIT_STATUSES,
  PERMIT_TONE,
  manualEntryProblem,
  stampsFor,
  type PermitStatus,
} from "~/lib/permits";
import { fmtDate } from "~/lib/format";
import {
  missingDays,
  wasLate,
  trekDay,
  canRecord,
  missedRunEndingAt,
  needsWelfareCheck,
} from "~/lib/checkin";
import { generateContractForBooking } from "~/lib/contracts.server";
import { issueTimsCard } from "~/lib/tims.server";
import { sendEmail, sendGuideSms } from "~/lib/notify.server";
import { Badge, Panel } from "~/components/ops/ui";
import { one, rows } from "~/lib/ops.server";
import { formatUsd } from "~/lib/pricing";
import { bookingBreakdown, payoutUsdCents } from "~/lib/booking-breakdown";
import { bookingDue } from "~/lib/booking-due";
import { tripReadiness, byOwner, OWNER_LABEL, daysUntil, type ReadinessStep } from "~/lib/trip-readiness";
import {
  ARRANGEMENT_KINDS,
  ARRANGEMENT_STATUSES,
  arrangementTotals,
  formatMinor,
  kindLabel,
  sortArrangements,
} from "~/lib/arrangements";
import { hasBreakdown, addOns } from "~/lib/experience-pricing";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  // A booking that is not there and a query the database refused are two
  // different answers, and this page used to give the same one to both: a
  // 404. Opening a live trek and being told it does not exist is how that
  // reads, and it is in docs/OPS-PAGES.md as one of the three failures this
  // area has shipped.
  const booking = await one<any>(
    admin
      .from("bookings")
      .select(
        "id, status, guide_id, start_date, end_date, party_size, meeting_point, total_usd_cents, guide_fee_usd_cents, porter_fee_usd_cents, permit_fees_usd_cents, permit_handling_usd_cents, logistics_usd_cents, service_fee_usd_cents, fund_usd_cents, commission_usd_cents, deposit_usd_cents, guide_payout_npr_paisa, fx_rate_npr, hold_expires_at, insurance_provider, insurance_policy_no, insurance_meta, insurance_attested_at, insurance_verified_at, insurance_rejected_at, insurance_rejected_reason, insurance_help_asked_at, insurance_help_closed_at, offering:offerings(title, kind, days, price_breakdown, route:routes(id, name, slug, region, difficulty, max_altitude_m, typical_days, season_months, day_stops)), trekker:users!bookings_trekker_id_fkey(full_name, email, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_email), guide:guides(users(full_name))",
      )
      .eq("id", params.id)
      .maybeSingle(),
    "this booking",
  );
  if (booking.error) throw new Response(booking.error, { status: 500 });
  const b = booking.row;
  if (!b) throw new Response("Not found", { status: 404 });
  const [
    docs,
    permits,
    contract,
    tims,
    instalments,
    payments,
    checkins,
    payouts,
    messages,
    arrangements,
    permitTypes,
  ] = await Promise.all([
    rows<any>(
      admin.from("booking_documents").select("id, person_name, type, traveller_id, verified_at, rejected_at, rejected_reason, superseded_at, created_at").eq("booking_id", b.id).order("created_at"),
      "this trek's documents",
    ),
    rows<any>(
      admin
        .from("permit_applications")
        .select(
          "id, status, reference_no, scan_path, scan_uploaded_at, notes, permit_id, permit:permits(name, code, issuing_body, lead_time_days)",
        )
        .eq("booking_id", b.id),
      "the permits",
    ),
    one<any>(
      admin
        .from("contracts")
        .select("id, title, body_rendered, status, company_signed_at, guide_signed_at, company_signatory")
        .eq("booking_id", b.id)
        .maybeSingle(),
      "the contract",
    ),
    one<any>(
      admin.from("tims_cards").select("card_no, status, issued_at").eq("booking_id", b.id).maybeSingle(),
      "the TIMS card",
    ),
    rows<any>(
      admin
        .from("instalments")
        .select("seq, amount_usd_cents, due_date, status, paid_at")
        .eq("booking_id", b.id)
        .order("seq"),
      "the instalments",
    ),
    rows<any>(
      admin
        .from("payments")
        .select("id, type, amount_usd_cents, status, created_at, stripe_payment_intent, stripe_refund_id")
        .eq("booking_id", b.id)
        .order("created_at"),
      "the payments",
    ),
    // The safety record. Guides walk out of signal for days and fill those
    // days in when they get back down, so the day a check-in is *about* and
    // the day it arrived are different questions — and for due diligence the
    // office has to be able to see which.
    rows<any>(
      admin
        .from("checkins")
        .select("day, method, note, received_at")
        .eq("booking_id", b.id)
        .order("day"),
      "the check-ins",
    ),
    // What the guide has actually been handed, and when. An advance paid
    // before the trek is money the office has already spent; a ledger that
    // only knows about the settlement says the guide is owed it twice.
    rows<any>(
      admin
        .from("payouts")
        .select("id, kind, amount_npr_paisa, method, status, paid_at, batch_ref, note")
        .eq("booking_id", b.id)
        .order("kind"),
      "the guide's payments",
    ),
    // The guide and the trekker talking to each other. The office had to open
    // a second screen to find out whether a question had been answered, which
    // on a trek starting in nine days is the whole of the job.
    rows<any>(
      admin
        .from("messages")
        .select("id, body, sender_id, created_at, flagged_reason")
        .eq("booking_id", b.id)
        .order("created_at", { ascending: false })
        .limit(30),
      "the messages",
    ),
    // Gear, hotels, transport (0096).
    rows<any>(
      admin
        .from("trip_arrangements")
        .select(
          "id, kind, title, vendor, reference, happens_on, status, currency, cost_minor, paid_minor, due_on, note",
        )
        .eq("booking_id", b.id),
      "the arrangements",
    ),
    // Which permits this trip could need. The route's own sort first — a
    // Langtang trek needs Langtang's park entry, not Manaslu's — but the
    // whole list is offered, because a trek that starts in one park and
    // crosses into another is a real trip and the form should not argue.
    rows<any>(
      admin
        .from("permits")
        .select("id, name, code, issuing_body, route_id, lead_time_days")
        .order("name"),
      "the permit types",
    ),
  ]);
  // One line naming whichever panels could not be read. A blank Documents
  // panel on a trek whose passports are the thing you came to check is the
  // failure mode this whole file is guarding against.
  // The office can add or correct a traveller too — for the passports that
  // arrive by email or over a desk in Thamel.
  await ensureLeadTraveller(admin, b.id);
  const travellers = await listTravellers(admin, b.id);

  // The spec's checklist (0103). Generated rather than hand-written, so this
  // is safe on every load and picks up tasks added to the template since.
  await generateTasks(admin, b.id);
  await syncDerivedTasks(admin, b.id);
  const tasks = await listTasks(admin, b.id);

  const loadError =
    [docs, permits, contract, tims, instalments, payments, checkins, payouts, messages, arrangements, permitTypes]
      .map((r) => r.error)
      .filter(Boolean)
      .join(" ") || null;
  return data(
    {
      booking: b,
      loadError,
      travellers,
      tasks,
      documents: docs.rows,
      permits: permits.rows,
      contract: contract.row,
      tims: tims.row,
      instalments: instalments.rows,
      payments: payments.rows,
      payouts: payouts.rows,
      messages: messages.rows,
      arrangements: arrangements.rows,
      permitTypes: permitTypes.rows,
      // One row per day of the trek so far, in order — a gap reads as a gap
      // only when it sits between the days either side of it.
      safety: [
        ...checkins.rows.map((c: any) => ({
          day: c.day as string,
          note: c.note as string | null,
          late: wasLate(c.day, c.received_at),
          receivedAt: c.received_at as string,
          // A day the guide sent and a day the office wrote down for them are
          // different evidence; the log says which.
          byOps: c.method === "ops",
        })),
        ...missingDays(
          b.start_date,
          b.end_date,
          new Date().toISOString().slice(0, 10),
          checkins.rows.map((c: any) => c.day),
        ).map((day) => ({ day, note: null, late: false, receivedAt: null, byOps: false })),
      ].sort((x, y) => x.day.localeCompare(y.day)),
      // Days of silence ending today. Two is where the office stops assuming
      // and picks up a phone, so the panel has to say it rather than leave it
      // to be counted off a list of fifteen rows.
      missedRun: missedRunEndingAt(
        b.start_date,
        b.end_date,
        new Date().toISOString().slice(0, 10),
        checkins.rows.map((c: any) => c.day),
      ),
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "verify") {
    const documentId = String(form.get("document_id"));
    const { confirmed } = await verifyDocument(admin, documentId, user.id);
    if (confirmed) {
      // Booking just became confirmed (permit apps auto-created by trigger).
      const { data: b } = await admin
        .from("bookings")
        .select("trekker:users!bookings_trekker_id_fkey(email), guide:guides(users(phone))")
        .eq("id", params.id)
        .single();
      await sendEmail(env, (b as any)?.trekker?.email, "You're confirmed!", "Your trek is confirmed. Permits are being filed.");
      await sendGuideSms(env, (b as any)?.guide?.users?.phone, "A booking is confirmed — permits filing.");
    }
    return data({ ok: true }, { headers });
  }

  // Sending a document back. The reason is required here, in the form, and in
  // the database (0073) — a rejection nobody can act on is worse than none.
  if (intent === "reject") {
    const documentId = String(form.get("document_id"));
    const reason = String(form.get("reason") ?? "");
    const problem = rejectionProblem(reason);
    if (problem) return data({ error: problem }, { status: 400, headers });

    const { bookingId, personName, type } = await rejectDocument(
      admin,
      documentId,
      user.id,
      reason,
    );
    if (!bookingId) return data({ error: "That document is gone." }, { status: 404, headers });

    // Telling them is the point. A document sent back in silence leaves the
    // trip page reading "checking" and nobody any the wiser.
    const { data: who } = await admin
      .from("bookings")
      .select("trekker:users!bookings_trekker_id_fkey(email)")
      .eq("id", bookingId)
      .single();
    await sendEmail(
      env,
      (who as any)?.trekker?.email,
      `Your ${type} needs redoing`,
      `We could not accept the ${type} for ${personName}: ${cleanReason(reason)}\n\nUpload a new one from your trip page and we will check it again.`,
    );
    return data({ ok: true }, { headers });
  }

  if (intent === "reject_insurance") {
    const reason = String(form.get("reason") ?? "");
    const problem = rejectionProblem(reason);
    if (problem) return data({ error: problem }, { status: 400, headers });

    const { data: b } = await admin
      .from("bookings")
      .update({
        insurance_rejected_at: new Date().toISOString(),
        insurance_rejected_reason: cleanReason(reason),
        insurance_rejected_by: user.id,
        insurance_verified_at: null,
      })
      .eq("id", params.id!)
      .select("trekker:users!bookings_trekker_id_fkey(email)")
      .single();
    await sendEmail(
      env,
      (b as any)?.trekker?.email,
      "Your insurance needs another look",
      `We could not accept your policy: ${cleanReason(reason)}\n\nUpdate it from your trip page and we will check it again.`,
    );
    return data({ ok: true }, { headers });
  }

  // The office adds a document itself — a passport emailed instead of
  // uploaded, a policy the trekker cannot get to upload from Kathmandu.
  if (intent === "add_doc") {
    const file = form.get("file");
    const type = String(form.get("doc_type"));
    const travellerId = String(form.get("traveller_id") ?? "").trim();
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "Choose a file first." }, { status: 400, headers });
    }
    if (type !== "passport" && type !== "insurance") {
      return data({ error: "A document is a passport or an insurance policy." }, { status: 400, headers });
    }
    if (!travellerId) {
      return data({ error: "Whose document is it?" }, { status: 400, headers });
    }
    const up = await uploadDocument(admin, {
      bookingId: params.id!,
      travellerId,
      type,
      file,
    });
    // Looked at, not fired and forgotten — a failed upload used to reload the
    // page unchanged, which reads as a button that does nothing.
    if (!up.ok) return data({ error: up.error ?? "That upload failed." }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  if (intent === "remove_doc") {
    const gone = await deleteBookingDocument(admin, String(form.get("document_id")));
    if (!gone) return data({ error: "That document is already gone." }, { status: 404, headers });
    return data({ ok: true }, { headers });
  }

  // The office writes up a day the guide reported by phone or radio.
  //
  // A guide above the treeline has no signal and sometimes no phone left; the
  // call comes through a teahouse or another party coming down. Until now that
  // could not be recorded, so the safety log said "nothing yet" for a day the
  // office had in fact accounted for — and the welfare sweep kept escalating
  // a trek that was fine.
  if (intent === "record_checkin") {
    const day = String(form.get("day") ?? "").slice(0, 10);
    const note = String(form.get("note") ?? "").trim();
    // one(), not a bare destructure: a refused read here would read as "that
    // booking is gone" and send the office looking for a record that is fine.
    const bk = await one<any>(
      admin.from("bookings").select("start_date, end_date").eq("id", params.id!).maybeSingle(),
      "this booking",
    );
    if (bk.error) return data({ error: bk.error }, { status: 500, headers });
    if (!bk.row) return data({ error: "That booking is gone." }, { status: 404, headers });
    const today = new Date().toISOString().slice(0, 10);
    if (!canRecord(bk.row.start_date, bk.row.end_date, today, day)) {
      return data(
        { error: "That day is outside the trek, or has not happened yet." },
        { status: 400, headers },
      );
    }
    if (!note) {
      return data({ error: "Say what was reported, and who reported it." }, { status: 400, headers });
    }
    const saved = await admin.from("checkins").upsert(
      {
        booking_id: params.id!,
        day,
        method: "ops",
        note,
        received_at: new Date().toISOString(),
      },
      { onConflict: "booking_id,day" },
    );
    if (saved.error) return data({ error: saved.error.message }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  // Money handed to the guide before anybody walks.
  //
  // A guide buys the bus to the trailhead, the first days' food and often a
  // porter's advance out of their own pocket, weeks before a flight is
  // booked. The office pays part of the fee up front; until now there was
  // nowhere to write it down, so it lived in a WhatsApp thread and the ledger
  // said the guide was still owed money they had already had.
  if (intent === "guide_advance") {
    const npr = Number(form.get("amount_npr"));
    const note = String(form.get("note") ?? "").trim();
    if (!isFinite(npr) || npr <= 0) {
      return data({ error: "How much, in rupees?" }, { status: 400, headers });
    }
    const bk = await one<any>(
      admin
        .from("bookings")
        .select("guide_id, guide_payout_npr_paisa, guide:guides(payout_method)")
        .eq("id", params.id!)
        .maybeSingle(),
      "this booking",
    );
    if (bk.error) return data({ error: bk.error }, { status: 500, headers });
    if (!bk.row) return data({ error: "That booking is gone." }, { status: 404, headers });
    const guide = bk.row;

    // Paisa, not rupees — money is integers all the way down (CLAUDE.md #3).
    const paisa = Math.round(npr * 100);
    if (paisa > (guide.guide_payout_npr_paisa ?? 0)) {
      return data(
        { error: "That is more than the guide's whole fee for this trip." },
        { status: 400, headers },
      );
    }
    const saved = await admin.from("payouts").upsert(
      {
        guide_id: guide.guide_id,
        booking_id: params.id!,
        kind: "advance",
        amount_npr_paisa: paisa,
        method: guide.guide?.payout_method ?? "bank",
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_by: user.id,
        note: note || null,
      },
      { onConflict: "booking_id,kind" },
    );
    if (saved.error) return data({ error: saved.error.message }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  if (intent === "mark_payout_paid") {
    const marked = await admin
      .from("payouts")
      .update({ status: "paid", paid_at: new Date().toISOString(), paid_by: user.id })
      .eq("id", String(form.get("payout_id")))
      .eq("booking_id", params.id!);
    if (marked.error) return data({ error: marked.error.message }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  // ── Gear, hotels, transport (0096) ──────────────────────────────────
  if (intent === "arrangement_add") {
    const title = String(form.get("title") ?? "").trim();
    const kind = String(form.get("kind") ?? "other");
    if (!title) return data({ error: "What is it?" }, { status: 400, headers });
    if (!ARRANGEMENT_KINDS.some((k) => k.key === kind)) {
      return data({ error: "That is not one of the kinds." }, { status: 400, headers });
    }
    const cost = Number(form.get("cost") ?? 0);
    const saved = await admin.from("trip_arrangements").insert({
      booking_id: params.id!,
      kind,
      title,
      vendor: String(form.get("vendor") ?? "").trim() || null,
      reference: String(form.get("reference") ?? "").trim() || null,
      happens_on: String(form.get("happens_on") ?? "") || null,
      due_on: String(form.get("due_on") ?? "") || null,
      currency: String(form.get("currency") ?? "NPR").toUpperCase().slice(0, 3),
      // Minor units, like every other amount in this codebase (CLAUDE.md #3).
      cost_minor: isFinite(cost) && cost > 0 ? Math.round(cost * 100) : 0,
      status: "to_book",
      created_by: user.id,
    });
    if (saved.error) return data({ error: saved.error.message }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  if (intent === "arrangement_status") {
    const id = String(form.get("arrangement_id"));
    const status = String(form.get("status"));
    if (!ARRANGEMENT_STATUSES.some((x) => x.key === status)) {
      return data({ error: "That is not a status." }, { status: 400, headers });
    }
    // Marking it paid settles the money too, so "paid" and "still owed" can
    // never disagree on the same row.
    const patch: Record<string, unknown> = { status };
    if (status === "paid") {
      // one(), so a refused read cannot quietly mark a vendor paid for zero.
      const row = await one<any>(
        admin.from("trip_arrangements").select("cost_minor").eq("id", id).maybeSingle(),
        "this arrangement",
      );
      if (row.error) return data({ error: row.error }, { status: 500, headers });
      if (row.row) patch.paid_minor = row.row.cost_minor;
    }
    const saved = await admin
      .from("trip_arrangements")
      .update(patch)
      .eq("id", id)
      .eq("booking_id", params.id!);
    if (saved.error) return data({ error: saved.error.message }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  if (intent === "arrangement_remove") {
    const gone = await admin
      .from("trip_arrangements")
      .delete()
      .eq("id", String(form.get("arrangement_id")))
      .eq("booking_id", params.id!);
    if (gone.error) return data({ error: gone.error.message }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  // ── Permits, on the trip they belong to ─────────────────────────────
  //
  // These were listed here and worked elsewhere: the office read "awaiting
  // docs" on the booking page, then went to the permit tracker, found this
  // trip among every other trip, and acted there. Same three writes the
  // tracker makes, on the page where the question gets asked.
  if (intent === "permit_add") {
    const permitId = String(form.get("permit_id") ?? "");
    const status = String(form.get("status") ?? "awaiting_docs");
    const problem = manualEntryProblem({ bookingId: params.id!, permitId, status });
    if (problem) return data({ error: problem }, { status: 400, headers });

    const added = await admin.from("permit_applications").insert({
      booking_id: params.id!,
      permit_id: permitId,
      status,
      reference_no: String(form.get("reference_no") ?? "").trim() || null,
      notes: String(form.get("notes") ?? "").trim() || null,
      created_by: user.id,
      ...stampsFor(status),
    });
    if (added.error) {
      // 0074's unique index: the confirm trigger already made this one, or
      // somebody logged it a moment ago.
      const already = String((added.error as any).code ?? "") === "23505";
      return data(
        {
          error: already
            ? "That permit is already on this trip — it is in the list."
            : added.error.message,
        },
        { status: 400, headers },
      );
    }
    return data({ ok: true }, { headers });
  }

  if (intent === "permit_status") {
    const status = String(form.get("status"));
    if (!PERMIT_STATUSES.includes(status as PermitStatus)) {
      return data({ error: "That is not a permit status." }, { status: 400, headers });
    }
    const saved = await admin
      .from("permit_applications")
      .update({
        status,
        reference_no: String(form.get("reference_no") ?? "").trim() || null,
        ...stampsFor(status),
      })
      .eq("id", String(form.get("permit_application_id")))
      .eq("booking_id", params.id!);
    if (saved.error) return data({ error: saved.error.message }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  // The issued permit itself, so the trekker has something to show at a
  // checkpost rather than our word that it is "ready".
  if (intent === "permit_scan") {
    const scan = form.get("scan");
    if (!(scan instanceof File) || scan.size === 0) {
      return data({ error: "Choose a file first." }, { status: 400, headers });
    }
    const res = await uploadPermitScan(admin, {
      applicationId: String(form.get("permit_application_id")),
      bookingId: params.id!,
      file: scan,
      uploadedBy: user.id,
    });
    return res.ok
      ? data({ ok: true }, { headers })
      : data({ error: res.error ?? "Upload failed." }, { status: 400, headers });
  }

  if (intent === "close_insurance_help") {
    const done = await admin
      .from("bookings")
      .update({ insurance_help_closed_at: new Date().toISOString() })
      .eq("id", params.id!);
    if (done.error) return data({ error: done.error.message }, { status: 500, headers });
    return data({ ok: true }, { headers });
  }

  if (intent === "gen_contract") {
    await generateContractForBooking(admin, params.id!);
    return data({ ok: true }, { headers });
  }

  if (intent === "verify_insurance") {
    await admin
      .from("bookings")
      .update({
        insurance_verified_at: new Date().toISOString(),
        insurance_rejected_at: null,
        insurance_rejected_reason: null,
        insurance_rejected_by: null,
      })
      .eq("id", params.id!);
    return data({ ok: true }, { headers });
  }

  // The checklist. Thirty rows on a trek, and the office works them here.
  if (intent === "task_done" || intent === "task_reopen" || intent === "task_waive") {
    const taskId = String(form.get("task_id") ?? "");
    const res =
      intent === "task_done"
        ? await completeTask(admin, {
            bookingId: params.id!,
            taskId,
            by: user.id,
            note: String(form.get("note") ?? ""),
          })
        : intent === "task_reopen"
          ? await reopenTask(admin, { bookingId: params.id!, taskId })
          : await waiveTask(admin, {
              bookingId: params.id!,
              taskId,
              by: user.id,
              reason: String(form.get("reason") ?? ""),
            });
    return data(res.ok ? { ok: true } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  // The roster. The office corrects a misspelling off a passport far more
  // often than the trekker does, and a permit is filed against this name.
  if (intent === "roster_add") {
    const res = await addTraveller(admin, {
      bookingId: params.id!,
      fullName: String(form.get("full_name") ?? ""),
      addedBy: user.id,
    });
    return data(res.ok ? { ok: true } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  if (intent === "roster_rename") {
    const res = await renameTraveller(admin, {
      bookingId: params.id!,
      travellerId: String(form.get("traveller_id") ?? ""),
      fullName: String(form.get("full_name") ?? ""),
    });
    return data(res.ok ? { ok: true } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  if (intent === "roster_remove") {
    const res = await removeTraveller(admin, {
      bookingId: params.id!,
      travellerId: String(form.get("traveller_id") ?? ""),
    });
    return data(res.ok ? { ok: true } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  if (intent === "roster_lead") {
    const res = await setLeadTraveller(admin, {
      bookingId: params.id!,
      travellerId: String(form.get("traveller_id") ?? ""),
    });
    return data(res.ok ? { ok: true } : { error: res.error }, {
      status: res.ok ? 200 : 400,
      headers,
    });
  }

  if (intent === "issue_tims") {
    const res = await issueTimsCard(admin, params.id!, user.id);
    if (res.ok) {
      const { notifyTimsIssued } = await import("~/lib/notifications.server");
      await notifyTimsIssued(env, admin, params.id!);
    }
    return data(res.ok ? { ok: true } : { error: res.reason }, { headers });
  }
  return data({ ok: false }, { headers });
}

export default function OpsBooking({ loaderData, actionData }: Route.ComponentProps) {
  const {
    booking: b,
    travellers,
    tasks,
    documents,
    permits,
    contract,
    tims,
    instalments,
    payments,
    payouts,
    messages,
    arrangements,
    permitTypes,
    safety,
    missedRun,
    loadError,
  } = loaderData as any;
  const meta = b.insurance_meta ?? {};
  const insuranceOk = meta.altitude && meta.helicopter;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <Link to="/ops/pipeline" className="hover:underline">Pipeline</Link>
        <span>/</span>
        <span className="text-ink">{b.offering?.title}</span>
      </div>

      {/* Which panels below are empty because there is nothing in them, and
          which are empty because the read failed. */}
      {loadError && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      )}

      {/* A rejection refused for want of a reason has to say so somewhere the
          eye lands, not inside the panel that scrolled away. */}
      {(actionData as any)?.error && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {(actionData as any).error}
        </p>
      )}

      {/* Before anything else: what is still in the way, and whose move it
          is. Everything below this line is a detail of one of these rows. */}
      <Readiness
        booking={b}
        travellers={travellers}
        documents={documents}
        permits={permits}
        permitTypes={permitTypes}
        tims={tims}
        contract={contract}
        payments={payments}
        instalments={instalments}
        arrangements={arrangements}
        payouts={payouts}
      />

      {/* The day-by-day, full width and above the panels, because when a
          trek is walking this is the thing the office opens the page for. */}
      <Itinerary booking={b} />

      {/* Two columns that both carry weight.
          
          Everything used to hang off the wide column while the narrow one held
          a single short panel, so the left of the page stopped and the right
          scrolled for ever. The rail now keeps the people, the conversation
          and the logistics, and sticks to the top of the viewport — on an
          incident call the trekker's emergency number stays on screen however
          far down the checklist you are. */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:sticky lg:top-4">
        <Panel title="Booking">
          <dl className="space-y-1 text-sm">
            <Row label="Status"><Badge tone="blue">{b.status.replace(/_/g, " ")}</Badge></Row>
            <Row label="Trekker" value={b.trekker?.full_name} />
            <Row label="Guide" value={b.guide?.users?.full_name} />
            <Row label="Dates" value={`${b.start_date} → ${b.end_date}`} />
            <Row label="Party" value={`${b.party_size}`} />
            <Row label="Total" value={formatUsd(b.total_usd_cents)} />
            {/* The number an incident call needs, on the page an incident
                call is already open. */}
            <Row
              label="In an emergency"
              value={emergencyLine(b.trekker ?? {}) ?? "nothing on file"}
            />
          </dl>
        </Panel>

        <Conversation messages={messages} booking={b} />
        <Arrangements rows={arrangements} />
        </div>

        <div className="lg:col-span-2">
          {/* Who first, then their papers — a document with no owner is the
              bug the roster exists to fix. */}
          <Roster travellers={travellers} documents={documents} partySize={b.party_size} />

          <div className="mt-4">
          <Panel title="Documents">
            {documents.length === 0 ? (
              <p className="py-4 text-sm text-ink-soft">No documents uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((d: any) => {
                  const state = docState(d);
                  return (
                  <li key={d.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize">{d.type}</p>
                        <p className="text-xs text-ink-soft">{d.person_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* A plain link to the redirect route, so one click
                            opens the document. It used to be a form that
                            posted, put the signed URL in the page, and drew an
                            "open" link — two clicks, and the link was drawn on
                            EVERY row from one shared value, so opening the
                            passport then clicking "open" beside the insurance
                            showed the passport again. */}
                        <a
                          href={`/ops/doc/booking/${d.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-mist"
                        >
                          View
                        </a>
                        <Form
                          method="post"
                          onSubmit={(e) => {
                            if (!confirm("Delete this document? The file goes too."))
                              e.preventDefault();
                          }}
                        >
                          <input type="hidden" name="intent" value="remove_doc" />
                          <input type="hidden" name="document_id" value={d.id} />
                          <button className="rounded border border-border px-2 py-1 text-xs text-ink-soft hover:border-red-300 hover:bg-red-50 hover:text-red-900">
                            Remove
                          </button>
                        </Form>
                        {state === "verified" ? (
                          <Badge tone="green">verified</Badge>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="verify" />
                            <input type="hidden" name="document_id" value={d.id} />
                            <button className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50">
                              Pass
                            </button>
                          </Form>
                        )}
                      </div>
                    </div>

                    {/* Saying no, and why. The trekker reads this on their own
                        trip page, so it is written to them, not about them. */}
                    {state === "rejected" ? (
                      <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-ink">
                        <span className="font-medium">Sent back:</span> {d.rejected_reason}
                        <span className="ml-1 text-ink-soft">
                          · {fmtDate(d.rejected_at)} · waiting for a new one
                        </span>
                      </p>
                    ) : (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                          Send it back…
                        </summary>
                        <Form method="post" className="mt-1.5 flex flex-wrap items-start gap-2">
                          <input type="hidden" name="intent" value="reject" />
                          <input type="hidden" name="document_id" value={d.id} />
                          <textarea
                            name="reason"
                            rows={2}
                            required
                            placeholder="What is wrong with it? The trekker reads this."
                            className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                          />
                          <button className="rounded border border-border px-2 py-1 text-xs hover:bg-amber-50">
                            Send back
                          </button>
                        </Form>
                      </details>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}

            <AddDocument travellers={travellers} />
          </Panel>
          </div>

          {/* Insurance (2026 gate) */}
          <div className="mt-4">
            <Panel title="Money">
              <div className="px-4 py-3 text-sm">
                <p className="text-ink-soft">
                  Paid so far:{" "}
                  <span className="font-mono text-ink">
                    {formatUsd(
                      payments
                        .filter((p: any) => p.status === "succeeded")
                        .reduce((s: number, p: any) => s + p.amount_usd_cents, 0),
                    )}
                  </span>{" "}
                  of <span className="font-mono text-ink">{formatUsd(b.total_usd_cents)}</span>
                </p>

                <DueFromClient booking={b} payments={payments} instalments={instalments} />
                <CostBreakdown booking={b} />
                <PaymentLog payments={payments} />
                <GuidePayments booking={b} payouts={payouts} />
                {instalments.length > 0 ? (
                  <table className="mt-3 w-full text-left">
                    <thead className="text-xs uppercase text-ink-soft">
                      <tr>
                        <th className="py-1 font-medium">#</th>
                        <th className="py-1 font-medium">Due</th>
                        <th className="py-1 font-medium">Amount</th>
                        <th className="py-1 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instalments.map((it: any) => (
                        <tr key={it.seq} className="border-t border-border">
                          <td className="py-1.5 font-mono">{it.seq}</td>
                          <td className="py-1.5 font-mono">{it.due_date}</td>
                          <td className="py-1.5 font-mono">{formatUsd(it.amount_usd_cents)}</td>
                          <td className="py-1.5">
                            <Badge
                              tone={
                                it.status === "paid"
                                  ? "green"
                                  : it.status === "cancelled"
                                    ? "neutral"
                                    : "amber"
                              }
                            >
                              {it.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-2 text-ink-soft">Single payment — no instalment plan.</p>
                )}

                <WhatsIncluded booking={b} />
              </div>
            </Panel>

            <Panel title="Insurance">
              {/* The ask comes first, above whatever policy state they are
                  in, because it is the one thing here that WE owe THEM. The
                  product told this person a real person was sorting their
                  insurance out; the office has to be able to see that it
                  said so (0097). */}
              {b.insurance_help_asked_at && !b.insurance_help_closed_at && (
                <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  <p className="font-medium">
                    They asked us to arrange their insurance — {fmtDate(b.insurance_help_asked_at)}
                  </p>
                  <p className="mt-0.5 text-xs">
                    They have been told a person is on it. Find them cover with
                    high-altitude and helicopter evacuation, then mark this
                    dealt with.
                  </p>
                  <Form method="post" className="mt-1.5">
                    <input type="hidden" name="intent" value="close_insurance_help" />
                    <button className="rounded border border-sky-300 bg-white px-2 py-1 text-xs hover:bg-sky-100">
                      Dealt with
                    </button>
                  </Form>
                </div>
              )}
              {b.insurance_attested_at ? (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={insuranceOk ? "green" : "amber"}>
                      {insuranceOk ? "high-altitude + heli ✓" : "missing required cover"}
                    </Badge>
                    {b.insurance_verified_at ? (
                      <Badge tone="green">verified</Badge>
                    ) : (
                      <Badge tone="amber">unverified</Badge>
                    )}
                  </div>
                  <p className="text-ink-soft">
                    {b.insurance_provider ?? "—"}
                    {b.insurance_policy_no ? ` · ${b.insurance_policy_no}` : ""}
                  </p>
                  <p className="text-xs text-ink-soft">
                    Cover: {["altitude", "helicopter", "medical", "repatriation", "datesCovered"]
                      .filter((k) => meta[k])
                      .join(", ") || "none declared"}
                  </p>
                  {b.insurance_rejected_at && !b.insurance_verified_at && (
                    <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-ink">
                      <span className="font-medium">Sent back:</span> {b.insurance_rejected_reason}
                      <span className="ml-1 text-ink-soft">· {fmtDate(b.insurance_rejected_at)}</span>
                    </p>
                  )}
                  {!b.insurance_verified_at && (
                    <div className="space-y-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="verify_insurance" />
                        <button className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50">
                          Verify insurance
                        </button>
                      </Form>
                      <details>
                        <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                          {b.insurance_rejected_at ? "Change the reason…" : "Send it back…"}
                        </summary>
                        <Form method="post" className="mt-1.5 flex flex-wrap items-start gap-2">
                          <input type="hidden" name="intent" value="reject_insurance" />
                          <textarea
                            name="reason"
                            rows={2}
                            required
                            defaultValue={b.insurance_rejected_reason ?? ""}
                            placeholder="No helicopter cover above 4,000m, say. The trekker reads this."
                            className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                          />
                          <button className="rounded border border-border px-2 py-1 text-xs hover:bg-amber-50">
                            Send back
                          </button>
                        </Form>
                      </details>
                    </div>
                  )}
                </div>
              ) : (
                <p className="py-2 text-sm text-ink-soft">
                  Trekker hasn't run the insurance checker yet.
                </p>
              )}
            </Panel>
          </div>

          <div className="mt-4">
            <Panel title="Company↔Guide contract">
              {contract ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={contract.status === "signed" ? "green" : "amber"}>
                      {contract.status}
                    </Badge>
                    <span className="text-ink-soft">
                      Company signed{" "}
                      {contract.company_signed_at
                        ? new Date(contract.company_signed_at).toLocaleDateString()
                        : "—"}{" "}
                      · Guide signed{" "}
                      {contract.guide_signed_at
                        ? new Date(contract.guide_signed_at).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                  <a
                    href={`/pdf/contract/${b.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded border border-border px-2 py-1 text-xs text-primary"
                  >
                    Download PDF
                  </a>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      {contract.title} — view
                    </summary>
                    <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-mist p-3 text-xs text-ink">
                      {contract.body_rendered}
                    </pre>
                  </details>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-ink-soft">
                    No contract yet (this booking predates the active template).
                  </p>
                  <Form method="post">
                    <input type="hidden" name="intent" value="gen_contract" />
                    <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                      Generate &amp; sign
                    </button>
                  </Form>
                </div>
              )}
            </Panel>
          </div>

          {safety.length > 0 && (
            <div className="mt-4">
              <Panel title="Daily safety check">
                {/* Two days of silence is where the office stops assuming and
                    picks up a phone. Said here, at the top, rather than left
                    to be counted off fifteen rows of "nothing yet". */}
                {needsWelfareCheck(missedRun) && b.status === "active" && (
                  <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                    <p className="font-medium">
                      No word for {missedRun} days — welfare check.
                    </p>
                    <p className="mt-0.5 text-xs">
                      Call the guide
                      {b.guide?.users?.full_name ? ` (${b.guide.users.full_name})` : ""}. If you
                      cannot reach them, work down the emergency contacts on this
                      page. Write up whatever you learn against the day below, so
                      the log shows the trek was accounted for.
                    </p>
                  </div>
                )}

                <ul className="space-y-1 text-sm">
                  {safety.map((c: any) => (
                    <li key={c.day} className="border-b border-border/50 pb-1 last:border-0">
                      <div className="flex items-start justify-between gap-3">
                        <span className={c.receivedAt ? "min-w-0" : "min-w-0 text-ink-soft"}>
                          {fmtDate(c.day)}
                          {c.note ? <span className="text-ink-soft"> — {c.note}</span> : null}
                        </span>
                        {/* A day written up a week later is still a record, but
                            it is not the same record as one sent that evening,
                            and the office should not have to guess which. */}
                        {!c.receivedAt ? (
                          <Badge tone="red">nothing yet</Badge>
                        ) : c.byOps ? (
                          <Badge tone="blue">office took this</Badge>
                        ) : c.late ? (
                          <Badge tone="amber">filled in {fmtDate(c.receivedAt)}</Badge>
                        ) : (
                          <Badge tone="green">on the day</Badge>
                        )}
                      </div>

                      {/* The office writes up a day the guide reported by
                          phone, radio, or another party coming down. A trek
                          that was accounted for should not keep reading as
                          silence. */}
                      {!c.receivedAt && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                            Write this day up…
                          </summary>
                          <Form method="post" className="mt-1 flex flex-wrap items-start gap-2">
                            <input type="hidden" name="intent" value="record_checkin" />
                            <input type="hidden" name="day" value={c.day} />
                            <input
                              name="note"
                              required
                              placeholder="What was reported, and who from?"
                              className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                            />
                            <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                              Record
                            </button>
                          </Form>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
                {safety.some((c: any) => !c.receivedAt) && (
                  <p className="mt-2 text-caption text-ink-soft">
                    A gap is usually no signal, not no guide. They can still fill
                    these in from their check-in screen until the trek is closed.
                  </p>
                )}
              </Panel>
            </div>
          )}

          <Permits rows={permits} types={permitTypes} booking={b} tims={tims} error={(actionData as any)?.error ?? null} />
          <Checklist tasks={tasks} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right">{children ?? value ?? "—"}</dd>
    </div>
  );
}

/**
 * What the total is made of.
 *
 * Every figure here was snapshotted onto the booking when the guide accepted,
 * so this is what the trekker was actually charged, not what the offering
 * costs today. The lines are checked against the stored total: if they ever
 * disagree the panel says so rather than drawing a tidy table, because an
 * office quoting a refund off a breakdown that does not match the receipt is
 * worse off than one with no breakdown at all.
 */
function CostBreakdown({ booking }: { booking: any }) {
  const b = bookingBreakdown(booking);
  if (b.lines.length === 0) return null;
  const payout = payoutUsdCents(b);

  return (
    <div className="mt-3 rounded-md border border-border">
      <p className="border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
        What makes up the total
      </p>
      <table className="w-full text-left text-sm">
        <tbody>
          {b.lines.map((l) => (
            <tr key={l.key} className="border-b border-border/60">
              <td className="py-1.5 pl-3 pr-2">
                {l.label}
                {l.note && <span className="block text-[11px] text-ink-soft">{l.note}</span>}
              </td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                {formatUsd(l.amountUsdCents)}
              </td>
            </tr>
          ))}
          <tr className="bg-surface">
            <td className="py-1.5 pl-3 pr-2 font-medium">Trekker pays</td>
            <td className="py-1.5 pr-3 text-right font-mono font-medium tabular-nums">
              {formatUsd(b.totalUsdCents)}
            </td>
          </tr>
        </tbody>
      </table>

      {!b.balances && (
        <p className="border-t border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
          These lines come to {formatUsd(b.sumUsdCents)}, which is{" "}
          {formatUsd(Math.abs(b.driftUsdCents))}{" "}
          {b.driftUsdCents > 0 ? "more" : "less"} than the {formatUsd(b.totalUsdCents)} charged.
          Do not quote a refund from this until it is looked at.
        </p>
      )}

      {/* Where the money goes afterwards, which is a different question from
          what the trekker paid — and the reason the two are not one table. */}
      <div className="space-y-1 border-t border-border px-3 py-2 text-xs text-ink-soft">
        <p>
          Deposit taken up front:{" "}
          <span className="font-mono text-ink">{formatUsd(b.depositUsdCents)}</span>
          {b.depositUsdCents === b.totalUsdCents && " — paid in full"}
        </p>
        {b.guidePayoutNprPaisa > 0 && (
          <p>
            Guide is paid:{" "}
            <span className="font-mono text-ink">
              NPR {(b.guidePayoutNprPaisa / 100).toLocaleString("en-US")}
            </span>
            {payout !== null && <> ({formatUsd(payout)} at {b.fxRateNpr} to the dollar, fixed when this was booked)</>}
          </p>
        )}
        {b.commissionUsdCents !== null && (
          <p>
            Commission out of the guide's share:{" "}
            <span className="font-mono text-ink">{formatUsd(b.commissionUsdCents)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Ops uploads a document on somebody's behalf.
 *
 * Passports arrive by email, by WhatsApp, and handed over a desk in Thamel.
 * Until now the only way one reached a booking was the trekker uploading it
 * themselves, so a booking could sit in "docs pending" with the passport
 * sitting in somebody's inbox.
 */
function AddDocument({ travellers }: { travellers: any[] }) {
  if (travellers.length === 0) {
    return (
      <p className="mt-3 border-t border-border pt-3 text-xs text-ink-soft">
        Add who is going before filing a document — every one is filed against a
        person now, not a typed name.
      </p>
    );
  }
  return (
    <details className="mt-3 border-t border-border pt-3">
      <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
        Add a document…
      </summary>
      <Form
        method="post"
        encType="multipart/form-data"
        className="mt-2 flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="intent" value="add_doc" />
        <label className="text-xs text-ink-soft">
          <span className="block">Whose</span>
          <select
            name="traveller_id"
            required
            className="mt-0.5 w-40 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
          >
            {travellers.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          <span className="block">What</span>
          <select
            name="doc_type"
            className="mt-0.5 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
          >
            <option value="passport">Passport</option>
            <option value="insurance">Insurance</option>
          </select>
        </label>
        <input
          type="file"
          name="file"
          required
          accept="image/*,application/pdf"
          className="max-w-[14rem] text-xs"
        />
        <button className="rounded border border-border px-2 py-1.5 text-xs hover:bg-mist">
          Upload
        </button>
      </Form>
      <p className="mt-1.5 text-xs text-ink-soft">
        A second one of the same kind for the same person replaces what we hold.
      </p>
    </details>
  );
}

/**
 * The party, as the permit counter will read it.
 *
 * Names come off passports, and the office types them far more often than the
 * trekker does — a scan arrives by email, somebody walks into the office in
 * Thamel. Correcting a name here corrects it on their documents too, so one
 * booking cannot carry two spellings of one person again.
 */
function Roster({ travellers, documents, partySize }: { travellers: any[]; documents: any[]; partySize: number }) {
  const live = liveDocs(documents);
  return (
    <Panel title={`Who is going · ${travellers.length} of ${partySize}`}>
      <ul className="divide-y divide-border">
        {travellers.map((t: any) => {
          const mine = live.filter((d: any) => d.traveller_id === t.id);
          const has = (type: string) => mine.some((d: any) => d.type === type);
          return (
            <li key={t.id} className="px-4 py-2.5">
              <Form method="post" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="intent" value="roster_rename" />
                <input type="hidden" name="traveller_id" value={t.id} />
                <input
                  name="full_name"
                  defaultValue={t.full_name}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-ink hover:border-border focus:border-primary focus:bg-card"
                />
                <Badge tone={has("passport") ? "green" : "amber"}>passport</Badge>
                <Badge tone={has("insurance") ? "green" : "amber"}>insurance</Badge>
                <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                  Save
                </button>
              </Form>
              <div className="mt-1 flex flex-wrap items-center gap-3 pl-2 text-xs text-ink-soft">
                {t.is_lead ? (
                  <span>· we call them first</span>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="roster_lead" />
                    <input type="hidden" name="traveller_id" value={t.id} />
                    <button className="underline hover:text-ink">call them first</button>
                  </Form>
                )}
                <Form method="post">
                  <input type="hidden" name="intent" value="roster_remove" />
                  <input type="hidden" name="traveller_id" value={t.id} />
                  <button className="underline hover:text-danger">remove</button>
                </Form>
              </div>
            </li>
          );
        })}
      </ul>

      {travellers.length < partySize && (
        <Form method="post" className="flex flex-wrap items-end gap-2 border-t border-border px-4 py-3">
          <input type="hidden" name="intent" value="roster_add" />
          <label className="min-w-0 flex-1 text-xs text-ink-soft">
            <span className="block">Name, as printed on the passport</span>
            <input
              name="full_name"
              required
              className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
            />
          </label>
          <button className="rounded border border-border px-2 py-1.5 text-xs hover:bg-mist">
            Add
          </button>
        </Form>
      )}
      {travellers.length < partySize && (
        <p className="px-4 pb-3 text-xs text-ink-soft">
          {partySize - travellers.length} still to name. Permits cannot be filed
          for a party we cannot name.
        </p>
      )}
    </Panel>
  );
}

/**
 * The trip itself, day by day — and on an active trek, where they are today.
 *
 * The office had the dates, the money and the paperwork on this page and not
 * one word about the trek: to answer "where are they?" during an incident you
 * had to leave for the route page, which does not know this booking's dates.
 * Here the stored itinerary is laid against the booking's own start date, so
 * every day carries the date it actually falls on.
 */
function Itinerary({ booking }: { booking: any }) {
  const route = booking.offering?.route;
  const stops: any[] = Array.isArray(route?.day_stops) ? route.day_stops : [];
  if (stops.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const window = trekDay(booking.start_date, booking.end_date, today);
  // Only mark a day when they are actually out there. A "today" ring on a trek
  // that starts in December says something untrue about a booking in
  // September.
  const walking = window.where === "on" && booking.status === "active";

  const dateOf = (dayNo: number) => {
    const t = Date.parse(`${String(booking.start_date).slice(0, 10)}T00:00:00Z`);
    return new Date(t + (dayNo - 1) * 86_400_000).toISOString().slice(0, 10);
  };

  // One line, unless they are walking.
  //
  // This used to sit full width above every panel, which put fourteen days of
  // itinerary between the office and the work — and the itinerary is the one
  // thing here nobody needs until the trek starts. Open by default only while
  // it is active, which is exactly when "where are they today" is the question
  // the page is being opened to answer.
  const summary = [
    `${stops.length} day${stops.length === 1 ? "" : "s"}`,
    route?.max_altitude_m ? `max ${route.max_altitude_m} m` : null,
    walking ? `day ${window.day} of ${window.total} today` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Panel title={`The trek${route?.name ? ` — ${route.name}` : ""}`}>
      <details open={walking}>
        <summary className="cursor-pointer list-none text-sm text-ink-soft hover:text-ink">
          <span className="font-mono">{summary}</span>
          <span className="ml-2 text-xs underline underline-offset-4">day by day</span>
        </summary>
      <div className="flex flex-wrap items-center gap-2 pb-2 pt-2 text-xs text-ink-soft">
        {route?.region && <Badge tone="neutral">{route.region}</Badge>}
        {route?.difficulty && <Badge tone="neutral">{route.difficulty}</Badge>}
        {route?.max_altitude_m && <Badge tone="neutral">up to {route.max_altitude_m} m</Badge>}
        <span>
          {stops.length} day{stops.length === 1 ? "" : "s"} · {booking.start_date} → {booking.end_date}
        </span>
        {walking ? (
          <Badge tone="green">
            day {window.day} of {window.total} today
          </Badge>
        ) : window.where === "before" ? (
          <Badge tone="blue">starts in {window.daysUntilStart} day{window.daysUntilStart === 1 ? "" : "s"}</Badge>
        ) : (
          <Badge tone="neutral">walked</Badge>
        )}
      </div>

      <ol className="divide-y divide-border border-t border-border">
        {stops.map((stop: any, i: number) => {
          const dayNo = Number(stop.day ?? i + 1);
          const isToday = walking && dayNo === window.day;
          return (
            <li
              key={`${dayNo}-${i}`}
              className={
                "flex gap-3 py-2 text-sm " + (isToday ? "-mx-2 rounded bg-emerald-50 px-2" : "")
              }
            >
              <div className="w-14 shrink-0">
                <p className={"font-medium " + (isToday ? "text-emerald-900" : "text-ink")}>
                  Day {dayNo}
                </p>
                <p className="font-mono text-[11px] text-ink-soft">{dateOf(dayNo).slice(5)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {stop.place ?? "—"}
                  {typeof stop.altitude_m === "number" && (
                    <span className="ml-1.5 font-mono text-xs font-normal text-ink-soft">
                      {stop.altitude_m} m
                    </span>
                  )}
                  {isToday && <span className="ml-2 text-xs text-emerald-800">← today</span>}
                </p>
                {stop.note && <p className="text-xs text-ink-soft">{stop.note}</p>}
                <p className="text-[11px] text-ink-soft">
                  {[
                    stop.sleep && `sleeps at ${stop.sleep}`,
                    typeof stop.nights === "number" && stop.nights > 1 && `${stop.nights} nights here`,
                    typeof stop.km === "number" && `${stop.km} km`,
                    typeof stop.hours === "number" && `${stop.hours} h walking`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {route?.slug && (
        <Link
          to={`/routes/${route.slug}`}
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          The whole route →
        </Link>
      )}
      </details>
    </Panel>
  );
}

/**
 * What the price buys, and what it did not.
 *
 * "Is the porter in this?" is a question the office answers by opening the
 * offering in another tab and reading its price builder. The same figures are
 * already on the booking — these are the offering's own lines at this party
 * size, which is what the trekker read before they paid.
 *
 * Add-ons are listed apart and priced, but NOT added up: whether this party
 * took one is not something the breakdown records, so a total here would be
 * a guess presented as a fact.
 */
function WhatsIncluded({ booking }: { booking: any }) {
  const bd = booking.offering?.price_breakdown;
  if (!hasBreakdown(bd)) return null;

  const party = Math.max(1, Number(booking.party_size) || 1);
  // An add-on priced at nothing is an unfinished row in the builder, not
  // something to offer somebody.
  const extras = addOns(bd, party).filter((a) => a.perPersonUsdCents > 0);
  // The included lines are NOT listed here any more. They are the same money
  // as the cost breakdown directly above, in a different order — which is
  // what "the cost breakdown is shown twice" meant. Add-ons are the part the
  // breakdown genuinely cannot show, because the booking does not record
  // which of them this party took.
  if (extras.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-border">
      <>
          <p className="border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
            Add-ons offered
          </p>
          <ul className="divide-y divide-border/60">
            {extras.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0">{a.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-ink-soft">
                  +{formatUsd(a.perPersonUsdCents)}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-3 py-1.5 text-xs text-ink-soft">
            Offered at a party of {party}, not necessarily taken — the booking
            does not record which of these this party chose, so they are not
            added up here.
          </p>
      </>
    </div>
  );
}

const nprFromPaisa = (paisa: number) =>
  `NPR ${(paisa / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/**
 * What the trekker still owes, and by when.
 *
 * "Paid so far: $0 of $1,284.68" is a number, not a job. The office needs the
 * next thing somebody has to pay, how much, by when, and whether that date has
 * already gone. Counted from the payments rather than the booking's flags —
 * a group pays in shares against this same booking, and the flags are what
 * drift.
 */
function DueFromClient({
  booking,
  payments,
  instalments,
}: {
  booking: any;
  payments: any[];
  instalments: any[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const due = bookingDue({ ...booking, payments, instalments }, today);
  if (due.totalUsdCents === 0) return null;

  if (due.outstandingUsdCents === 0) {
    return (
      <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Paid in full — nothing owed.
      </p>
    );
  }

  const n = due.next;
  return (
    <div
      className={
        "mt-2 rounded-md border px-3 py-2 " +
        (n.overdue ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50")
      }
    >
      <p className="text-sm font-medium text-ink">
        Still to pay: <span className="font-mono">{formatUsd(due.outstandingUsdCents)}</span>
      </p>
      <p className="mt-0.5 text-sm text-ink">
        {n.label}: <span className="font-mono">{formatUsd(n.amountUsdCents)}</span>
        {n.dueOn && (
          <>
            {" — "}
            {n.overdue ? (
              <span className="font-medium text-red-900">
                was due {fmtDate(n.dueOn)}, {Math.abs(n.daysAway ?? 0)} day
                {Math.abs(n.daysAway ?? 0) === 1 ? "" : "s"} ago
              </span>
            ) : (
              <>
                due {fmtDate(n.dueOn)}
                {n.daysAway !== null && (
                  <span className="text-ink-soft">
                    {" "}
                    ({n.daysAway === 0 ? "today" : `in ${n.daysAway} days`})
                  </span>
                )}
              </>
            )}
          </>
        )}
      </p>
      {n.consequence && <p className="mt-0.5 text-xs text-ink-soft">{n.consequence}</p>}
    </div>
  );
}

/**
 * What the guide has been handed, and what is still theirs.
 *
 * Two payments, not one. A guide pays for the bus to the trailhead, the first
 * days' food and often a porter's own advance weeks before anybody books a
 * flight, so the office settles part of the fee up front — and that had
 * nowhere to live but a WhatsApp thread, which meant the ledger said the guide
 * was owed money they had already been given.
 *
 * The settlement is written when the trek completes, for the fee MINUS any
 * advance, so recording one here cannot end in paying for the same work twice.
 */
function GuidePayments({ booking, payouts }: { booking: any; payouts: any[] }) {
  const fee = booking.guide_payout_npr_paisa ?? 0;
  if (!fee) return null;

  const rows = payouts ?? [];
  const advance = rows.find((p: any) => p.kind === "advance");
  const paid = rows
    .filter((p: any) => p.status === "paid")
    .reduce((s: number, p: any) => s + (p.amount_npr_paisa ?? 0), 0);

  return (
    <div className="mt-3 rounded-md border border-border">
      <p className="border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
        Paid to the guide
      </p>
      <p className="px-3 py-1.5 text-sm">
        Their whole fee for this trip:{" "}
        <span className="font-mono text-ink">{nprFromPaisa(fee)}</span>
        <span className="text-ink-soft"> · fixed when it was booked</span>
      </p>

      {rows.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border">
          {rows.map((p: any) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0">
                {p.kind === "advance" ? "Advance, before the trek" : "Settlement, after the trek"}
                {p.note && <span className="block text-[11px] text-ink-soft">{p.note}</span>}
                {p.paid_at && (
                  <span className="block text-[11px] text-ink-soft">
                    {fmtDate(p.paid_at)}
                    {p.method ? ` · ${p.method}` : ""}
                    {p.batch_ref ? ` · ${p.batch_ref}` : ""}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono tabular-nums">{nprFromPaisa(p.amount_npr_paisa ?? 0)}</span>
                {p.status === "paid" ? (
                  <Badge tone="green">paid</Badge>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="mark_payout_paid" />
                    <input type="hidden" name="payout_id" value={p.id} />
                    <button className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50">
                      Mark paid
                    </button>
                  </Form>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-border px-3 py-1.5 text-sm">
        Still theirs:{" "}
        <span className="font-mono text-ink">{nprFromPaisa(Math.max(0, fee - paid))}</span>
      </p>

      {/* The settlement writes itself when the trek completes. Only the
          advance is a decision somebody makes, so only the advance has a
          form. */}
      {!advance && (
        <details className="border-t border-border px-3 py-1.5">
          <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
            Record an advance…
          </summary>
          <Form method="post" className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="guide_advance" />
            <label className="text-xs text-ink-soft">
              <span className="block">Rupees</span>
              <input
                name="amount_npr"
                type="number"
                min="1"
                step="1"
                required
                className="mt-0.5 w-28 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="min-w-0 flex-1 text-xs text-ink-soft">
              <span className="block">What for</span>
              <input
                name="note"
                placeholder="Bus to the trailhead, porter's advance…"
                className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              />
            </label>
            <button className="rounded border border-border px-2 py-1.5 text-xs hover:bg-mist">
              Record
            </button>
          </Form>
          <p className="mt-1 text-[11px] text-ink-soft">
            Deducted from the settlement written when the trek completes.
          </p>
        </details>
      )}
    </div>
  );
}

const STEP_TONE: Record<string, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-900",
  open: "border-amber-200 bg-amber-50 text-amber-900",
  overdue: "border-red-300 bg-red-50 text-red-900",
  blocked: "border-border bg-surface text-ink-soft",
};

/**
 * What is still in the way, and whose move it is.
 *
 * The page could tell you a dozen separate facts — a status, two documents, a
 * permit list, a TIMS row, a contract, a payment total — and never the one
 * thing somebody opening it at eight in the morning wants: what is left, and
 * who has to do it. Three columns because there are exactly three people who
 * can act, and a step belongs to one of them.
 *
 * "Blocked" is drawn grey and quiet on purpose. It is not a failure and not a
 * job — it is a step waiting on an earlier one, and the office chasing a
 * trekker for a passport on a trip nobody has paid a deposit for is the
 * specific waste this distinction exists to stop.
 */
function Readiness({
  booking,
  travellers,
  documents,
  permits,
  permitTypes,
  tims,
  contract,
  payments,
  instalments,
  arrangements,
  payouts,
}: {
  booking: any;
  travellers: any[];
  documents: any[];
  permits: any[];
  permitTypes: any[];
  tims: any;
  contract: any;
  payments: any[];
  instalments: any[];
  arrangements: any[];
  payouts: any[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const due = bookingDue({ ...booking, payments, instalments }, today);
  const r = tripReadiness({
    status: booking.status,
    kind: booking.offering?.kind,
    startDate: booking.start_date,
    partySize: booking.party_size,
    paidUp: due.outstandingUsdCents === 0,
    outstandingUsdCents: due.outstandingUsdCents,
    paymentDueOn: due.next.dueOn,
    documents: documents ?? [],
    travellers: travellers ?? [],
    insuranceVerifiedAt: booking.insurance_verified_at,
    insuranceAttestedAt: booking.insurance_attested_at,
    permits: permits ?? [],
    timsStatus: tims?.status ?? null,
    // Asked of this route's permit list rather than assumed: four of the six
    // routes have no TIMS row, and the step could never be anything but
    // "waiting" on them (0102).
    routeNeedsTims: (permitTypes ?? []).some(
      (t: any) => t.route_id === (booking.offering?.route?.id ?? null) && t.code === "tims",
    ),
    contractStatus: contract?.status ?? null,
    meetingPoint: booking.meeting_point ?? null,
    arrangements: arrangements ?? [],
    guideAdvancePaid: (payouts ?? []).some((p: any) => p.kind === "advance" && p.status === "paid"),
    todayIso: today,
  });
  if (r.total === 0) return null;

  const split = byOwner(r);
  const cancelled = String(booking.status ?? "").startsWith("cancelled");

  return (
    <Panel title="Ready to walk?">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-2 min-w-[12rem] flex-1 overflow-hidden rounded-full bg-border">
          <div
            className={
              "h-full rounded-full transition-all " +
              (r.overdue.length > 0 ? "bg-red-500" : r.percent === 100 ? "bg-emerald-500" : "bg-amber-400")
            }
            style={{ width: `${r.percent}%` }}
          />
        </div>
        <span className="font-mono text-sm text-ink">
          {r.doneCount}/{r.total}
        </span>
        {cancelled ? (
          <Badge tone="neutral">cancelled</Badge>
        ) : r.overdue.length > 0 ? (
          <Badge tone="red">
            {r.overdue.length} overdue
          </Badge>
        ) : r.percent === 100 ? (
          <Badge tone="green">everything done</Badge>
        ) : (
          <Badge tone="amber">{r.outstanding.length} to go</Badge>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {(["client", "guide", "office"] as const).map((owner) => (
          <div key={owner} className="rounded-md border border-border">
            <p className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
              {OWNER_LABEL[owner]}
              <span className="font-mono normal-case">
                {split[owner].length === 0 ? "clear" : split[owner].length}
              </span>
            </p>
            {split[owner].length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-ink-soft">Nothing waiting on them.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {split[owner].map((st: ReadinessStep) => (
                  <li key={st.key} className={"px-2.5 py-1.5 text-xs " + STEP_TONE[st.state]}>
                    <p className="font-medium">
                      {st.label}
                      {st.state === "blocked" && <span className="font-normal"> · waiting</span>}
                    </p>
                    <p className="opacity-90">{st.detail}</p>
                    {st.dueOn && (
                      <p className="font-mono opacity-90">
                        {(() => {
                          const n = daysUntil(st.dueOn, today);
                          if (n === null) return fmtDate(st.dueOn);
                          if (n < 0) return `${fmtDate(st.dueOn)} — ${Math.abs(n)}d late`;
                          return `${fmtDate(st.dueOn)} — in ${n}d`;
                        })()}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* The done ones, small, so the bar can be trusted without scrolling
          the page to find out what it counted. */}
      <p className="mt-2 text-[11px] text-ink-soft">
        Done:{" "}
        {r.steps.filter((x) => x.state === "done").map((x) => x.label).join(" · ") || "nothing yet"}
      </p>
    </Panel>
  );
}

/**
 * Gear, hotels and transport — everything the office books that is not the
 * guide (0096).
 *
 * A trek could read "confirmed" on this page while nobody had yet put a jeep
 * on the road to the trailhead, because the bus, the down jacket and the
 * teahouse in Kathmandu lived in a WhatsApp thread. One row each, with the
 * reference number you have to read out on the phone at six in the morning.
 */
function Arrangements({ rows }: { rows: any[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const list = sortArrangements(rows ?? [], today);
  const totals = arrangementTotals(rows ?? []);

  // No mt-4: the rail that holds this spaces its own children.
  return (
    <div>
      <Panel title="Gear, hotels & transport">
        {list.length === 0 ? (
          <p className="py-2 text-sm text-ink-soft">
            Nothing booked through us yet. Add the jeep, the hotel the night
            before, the gear hire — anything somebody would otherwise have to
            remember.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((a: any) => {
              const late = a.status !== "paid" && a.status !== "cancelled" && a.due_on && a.due_on < today;
              return (
                <li key={a.id} className={"py-2 " + (a.status === "cancelled" ? "opacity-50" : "")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {a.title}
                        <span className="ml-1.5 text-xs font-normal text-ink-soft">
                          {kindLabel(a.kind)}
                        </span>
                      </p>
                      <p className="text-xs text-ink-soft">
                        {[
                          a.vendor,
                          a.reference && `ref ${a.reference}`,
                          a.happens_on && `on ${fmtDate(a.happens_on)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "no details yet"}
                      </p>
                      {a.due_on && a.status !== "paid" && a.status !== "cancelled" && (
                        <p className={"text-xs " + (late ? "font-medium text-red-900" : "text-ink-soft")}>
                          {late ? "pay was due " : "pay by "}
                          {fmtDate(a.due_on)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.cost_minor > 0 && (
                        <span className="font-mono text-xs tabular-nums text-ink">
                          {formatMinor(a.cost_minor, a.currency ?? "NPR")}
                        </span>
                      )}
                      <Form method="post">
                        <input type="hidden" name="intent" value="arrangement_status" />
                        <input type="hidden" name="arrangement_id" value={a.id} />
                        <select
                          name="status"
                          defaultValue={a.status}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          className={
                            "rounded border px-1.5 py-1 text-xs " +
                            (late
                              ? "border-red-300 bg-red-50 text-red-900"
                              : a.status === "paid"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                : "border-border bg-card text-ink")
                          }
                        >
                          {ARRANGEMENT_STATUSES.map((x) => (
                            <option key={x.key} value={x.key}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                        <noscript>
                          <button className="ml-1 rounded border border-border px-1.5 py-1 text-xs">
                            Save
                          </button>
                        </noscript>
                      </Form>
                      <Form
                        method="post"
                        onSubmit={(e) => {
                          if (!confirm("Remove this?")) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="intent" value="arrangement_remove" />
                        <input type="hidden" name="arrangement_id" value={a.id} />
                        <button
                          className="rounded border border-border px-1.5 py-1 text-xs text-ink-soft hover:border-red-300 hover:text-red-900"
                          aria-label={`Remove ${a.title}`}
                        >
                          ×
                        </button>
                      </Form>
                    </div>
                  </div>
                  {a.note && <p className="mt-0.5 text-xs text-ink-soft">{a.note}</p>}
                </li>
              );
            })}
          </ul>
        )}

        {totals.byCurrency.length > 0 && (
          <div className="mt-2 border-t border-border pt-2 text-sm">
            {/* Per currency, never summed together: a Lukla seat sold in
                dollars added to rupees is wrong by a factor of 130. */}
            {totals.byCurrency.map((t) => (
              <p key={t.currency} className="text-ink-soft">
                {t.currency}:{" "}
                <span className="font-mono text-ink">{formatMinor(t.costMinor, t.currency)}</span>{" "}
                booked,{" "}
                <span className="font-mono text-ink">{formatMinor(t.owedMinor, t.currency)}</span>{" "}
                still to pay
              </p>
            ))}
          </div>
        )}

        <details className="mt-2 border-t border-border pt-2">
          <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
            Add something…
          </summary>
          <Form method="post" className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="intent" value="arrangement_add" />
            <label className="text-xs text-ink-soft sm:col-span-2">
              <span className="block">What</span>
              <input
                name="title"
                required
                placeholder="Jeep, Kathmandu → Soti Khola"
                className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Kind</span>
              <select
                name="kind"
                className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              >
                {ARRANGEMENT_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Who with</span>
              <input
                name="vendor"
                placeholder="Shona's, Buddha Air…"
                className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Reference</span>
              <input
                name="reference"
                className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Happens on</span>
              <input
                type="date"
                name="happens_on"
                className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Cost</span>
              <div className="mt-0.5 flex gap-1">
                <input
                  name="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full min-w-0 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
                />
                <select
                  name="currency"
                  className="rounded border border-border bg-card px-1 py-1 text-sm text-ink"
                >
                  <option value="NPR">NPR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </label>
            <label className="text-xs text-ink-soft">
              <span className="block">Pay the vendor by</span>
              <input
                type="date"
                name="due_on"
                className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
              />
            </label>
            <div className="sm:col-span-2">
              <button className="rounded border border-border px-3 py-1.5 text-xs hover:bg-mist">
                Add
              </button>
            </div>
          </Form>
        </details>
      </Panel>
    </div>
  );
}

/**
 * What the guide and the trekker have said to each other.
 *
 * Read-only, and that is the decision rather than an omission: the office
 * stepping into a thread as one of the two people in it is how a trekker ends
 * up believing their guide said something the guide has never seen. When the
 * office needs to say something it says it as itself, elsewhere. Here it only
 * needs to know whether the question got answered.
 */
function Conversation({ messages, booking }: { messages: any[]; booking: any }) {
  const rows = messages ?? [];
  const guideId = booking.guide_id ?? null;
  const whoFor = (senderId: string) =>
    senderId && guideId && senderId === guideId
      ? (booking.guide?.users?.full_name ?? "Guide")
      : (booking.trekker?.full_name ?? "Trekker");

  // No mt-4: the rail that holds this spaces its own children.
  return (
    <div>
      <Panel title="Guide ↔ trekker">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-ink-soft">
            They have not written to each other on this trip yet.
          </p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {/* Newest first: on a trek that starts in nine days, the last
                thing said is the thing you came to read. */}
            {rows.map((m: any) => (
              <li
                key={m.id}
                className={
                  "rounded-md border px-2.5 py-1.5 text-sm " +
                  (m.flagged_reason
                    ? "border-amber-200 bg-amber-50"
                    : "border-border bg-surface")
                }
              >
                <p className="flex items-baseline justify-between gap-2 text-xs text-ink-soft">
                  <span className="font-medium text-ink">{whoFor(m.sender_id)}</span>
                  <span className="font-mono">{fmtDate(m.created_at)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-ink">{m.body}</p>
                {m.flagged_reason && (
                  <p className="mt-1 text-xs text-amber-900">flagged: {m.flagged_reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-ink-soft">
          Read-only here. The office writing into their thread is how a trekker
          comes to believe their guide said something the guide never saw.
        </p>
      </Panel>
    </div>
  );
}

/**
 * Every payment that has ever touched this booking.
 *
 * "Paid so far: $420" is a total, and a total is what you have instead of a
 * receipt. When a trekker writes to ask why they were charged twice, or a
 * refund has to be traced, the office needs the rows: what each one was, when
 * it landed, and the Stripe reference to paste into the dashboard.
 *
 * Failed and refunded attempts stay on the list. A card that was declined on
 * Tuesday is the reason somebody rang on Wednesday, and hiding it leaves the
 * office reading a clean ledger while the trekker describes a mess.
 */
function PaymentLog({ payments }: { payments: any[] }) {
  const rows = payments ?? [];
  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded-md border border-border px-3 py-2 text-sm text-ink-soft">
        No payment has been attempted yet.
      </p>
    );
  }
  const tone = (status: string) =>
    status === "succeeded"
      ? "green"
      : status === "refunded"
        ? "neutral"
        : status === "failed"
          ? "red"
          : "amber";

  return (
    <div className="mt-3 rounded-md border border-border">
      <p className="border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
        Payment log
      </p>
      <ul className="divide-y divide-border/60">
        {rows.map((p: any) => (
          <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-1.5 text-sm">
            <span className="min-w-0">
              <span className="capitalize">{String(p.type ?? "payment").replace(/_/g, " ")}</span>
              <span className="block text-[11px] text-ink-soft">
                {fmtDate(p.created_at)}
                {/* The reference, so a question about this charge can be
                    answered in Stripe without hunting for it. */}
                {p.stripe_payment_intent && (
                  <span className="ml-1 font-mono">{p.stripe_payment_intent}</span>
                )}
                {p.stripe_refund_id && (
                  <span className="ml-1 font-mono">refund {p.stripe_refund_id}</span>
                )}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-mono tabular-nums">{formatUsd(p.amount_usd_cents ?? 0)}</span>
              <Badge tone={tone(String(p.status))}>{p.status}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The spec's checklist, worked from this page.
 *
 * Thirty rows on a trek and thirteen on a day experience, grouped by the
 * stage the spec puts them in and ordered by date inside it. The office ticks
 * them off here; nothing else writes them.
 *
 * Waiving needs a written reason, because a waived task with no reason is a
 * checklist that has quietly stopped being one — six months later nobody can
 * tell whether the porter was waived because the trekker carries their own
 * pack or because somebody was in a hurry.
 */
function Checklist({ tasks }: { tasks: any[] }) {
  const today = new Date().toISOString().slice(0, 10);
  if ((tasks ?? []).length === 0) return null;
  const s = taskSummary(tasks, today);

  return (
    <div className="mt-4">
      <Panel title={`Checklist · ${s.done} of ${s.total}`}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-2">
          <div className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-mist">
            <div
              className={`h-full rounded-full ${s.overdue.length > 0 ? "bg-amber-500" : "bg-primary"}`}
              style={{ width: `${s.percent}%` }}
            />
          </div>
          <span className="text-xs text-ink-soft">{s.percent}%</span>
          {s.overdue.length > 0 && (
            <Badge tone="red">
              {s.overdue.length} past its date
            </Badge>
          )}
        </div>

        {s.next && (
          <p className="border-t border-border px-4 py-2 text-sm">
            <span className="text-ink-soft">Next:</span>{" "}
            <span className="text-ink">{s.next.label}</span>
            <span className="text-ink-soft">
              {" · "}
              {OWNER_LABEL[s.next.owner as keyof typeof OWNER_LABEL] ?? s.next.owner}
              {s.next.due_on ? ` · ${dueLabel(s.next, today)}` : ""}
            </span>
          </p>
        )}

        {byStage(tasks).map((group) => (
          <div key={group.stage} className="border-t border-border">
            <p className="bg-mist/40 px-4 py-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
              {group.stage}
            </p>
            <ul className="divide-y divide-border">
              {group.tasks.map((t: any) => {
                const late = isOverdue(t, today);
                const settled = t.state === "done" || t.state === "waived";
                return (
                  <li key={t.id} className="px-4 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={`text-sm ${settled ? "text-ink-soft line-through" : "text-ink"}`}
                        >
                          {t.label}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {[
                            OWNER_LABEL[t.owner as keyof typeof OWNER_LABEL] ?? t.owner,
                            t.due_on ? dueLabel(t, today) : null,
                            t.done_when,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {t.state === "waived" && (
                          <p className="mt-0.5 text-xs text-ink-soft">
                            <span className="font-medium">Waived:</span> {t.waived_reason}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {late && <Badge tone="red">late</Badge>}
                        {settled ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="task_reopen" />
                            <input type="hidden" name="task_id" value={t.id} />
                            <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                              Undo
                            </button>
                          </Form>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="task_done" />
                            <input type="hidden" name="task_id" value={t.id} />
                            <button className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50">
                              Done
                            </button>
                          </Form>
                        )}
                      </div>
                    </div>

                    {!settled && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                          Does not apply…
                        </summary>
                        <Form method="post" className="mt-1.5 flex flex-wrap items-start gap-2">
                          <input type="hidden" name="intent" value="task_waive" />
                          <input type="hidden" name="task_id" value={t.id} />
                          <input
                            name="reason"
                            required
                            placeholder="Why not? Somebody will read this in six months."
                            className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                          />
                          <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                            Waive
                          </button>
                        </Form>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/**
 * The permits for this trip, worked from this page.
 *
 * They were listed here and acted on somewhere else: the office read
 * "awaiting docs" on the booking, went to the permit tracker, found this trip
 * among every other trip, and did the work there. Everything the tracker can
 * do to a permit it can now do here — move it along, write the reference
 * number on it, attach the issued permit itself.
 *
 * The list is also where a permit gets ADDED. A trek's permits are usually
 * created for it when the booking confirms, but a route crossing into a
 * second park, a restricted-area permit, a late TIMS — those are decided by a
 * person, and the person was being sent to another screen to say so.
 */
function Permits({
  rows,
  types,
  booking,
  tims,
  error,
}: {
  rows: any[];
  types: any[];
  booking: any;
  tims: any;
  error: string | null;
}) {
  const list = rows ?? [];
  const routeId = booking.offering?.route?.id ?? null;
  // TIMS is a permit like any other (0102). It used to have its own panel with
  // its own issue button, which could not see this list — so a card could be
  // issued for a route with no TIMS permit and the two halves of the screen
  // disagreed about the same trek.
  const routeTims = (types ?? []).find((t: any) => t.route_id === routeId && t.code === "tims");
  const already = new Set(list.map((r: any) => r.permit_id));
  // This route's own permits first, then everything else, and never one that
  // is already on the trip.
  const addable = (types ?? [])
    .filter((t: any) => !already.has(t.id))
    .sort((a: any, b: any) => {
      const mine = (t: any) => (routeId && t.route_id === routeId ? 0 : 1);
      return mine(a) - mine(b) || String(a.name).localeCompare(String(b.name));
    });

  return (
    <div className="mt-4">
      <Panel title="Permits">
        {list.length === 0 ? (
          <p className="py-2 text-sm text-ink-soft">
            No permit has been logged for this trip yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((p: any) => (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{p.permit?.name ?? "Permit"}</p>
                    <p className="text-xs text-ink-soft">
                      {[
                        p.permit?.issuing_body,
                        p.permit?.lead_time_days && `${p.permit.lead_time_days} days to issue`,
                        p.scan_uploaded_at && `attached ${fmtDate(p.scan_uploaded_at)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "no issuing body on file"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={PERMIT_TONE[p.status as PermitStatus] ?? "neutral"}>
                      {String(p.status ?? "").replace(/_/g, " ")}
                    </Badge>
                    {p.scan_path && (
                      <a
                        href={`/ops/doc/permit/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-mist"
                      >
                        View
                      </a>
                    )}
                  </div>
                </div>

                {/* Status and reference in one save: the number written on the
                    permit and the fact that it has been issued arrive from the
                    counter together, and two forms meant the office saved one
                    and forgot the other. */}
                <Form method="post" className="mt-1.5 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="intent" value="permit_status" />
                  <input type="hidden" name="permit_application_id" value={p.id} />
                  <select
                    name="status"
                    defaultValue={p.status}
                    className="rounded border border-border bg-card px-1.5 py-1 text-xs text-ink"
                  >
                    {PERMIT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <input
                    name="reference_no"
                    defaultValue={p.reference_no ?? ""}
                    placeholder="reference no."
                    className="w-32 rounded border border-border bg-card px-1.5 py-1 text-xs text-ink"
                  />
                  <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                    Save
                  </button>
                </Form>

                {/* The blue card itself, on the TIMS row rather than in a
                    panel of its own. */}
                {p.permit?.code === "tims" && (
                  <div className="mt-1.5 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs">
                    {tims ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-ink">{tims.card_no}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-ink-soft">
                            issued {fmtDate(tims.issued_at)}
                          </span>
                          <a
                            href={`/pdf/tims/${booking.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border border-sky-300 bg-white px-2 py-0.5 text-primary"
                          >
                            PDF
                          </a>
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-ink-soft">
                          {booking.insurance_verified_at
                            ? "Ready to issue the blue card."
                            : "Verify insurance first (2026 rule)."}
                        </span>
                        <Form method="post">
                          <input type="hidden" name="intent" value="issue_tims" />
                          <button
                            disabled={!booking.insurance_verified_at}
                            className="rounded bg-primary px-2 py-1 font-medium text-white disabled:opacity-40"
                          >
                            Issue blue card
                          </button>
                        </Form>
                      </div>
                    )}
                  </div>
                )}

                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                    {p.scan_path ? "Replace the attached permit…" : "Attach the issued permit…"}
                  </summary>
                  <Form
                    method="post"
                    encType="multipart/form-data"
                    className="mt-1 flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="intent" value="permit_scan" />
                    <input type="hidden" name="permit_application_id" value={p.id} />
                    <input
                      type="file"
                      name="scan"
                      required
                      accept="image/*,application/pdf"
                      className="max-w-[13rem] text-xs"
                    />
                    <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                      Attach
                    </button>
                  </Form>
                  <p className="mt-1 text-[11px] text-ink-soft">
                    The trekker can show this at a checkpost, rather than our
                    word that it is ready.
                  </p>
                </details>
              </li>
            ))}
          </ul>
        )}

        {addable.length > 0 && (
          <details className="mt-2 border-t border-border pt-2">
            <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
              Add a permit…
            </summary>
            <Form method="post" className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="permit_add" />
              <label className="min-w-0 flex-1 text-xs text-ink-soft">
                <span className="block">Which</span>
                <select
                  name="permit_id"
                  required
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-sm text-ink"
                >
                  {addable.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {routeId && t.route_id === routeId ? " — this route" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-soft">
                <span className="block">Where it is</span>
                <select
                  name="status"
                  defaultValue="awaiting_docs"
                  className="mt-0.5 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
                >
                  {PERMIT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-soft">
                <span className="block">Reference</span>
                <input
                  name="reference_no"
                  className="mt-0.5 w-28 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
                />
              </label>
              <button className="rounded border border-border px-3 py-1.5 text-xs hover:bg-mist">
                Add
              </button>
            </Form>
          </details>
        )}

        {/* The contradiction the office was reading on this page: a blue card
            issued against a route whose permit list has no TIMS on it. Six of
            those exist. Said here rather than left to be inferred. */}
        {!routeTims && (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-ink">
            {tims ? (
              <>
                <span className="font-medium">
                  A blue TIMS card was issued for this trek, but{" "}
                  {booking.offering?.route?.name ?? "this route"} has no TIMS card in
                  its permit list.
                </span>{" "}
                Either the route is missing it, or the card should not have gone
                out. Add TIMS to the route's permits if the route needs one.
              </>
            ) : (
              <>
                {booking.offering?.route?.name ?? "This route"} has no TIMS card in
                its permit list, so none can be issued. Add it to the route's
                permits if it needs one.
              </>
            )}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </Panel>
    </div>
  );
}

