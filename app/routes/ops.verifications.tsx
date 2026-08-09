import { Link, data } from "react-router";
import type { Route } from "./+types/ops.verifications";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { getEnv, requireOps } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);

  const { data: guides } = await admin
    .from("guides")
    .select(
      "user_id, slug, status, tier, home_district, day_rate_usd_cents, users(full_name), guide_verifications(status)",
    )
    .in("status", ["applied", "in_review"])
    .order("status");

  const rows = (guides ?? []).map((g: any) => {
    const checks = g.guide_verifications ?? [];
    return {
      userId: g.user_id,
      slug: g.slug,
      status: g.status as string,
      district: g.home_district as string | null,
      name: g.users?.full_name ?? g.slug,
      passed: checks.filter((c: any) => c.status === "passed").length,
      total: checks.length,
      failed: checks.filter((c: any) => c.status === "failed").length,
    };
  });

  return data({ rows }, { headers });
}

export default function OpsVerifications({ loaderData }: Route.ComponentProps) {
  const { rows } = loaderData;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Verification queue</h1>
      <Panel>
        {rows.length === 0 ? (
          <EmptyRow>No guides awaiting verification. All caught up.</EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-soft">
              <tr className="border-b border-border">
                <th className="pb-2 font-medium">Guide</th>
                <th className="pb-2 font-medium">District</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Checks</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-border/60">
                  <td className="py-3 font-medium">{r.name}</td>
                  <td className="py-3 text-ink-soft">{r.district ?? "—"}</td>
                  <td className="py-3">
                    <Badge tone={r.status === "in_review" ? "amber" : "neutral"}>
                      {r.status === "in_review" ? "In review" : "Applied"}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <span className="text-ink-soft">
                      {r.passed}/{r.total} passed
                    </span>
                    {r.failed > 0 && (
                      <span className="ml-2">
                        <Badge tone="red">{r.failed} failed</Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      to={`/ops/verifications/${r.userId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      Review →
                    </Link>
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
