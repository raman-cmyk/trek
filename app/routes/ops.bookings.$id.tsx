import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.bookings.$id";
import { getEnv } from "~/lib/supabase.server";
import { requireOps } from "~/lib/supabase.server";
import { verifyDocument, signedDocumentUrl } from "~/lib/documents.server";
import { sendEmail, sendGuideSms } from "~/lib/notify.server";
import { Badge, Panel } from "~/components/ops/ui";
import { formatUsd } from "~/lib/pricing";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, party_size, total_usd_cents, offering:offerings(title), trekker:users(full_name, email), guide:guides(users(full_name))",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });
  const [{ data: docs }, { data: permits }] = await Promise.all([
    admin.from("booking_documents").select("id, person_name, type, verified_at").eq("booking_id", b.id),
    admin.from("permit_applications").select("status, reference_no, permit:permits(name)").eq("booking_id", b.id),
  ]);
  return data({ booking: b, documents: docs ?? [], permits: permits ?? [] }, { headers });
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
  return data({ ok: false }, { headers });
}

export default function OpsBooking({ loaderData, actionData }: Route.ComponentProps) {
  const { booking: b, documents, permits } = loaderData as any;
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
