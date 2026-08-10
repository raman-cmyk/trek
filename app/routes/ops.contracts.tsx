import { Form, data } from "react-router";
import type { Route } from "./+types/ops.contracts";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { generateContractForBooking } from "~/lib/contracts.server";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";

const PLACEHOLDERS = [
  "company_name", "guide_name", "offering_title", "start_date", "end_date",
  "party_size", "guide_fee", "commission", "guide_payout_npr", "signed_date",
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const [{ data: templates }, { count: generated }, { count: bookings }] = await Promise.all([
    admin.from("contract_templates").select("*").order("created_at", { ascending: false }),
    admin.from("contracts").select("id", { count: "exact", head: true }),
    admin.from("bookings").select("id", { count: "exact", head: true }),
  ]);
  return data(
    { templates: templates ?? [], generated: generated ?? 0, bookings: bookings ?? 0 },
    { headers },
  );
}

async function deactivateOthers(admin: any, exceptId?: string) {
  let q = admin.from("contract_templates").update({ active: false }).eq("active", true);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const active = form.get("active") === "on";

  if (intent === "create") {
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (!title || !body) return data({ error: "Title and body are required." }, { status: 400 });
    if (active) await deactivateOthers(admin);
    await admin.from("contract_templates").insert({ title, body, active });
    return data({ ok: "Template created." }, { headers });
  }

  if (intent === "update") {
    const id = String(form.get("id"));
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (active) await deactivateOthers(admin, id);
    await admin
      .from("contract_templates")
      .update({ title, body, active, version: Number(form.get("version") ?? 1) + 1 })
      .eq("id", id);
    return data({ ok: "Template saved." }, { headers });
  }

  if (intent === "delete") {
    await admin.from("contract_templates").delete().eq("id", String(form.get("id")));
    return data({ ok: "Template deleted." }, { headers });
  }

  if (intent === "backfill") {
    // Generate a signed contract for any existing booking that lacks one.
    const [{ data: allB }, { data: haveC }] = await Promise.all([
      admin.from("bookings").select("id"),
      admin.from("contracts").select("booking_id"),
    ]);
    const have = new Set((haveC ?? []).map((c: any) => c.booking_id));
    const missing = (allB ?? []).map((b: any) => b.id).filter((id: string) => !have.has(id));
    let made = 0;
    for (const id of missing) {
      const r = await generateContractForBooking(admin, id);
      if (r.created) made++;
    }
    return data({ ok: `Generated ${made} contract(s).` }, { headers });
  }

  return data({ ok: null }, { headers });
}

export default function OpsContracts({ loaderData, actionData }: Route.ComponentProps) {
  const { templates, generated, bookings } = loaderData as any;
  const msg = (actionData as any)?.ok;
  const err = (actionData as any)?.error;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Contracts</h1>
        <Form method="post">
          <input type="hidden" name="intent" value="backfill" />
          <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-mist">
            Generate for existing bookings ({bookings - generated} missing)
          </button>
        </Form>
      </div>

      {msg && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}

      <p className="text-sm text-ink-soft">
        {generated} contract(s) signed across {bookings} booking(s). A booking auto-generates a
        signed Company↔Guide agreement from the <strong>active</strong> template the moment the
        guide accepts it.
      </p>

      <Panel title="Placeholders you can use">
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDERS.map((p) => (
            <code key={p} className="rounded bg-mist px-2 py-0.5 text-xs text-pine">{`{{${p}}}`}</code>
          ))}
        </div>
      </Panel>

      {/* New template */}
      <Panel title="New template">
        <Form method="post" className="space-y-3">
          <input type="hidden" name="intent" value="create" />
          <input
            name="title"
            placeholder="Template title (e.g. Guide Engagement Agreement)"
            className="w-full rounded border border-border px-3 py-2 text-sm"
          />
          <textarea
            name="body"
            rows={8}
            placeholder="Contract body — use {{placeholders}} above…"
            className="w-full rounded border border-border px-3 py-2 font-mono text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" /> Make this the active template
          </label>
          <button className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white">
            Create template
          </button>
        </Form>
      </Panel>

      {/* Existing templates */}
      {templates.length === 0 ? (
        <EmptyRow>No templates yet — create one above.</EmptyRow>
      ) : (
        templates.map((t: any) => (
          <Panel
            key={t.id}
            title={t.title}
            actions={
              t.active ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Draft</Badge>
            }
          >
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="version" value={t.version} />
              <input
                name="title"
                defaultValue={t.title}
                className="w-full rounded border border-border px-3 py-2 text-sm"
              />
              <textarea
                name="body"
                rows={10}
                defaultValue={t.body}
                className="w-full rounded border border-border px-3 py-2 font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={t.active} /> Active
                </label>
                <div className="flex gap-2">
                  <button className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white">
                    Save
                  </button>
                </div>
              </div>
            </Form>
            <Form
              method="post"
              className="mt-2"
              onSubmit={(e) => {
                if (!confirm("Delete this template?")) e.preventDefault();
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={t.id} />
              <button className="text-xs text-danger hover:underline">Delete template</button>
            </Form>
            <p className="mt-1 text-xs text-ink-soft">Version {t.version}</p>
          </Panel>
        ))
      )}
    </div>
  );
}
