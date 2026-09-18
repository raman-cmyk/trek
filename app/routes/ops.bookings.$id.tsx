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
} from "~/lib/documents.server";
import { cleanReason, docState, rejectionProblem } from "~/lib/doc-review";
import { fmtDate } from "~/lib/format";
import { missingDays, wasLate, trekDay } from "~/lib/checkin";
import { generateContractForBooking } from "~/lib/contracts.server";
import { issueTimsCard } from "~/lib/tims.server";
import { sendEmail, sendGuideSms } from "~/lib/notify.server";
import { Badge, Panel } from "~/components/ops/ui";
import { one, rows } from "~/lib/ops.server";
import { formatUsd } from "~/lib/pricing";
import { bookingBreakdown, payoutUsdCents } from "~/lib/booking-breakdown";
import { hasBreakdown, computeExperiencePricing, addOns } from "~/lib/experience-pricing";

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
        "id, status, start_date, end_date, party_size, total_usd_cents, guide_fee_usd_cents, porter_fee_usd_cents, permit_fees_usd_cents, permit_handling_usd_cents, logistics_usd_cents, service_fee_usd_cents, fund_usd_cents, commission_usd_cents, deposit_usd_cents, guide_payout_npr_paisa, fx_rate_npr, insurance_provider, insurance_policy_no, insurance_meta, insurance_attested_at, insurance_verified_at, insurance_rejected_at, insurance_rejected_reason, offering:offerings(title, kind, days, price_breakdown, route:routes(name, slug, region, difficulty, max_altitude_m, typical_days, season_months, day_stops)), trekker:users!bookings_trekker_id_fkey(full_name, email, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_email), guide:guides(users(full_name))",
      )
      .eq("id", params.id)
      .maybeSingle(),
    "this booking",
  );
  if (booking.error) throw new Response(booking.error, { status: 500 });
  const b = booking.row;
  if (!b) throw new Response("Not found", { status: 404 });
  const [docs, permits, contract, tims, instalments, payments, checkins] = await Promise.all([
    rows<any>(
      admin.from("booking_documents").select("id, person_name, type, verified_at, rejected_at, rejected_reason").eq("booking_id", b.id),
      "this trek's documents",
    ),
    rows<any>(
      admin
        .from("permit_applications")
        .select("id, status, reference_no, scan_path, permit:permits(name)")
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
        .select("type, amount_usd_cents, status, created_at")
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
  ]);
  // One line naming whichever panels could not be read. A blank Documents
  // panel on a trek whose passports are the thing you came to check is the
  // failure mode this whole file is guarding against.
  const loadError =
    [docs, permits, contract, tims, instalments, payments, checkins]
      .map((r) => r.error)
      .filter(Boolean)
      .join(" ") || null;
  return data(
    {
      booking: b,
      loadError,
      documents: docs.rows,
      permits: permits.rows,
      contract: contract.row,
      tims: tims.row,
      instalments: instalments.rows,
      payments: payments.rows,
      // One row per day of the trek so far, in order — a gap reads as a gap
      // only when it sits between the days either side of it.
      safety: [
        ...checkins.rows.map((c: any) => ({
          day: c.day as string,
          note: c.note as string | null,
          late: wasLate(c.day, c.received_at),
          receivedAt: c.received_at as string,
        })),
        ...missingDays(
          b.start_date,
          b.end_date,
          new Date().toISOString().slice(0, 10),
          checkins.rows.map((c: any) => c.day),
        ).map((day) => ({ day, note: null, late: false, receivedAt: null })),
      ].sort((x, y) => x.day.localeCompare(y.day)),
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
    const personName = String(form.get("person_name") ?? "").trim();
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "Choose a file first." }, { status: 400, headers });
    }
    if (type !== "passport" && type !== "insurance") {
      return data({ error: "A document is a passport or an insurance policy." }, { status: 400, headers });
    }
    if (!personName) {
      return data({ error: "Whose document is it?" }, { status: 400, headers });
    }
    const up = await uploadDocument(admin, {
      bookingId: params.id!,
      personName,
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
  const { booking: b, documents, permits, contract, tims, instalments, payments, safety, loadError } =
    loaderData as any;
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

      {/* The day-by-day, full width and above the panels, because when a
          trek is walking this is the thing the office opens the page for. */}
      <Itinerary booking={b} />

      <div className="grid gap-4 lg:grid-cols-3">
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

        <div className="lg:col-span-2">
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

            <PermitDocs permits={permits} />
            <AddDocument defaultPerson={b.trekker?.full_name ?? ""} />
          </Panel>

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

                <CostBreakdown booking={b} />
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

          {/* Blue TIMS card (issued in-flow) */}
          <div className="mt-4">
            <Panel title="Blue TIMS card">
              {tims ? (
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-mono font-medium text-ink">{tims.card_no}</p>
                    <p className="text-xs text-ink-soft">
                      Issued {new Date(tims.issued_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/pdf/tims/${b.id}`} target="_blank" rel="noreferrer" className="rounded border border-border px-2 py-1 text-xs text-primary">
                      PDF
                    </a>
                    <Badge tone="blue">{tims.status}</Badge>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-ink-soft">
                    {b.insurance_verified_at
                      ? "Ready to issue."
                      : "Verify insurance first (2026 rule)."}
                  </p>
                  <Form method="post">
                    <input type="hidden" name="intent" value="issue_tims" />
                    <button
                      disabled={!b.insurance_verified_at}
                      className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Issue blue card
                    </button>
                  </Form>
                </div>
              )}
              {(actionData as any)?.error && (
                <p className="mt-2 text-xs text-danger">{(actionData as any).error}</p>
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
                <ul className="space-y-1 text-sm">
                  {safety.map((c: any) => (
                    <li key={c.day} className="flex items-start justify-between gap-3">
                      <span className={c.receivedAt ? "min-w-0" : "min-w-0 text-ink-soft"}>
                        {fmtDate(c.day)}
                        {c.note ? <span className="text-ink-soft"> — {c.note}</span> : null}
                      </span>
                      {/* A day written up a week later is still a record, but
                          it is not the same record as one sent that evening,
                          and the office should not have to guess which. */}
                      {!c.receivedAt ? (
                        <Badge tone="red">nothing yet</Badge>
                      ) : c.late ? (
                        <Badge tone="amber">filled in {fmtDate(c.receivedAt)}</Badge>
                      ) : (
                        <Badge tone="green">on the day</Badge>
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

          {permits.length > 0 && (
            <div className="mt-4">
              <Panel title="Permits">
                <ul className="space-y-1 text-sm">
                  {permits.map((p: any, i: number) => (
                    <li key={i} className="flex items-center justify-between">
                      <span>{p.permit?.name}</span>
                      <Badge tone="amber">{p.status.replace(/_/g, " ")}</Badge>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          )}
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
 * The permits, beside the passports rather than four panels further down.
 *
 * They are documents on this trip in exactly the way a passport is, and the
 * office was scrolling past everything else to find out whether TIMS had been
 * issued. The scan opens through the same redirect route the passports use.
 */
function PermitDocs({ permits }: { permits: any[] }) {
  if (!permits || permits.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Permits</p>
      <ul className="mt-1.5 space-y-1.5">
        {permits.map((p: any, i: number) => (
          <li key={p.id ?? i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              {p.permit?.name ?? "Permit"}
              {p.reference_no && (
                <span className="ml-1.5 font-mono text-xs text-ink-soft">{p.reference_no}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <Badge
                tone={
                  p.status === "ready"
                    ? "green"
                    : p.status === "rejected"
                      ? "red"
                      : "amber"
                }
              >
                {String(p.status ?? "").replace(/_/g, " ")}
              </Badge>
              {p.scan_path && p.id && (
                <a
                  href={`/ops/doc/permit/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-mist"
                >
                  View
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Link to="/ops/permits" className="mt-2 inline-block text-xs text-primary hover:underline">
        File or attach permits →
      </Link>
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
function AddDocument({ defaultPerson }: { defaultPerson: string }) {
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
          <input
            name="person_name"
            defaultValue={defaultPerson}
            required
            className="mt-0.5 w-40 rounded border border-border bg-card px-2 py-1 text-sm text-ink"
          />
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
    </details>
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

  return (
    <Panel title={`The trek${route?.name ? ` — ${route.name}` : ""}`}>
      <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-ink-soft">
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
  const pricing = computeExperiencePricing(bd, party, booking.start_date);
  // An add-on priced at nothing is an unfinished row in the builder, not
  // something to offer somebody.
  const extras = addOns(bd, party).filter((a) => a.perPersonUsdCents > 0);
  if (pricing.lines.length === 0 && extras.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-border">
      <p className="border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
        What the trip includes
      </p>
      <ul className="divide-y divide-border/60">
        {pricing.lines.map((l) => (
          <li key={l.key} className="flex justify-between gap-2 px-3 py-1.5 text-sm">
            <span className="min-w-0">{l.label}</span>
            {/* A line the guide listed but priced at nothing is part of the
                trip that costs no extra — "$0.00" reads as a mistake. */}
            <span className="shrink-0 font-mono tabular-nums text-ink-soft">
              {l.amountUsdCents === 0 ? "included" : formatUsd(l.amountUsdCents)}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-3 py-1.5 text-xs text-ink-soft">
        Per person at a party of {party}.
      </p>

      {extras.length > 0 && (
        <>
          <p className="border-t border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
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
            Offered, not necessarily taken — the booking does not record which
            of these this party chose, so they are not added up here.
          </p>
        </>
      )}
    </div>
  );
}

