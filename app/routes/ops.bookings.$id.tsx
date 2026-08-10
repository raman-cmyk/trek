import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.bookings.$id";
import { getEnv } from "~/lib/supabase.server";
import { requireOps } from "~/lib/supabase.server";
import { verifyDocument, signedDocumentUrl } from "~/lib/documents.server";
import { generateContractForBooking } from "~/lib/contracts.server";
import { issueTimsCard } from "~/lib/tims.server";
import { sendEmail, sendGuideSms } from "~/lib/notify.server";
import { Badge, Panel } from "~/components/ops/ui";
import { formatUsd } from "~/lib/pricing";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, party_size, total_usd_cents, insurance_provider, insurance_policy_no, insurance_meta, insurance_attested_at, insurance_verified_at, offering:offerings(title), trekker:users(full_name, email), guide:guides(users(full_name))",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });
  const [{ data: docs }, { data: permits }, { data: contract }, { data: tims }] = await Promise.all([
    admin.from("booking_documents").select("id, person_name, type, verified_at").eq("booking_id", b.id),
    admin.from("permit_applications").select("status, reference_no, permit:permits(name)").eq("booking_id", b.id),
    admin
      .from("contracts")
      .select("id, title, body_rendered, status, company_signed_at, guide_signed_at, company_signatory")
      .eq("booking_id", b.id)
      .maybeSingle(),
    admin.from("tims_cards").select("card_no, status, issued_at").eq("booking_id", b.id).maybeSingle(),
  ]);
  return data({ booking: b, documents: docs ?? [], permits: permits ?? [], contract, tims }, { headers });
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
        .select("trekker:users(email), guide:guides(users(phone))")
        .eq("id", params.id)
        .single();
      await sendEmail(env, (b as any)?.trekker?.email, "You're confirmed!", "Your trek is confirmed. Permits are being filed.");
      await sendGuideSms(env, (b as any)?.guide?.users?.phone, "A booking is confirmed — permits filing.");
    }
    return data({ ok: true }, { headers });
  }

  if (intent === "view") {
    const documentId = String(form.get("document_id"));
    const url = await signedDocumentUrl(admin, documentId, user.id);
    return data({ url }, { headers });
  }

  if (intent === "gen_contract") {
    await generateContractForBooking(admin, params.id!);
    return data({ ok: true }, { headers });
  }

  if (intent === "verify_insurance") {
    await admin
      .from("bookings")
      .update({ insurance_verified_at: new Date().toISOString() })
      .eq("id", params.id!);
    return data({ ok: true }, { headers });
  }

  if (intent === "issue_tims") {
    const res = await issueTimsCard(admin, params.id!, user.id);
    return data(res.ok ? { ok: true } : { error: res.reason }, { headers });
  }
  return data({ ok: false }, { headers });
}

export default function OpsBooking({ loaderData, actionData }: Route.ComponentProps) {
  const { booking: b, documents, permits, contract, tims } = loaderData as any;
  const meta = b.insurance_meta ?? {};
  const insuranceOk = meta.altitude && meta.helicopter;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <Link to="/ops/pipeline" className="hover:underline">Pipeline</Link>
        <span>/</span>
        <span className="text-ink">{b.offering?.title}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Booking">
          <dl className="space-y-1 text-sm">
            <Row label="Status"><Badge tone="blue">{b.status.replace(/_/g, " ")}</Badge></Row>
            <Row label="Trekker" value={b.trekker?.full_name} />
            <Row label="Guide" value={b.guide?.users?.full_name} />
            <Row label="Dates" value={`${b.start_date} → ${b.end_date}`} />
            <Row label="Party" value={`${b.party_size}`} />
            <Row label="Total" value={formatUsd(b.total_usd_cents)} />
          </dl>
        </Panel>

        <div className="lg:col-span-2">
          <Panel title="Documents">
            {documents.length === 0 ? (
              <p className="py-4 text-sm text-ink-soft">No documents uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium capitalize">{d.type}</p>
                      <p className="text-xs text-ink-soft">{d.person_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(actionData as any)?.url && (
                        <a href={(actionData as any).url} target="_blank" rel="noreferrer" className="text-xs text-primary">
                          open
                        </a>
                      )}
                      <Form method="post">
                        <input type="hidden" name="intent" value="view" />
                        <input type="hidden" name="document_id" value={d.id} />
                        <button className="rounded border border-border px-2 py-1 text-xs">View</button>
                      </Form>
                      {d.verified_at ? (
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
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Insurance (2026 gate) */}
          <div className="mt-4">
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
                  {!b.insurance_verified_at && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="verify_insurance" />
                      <button className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50">
                        Verify insurance
                      </button>
                    </Form>
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
