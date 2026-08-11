import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.verifications.$guideId";
import { Badge, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { formatUsd } from "~/lib/pricing";
import { getEnv, requireOps } from "~/lib/supabase.server";

const CHECK_LABELS: Record<string, string> = {
  licence: "Trekking licence",
  id_match: "Government ID matches licence",
  phone: "Phone verified",
  payout_account: "Payout account",
  reference_1: "Reference call 1",
  reference_2: "Reference call 2",
  police_cert: "Police clearance",
  first_aid: "Wilderness first-aid cert",
  altitude_training: "Altitude training",
  insurance: "Insurance",
};

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);

  const { data: guide } = await admin
    .from("guides")
    .select(
      "user_id, slug, status, tier, licence_no, licence_expiry, home_district, years_experience, day_rate_usd_cents, hook_line, users(full_name, email, phone), guide_verifications(id, check_type, status, notes, verified_at)",
    )
    .eq("user_id", params.guideId)
    .single();

  if (!guide) throw new Response("Guide not found", { status: 404 });
  return data({ guide }, { headers });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "check") {
    const id = String(form.get("verificationId"));
    const status = String(form.get("status")); // 'passed' | 'failed'
    const notes = String(form.get("notes") ?? "") || null;
    await admin
      .from("guide_verifications")
      .update({
        status,
        notes,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq("id", id);
  } else if (intent === "tier") {
    const tier = Number(form.get("tier"));
    await admin.from("guides").update({ tier }).eq("user_id", params.guideId);
  } else if (intent === "approve") {
    // Move to in_review first if still 'applied' isn't required; go straight to
    // verified. Ensure a minimum tier of 1 (T1 Verified).
    const { data: g } = await admin
      .from("guides")
      .select("tier")
      .eq("user_id", params.guideId)
      .single();
    const tier = (g?.tier ?? 0) < 1 ? 1 : g!.tier;
    await admin
      .from("guides")
      .update({ status: "verified", tier })
      .eq("user_id", params.guideId);
    const { notifyGuideVerification } = await import("~/lib/notifications.server");
    await notifyGuideVerification(env, admin, params.guideId!, true);
    return data({ ok: "Guide approved and now live." }, { headers });
  } else if (intent === "reject") {
    await admin
      .from("guides")
      .update({ status: "removed" })
      .eq("user_id", params.guideId);
    const { notifyGuideVerification } = await import("~/lib/notifications.server");
    await notifyGuideVerification(env, admin, params.guideId!, false);
    return data({ ok: "Guide rejected." }, { headers });
  } else if (intent === "start_review") {
    await admin
      .from("guides")
      .update({ status: "in_review" })
      .eq("user_id", params.guideId);
  }
  return data({ ok: "Saved." }, { headers });
}

export default function GuideDetail({ loaderData, actionData }: Route.ComponentProps) {
  const g: any = loaderData.guide;
  const nav = useNavigation();
  const checks = [...(g.guide_verifications ?? [])].sort((a: any, b: any) =>
    a.check_type.localeCompare(b.check_type),
  );
  const allPassed =
    checks.length > 0 && checks.every((c: any) => c.status === "passed");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <Link to="/ops/verifications" className="hover:underline">
          Verifications
        </Link>
        <span>/</span>
        <span className="text-ink">{g.users?.full_name}</span>
      </div>

      {actionData?.ok && (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {actionData.ok}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Verification checklist">
            <ul className="divide-y divide-border">
              {checks.map((c: any) => (
                <li key={c.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {CHECK_LABELS[c.check_type] ?? c.check_type}
                      </p>
                      {c.notes && (
                        <p className="text-xs text-ink-soft">{c.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          c.status === "passed"
                            ? "green"
                            : c.status === "failed"
                              ? "red"
                              : "neutral"
                        }
                      >
                        {c.status}
                      </Badge>
                      <Form method="post" className="flex gap-1">
                        <input type="hidden" name="intent" value="check" />
                        <input type="hidden" name="verificationId" value={c.id} />
                        <button
                          name="status"
                          value="passed"
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50"
                        >
                          Pass
                        </button>
                        <button
                          name="status"
                          value="failed"
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-red-50"
                        >
                          Fail
                        </button>
                      </Form>
                    </div>
                  </div>
                </li>
              ))}
              {checks.length === 0 && (
                <li className="py-3 text-sm text-ink-soft">
                  No checks recorded yet.
                </li>
              )}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Guide">
            <dl className="space-y-1 text-sm">
              <Row label="Name" value={g.users?.full_name} />
              <Row label="Status">
                <Badge tone={g.status === "verified" ? "green" : "amber"}>
                  {g.status}
                </Badge>
              </Row>
              <Row label="District" value={g.home_district} />
              <Row label="Licence" value={g.licence_no} />
              <Row label="Experience" value={`${g.years_experience ?? "—"} yrs`} />
              <Row
                label="Day rate"
                value={g.day_rate_usd_cents ? formatUsd(g.day_rate_usd_cents) : "—"}
              />
              <Row label="Phone" value={g.users?.phone} />
            </dl>
          </Panel>

          <Panel title="Tier">
            <Form method="post" className="flex items-center gap-2">
              <input type="hidden" name="intent" value="tier" />
              <select
                name="tier"
                defaultValue={g.tier}
                className="rounded border border-border px-2 py-1 text-sm"
              >
                <option value={0}>0 — none</option>
                <option value={1}>1 — Verified</option>
                <option value={2}>2 — Trusted</option>
                <option value={3}>3 — Elite</option>
              </select>
              <Button size="sm" variant="secondary" type="submit">
                Set tier
              </Button>
            </Form>
          </Panel>

          <Panel title="Decision">
            <div className="space-y-2">
              {!allPassed && g.status !== "verified" && (
                <p className="text-xs text-ink-soft">
                  Not all checks pass yet — approving overrides that.
                </p>
              )}
              <div className="flex gap-2">
                <Form method="post">
                  <input type="hidden" name="intent" value="approve" />
                  <Button
                    size="sm"
                    type="submit"
                    loading={nav.state !== "idle"}
                  >
                    Approve → verified
                  </Button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="reject" />
                  <Button size="sm" variant="danger" type="submit">
                    Reject
                  </Button>
                </Form>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right">{children ?? value ?? "—"}</dd>
    </div>
  );
}
