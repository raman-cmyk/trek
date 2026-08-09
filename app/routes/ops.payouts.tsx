import { Form, data } from "react-router";
import type { Route } from "./+types/ops.payouts";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { formatNpr } from "~/lib/pricing";
import { getEnv, requireOps } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { data: payouts } = await admin
    .from("payouts")
    .select(
      "id, amount_npr_paisa, method, status, batch_ref, paid_at, guide:guides(users(full_name)), booking:bookings(offering:offerings(title), end_date)",
    )
    .order("status");
  return data({ payouts: payouts ?? [] }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const ids = form.getAll("ids").map(String);
  const batchRef = String(form.get("batch_ref") ?? "") || null;
  if (ids.length > 0) {
    await admin
      .from("payouts")
      .update({
        status: "paid",
        batch_ref: batchRef,
        paid_at: new Date().toISOString(),
        paid_by: user.id,
      })
      .in("id", ids);
  }
  return data({ ok: ids.length }, { headers });
}

export default function OpsPayouts({ loaderData, actionData }: Route.ComponentProps) {
  const payouts = loaderData.payouts as any[];
  const payable = payouts.filter((p) => p.status === "payable");
  const paid = payouts.filter((p) => p.status === "paid");
  const payableTotal = payable.reduce((s, p) => s + p.amount_npr_paisa, 0);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Payout ledger</h1>

      {actionData?.ok ? (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Marked {actionData.ok} payout(s) paid.
        </div>
      ) : null}

      <Panel
        title={`Payable — ${formatNpr(payableTotal)}`}
        actions={<span className="text-xs text-ink-soft">{payable.length} rows</span>}
      >
        {payable.length === 0 ? (
          <EmptyRow>Nothing payable right now.</EmptyRow>
        ) : (
          <Form method="post" className="space-y-3">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-soft">
                <tr className="border-b border-border">
                  <th className="pb-2"></th>
                  <th className="pb-2 font-medium">Guide</th>
                  <th className="pb-2 font-medium">Trek</th>
                  <th className="pb-2 font-medium">Method</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payable.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        name="ids"
                        value={p.id}
                        defaultChecked
                      />
                    </td>
                    <td className="py-2 font-medium">
                      {p.guide?.users?.full_name}
                    </td>
                    <td className="py-2 text-ink-soft">
                      {p.booking?.offering?.title}
                    </td>
                    <td className="py-2 text-ink-soft">{p.method}</td>
                    <td className="py-2 text-right">
                      {formatNpr(p.amount_npr_paisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-end gap-2">
              <input
                name="batch_ref"
                placeholder="Batch ref (e.g. eSewa-2026-08-09)"
                className="rounded border border-border px-2 py-1.5 text-sm"
              />
              <Button size="sm" type="submit">
                Mark batch paid
              </Button>
            </div>
          </Form>
        )}
      </Panel>

      <Panel title={`Paid — ${paid.length}`}>
        {paid.length === 0 ? (
          <EmptyRow>No payouts marked paid yet.</EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {paid.map((p) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="py-2 font-medium">
                    {p.guide?.users?.full_name}
                  </td>
                  <td className="py-2 text-ink-soft">{p.booking?.offering?.title}</td>
                  <td className="py-2">
                    <Badge tone="green">paid</Badge>
                  </td>
                  <td className="py-2 text-ink-soft">{p.batch_ref ?? "—"}</td>
                  <td className="py-2 text-right">
                    {formatNpr(p.amount_npr_paisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
