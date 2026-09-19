import { Form, data } from "react-router";
import type { Route } from "./+types/ops.payouts";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { formatNpr } from "~/lib/pricing";
import { rows, write } from "~/lib/ops.server";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { payoutLine, whatIsMissing } from "~/lib/payout";

/**
 * The screen that actually pays people.
 *
 * Somebody opens this, reads a row, and types a number into a banking app.
 * Until now the row said the guide's name, the trek, the amount, and the word
 * "esewa" — and nothing else. Not the account. Not the name the account is
 * held in. So whoever ran the batch opened each guide's ops profile in
 * another tab to find the number, for every line, every time.
 *
 * Twelve payouts are outstanding and none has ever been marked paid, which is
 * not a coincidence.
 *
 * Two facts now sit beside each amount, because both are reasons not to press
 * send:
 *
 *   - what is missing from the details, if anything (`payout.ts`);
 *   - whether anybody has ever checked them. Not one of the guides currently
 *     owed money has a passed `payout_account` check, so this is not a rare
 *     warning — it is the current state of the ledger, and it should be read
 *     before ₨896,000 goes out by hand.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const ledger = await rows<any>(
    admin
      .from("payouts")
      .select(
        "id, amount_npr_paisa, method, status, batch_ref, paid_at, " +
          "guide:guides(user_id, payout_method, payout_account, payout_account_name, " +
          "payout_bank_name, payout_branch, users(full_name)), " +
          "booking:bookings(offering:offerings(title), end_date)",
      )
      .order("status"),
    "the payout ledger",
  );

  // Who has had their account checked, and which QR we hold. Two small
  // lookups rather than a join, because `payouts` reaches `guides` and neither
  // of these hangs off `payouts` at all.
  const guideIds = [
    ...new Set(ledger.rows.map((p: any) => p.guide?.user_id).filter(Boolean)),
  ] as string[];

  const [checks, qrs] = guideIds.length
    ? await Promise.all([
        rows<any>(
          admin
            .from("guide_verifications")
            .select("guide_id, status")
            .eq("check_type", "payout_account")
            .in("guide_id", guideIds),
          "the payout account checks",
        ),
        rows<any>(
          admin
            .from("guide_documents")
            .select("id, guide_id, uploaded_at")
            .eq("kind", "payout_proof")
            .in("guide_id", guideIds)
            .order("uploaded_at", { ascending: false }),
          "the payout QRs",
        ),
      ])
    : [
        { rows: [] as any[], error: null },
        { rows: [] as any[], error: null },
      ];

  const checkByGuide: Record<string, string> = {};
  for (const c of checks.rows) checkByGuide[c.guide_id] = c.status;
  const qrByGuide: Record<string, string> = {};
  for (const q of qrs.rows) qrByGuide[q.guide_id] ??= q.id; // newest first

  return data(
    {
      payouts: ledger.rows,
      loadError: ledger.error ?? checks.error ?? qrs.error ?? null,
      checkByGuide,
      qrByGuide,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const ids = form.getAll("ids").map(String);
  const batchRef = String(form.get("batch_ref") ?? "") || null;
  if (ids.length === 0) {
    return data({ error: "Nothing was ticked, so nothing was marked paid." }, { headers });
  }
  // This write used to go unchecked — marking eight people paid and saying so
  // whether or not the update landed. docs/OPS-PAGES.md: never fire a write
  // you do not look at.
  const done = await write(
    admin
      .from("payouts")
      .update({
        status: "paid",
        batch_ref: batchRef,
        paid_at: new Date().toISOString(),
        paid_by: user.id,
      })
      .in("id", ids),
    "the payouts as paid",
  );
  if (!done.ok) return data({ error: done.error }, { status: 500, headers });
  return data({ ok: ids.length }, { headers });
}

export default function OpsPayouts({ loaderData, actionData }: Route.ComponentProps) {
  const { payouts, loadError, checkByGuide, qrByGuide } = loaderData as any;
  const said = actionData as { ok?: number; error?: string } | undefined;
  const payable = (payouts as any[]).filter((p) => p.status === "payable");
  const paid = (payouts as any[]).filter((p) => p.status === "paid");
  const payableTotal = payable.reduce((s, p) => s + p.amount_npr_paisa, 0);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Payout ledger</h1>

      {loadError && (
        <div className="rounded-md bg-ember/10 px-4 py-2 text-sm text-ember">{loadError}</div>
      )}
      {said?.error && (
        <div className="rounded-md bg-ember/10 px-4 py-2 text-sm text-ember">{said.error}</div>
      )}
      {said?.ok ? (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Marked {said.ok} payout(s) paid.
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
                  <th className="pb-2 font-medium">Where it goes</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payable.map((p) => {
                  const g = p.guide ?? {};
                  const details = {
                    method: g.payout_method,
                    account: g.payout_account,
                    accountName: g.payout_account_name,
                    bankName: g.payout_bank_name,
                    branch: g.payout_branch,
                  };
                  const missing = whatIsMissing(details);
                  const check = checkByGuide[g.user_id];
                  const qrId = qrByGuide[g.user_id];
                  return (
                    <tr key={p.id} className="border-b border-border/60 align-top">
                      <td className="py-2">
                        {/* Not ticked when we do not know where to send it.
                            Default-checking a row nobody can pay is how a
                            batch gets marked paid that never went out. */}
                        <input
                          type="checkbox"
                          name="ids"
                          value={p.id}
                          defaultChecked={!missing}
                        />
                      </td>
                      <td className="py-2 font-medium">{g.users?.full_name}</td>
                      <td className="py-2 text-ink-soft">{p.booking?.offering?.title}</td>
                      <td className="py-2">
                        <div className="text-ink">{payoutLine(details)}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          {missing ? (
                            <span className="text-xs text-ember">{missing}</span>
                          ) : check === "passed" ? (
                            <Badge tone="green">account checked</Badge>
                          ) : (
                            <Badge tone="amber">
                              {check ? `account ${check}` : "account never checked"}
                            </Badge>
                          )}
                          {qrId && (
                            /* Signed for ten minutes and written to the access
                               log by the route itself (CLAUDE.md rule 9). */
                            <a
                              href={`/ops/doc/guide/${qrId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline"
                            >
                              QR
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-right">{formatNpr(p.amount_npr_paisa)}</td>
                    </tr>
                  );
                })}
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
                  <td className="py-2 font-medium">{p.guide?.users?.full_name}</td>
                  <td className="py-2 text-ink-soft">{p.booking?.offering?.title}</td>
                  <td className="py-2">
                    <Badge tone="green">paid</Badge>
                  </td>
                  <td className="py-2 text-ink-soft">{p.batch_ref ?? "—"}</td>
                  <td className="py-2 text-right">{formatNpr(p.amount_npr_paisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
