import { data } from "react-router";
import type { Route } from "./+types/g._index";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { cn } from "~/lib/cn";

const CHECK_LABELS: Record<string, string> = {
  licence: "Trekking licence",
  id_match: "ID match",
  phone: "Phone",
  payout_account: "Payout account",
  reference_1: "Reference call",
  reference_2: "Reference call 2",
  police_cert: "Police clearance",
  first_aid: "First-aid cert",
  altitude_training: "Altitude training",
  insurance: "Insurance",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, profile, admin, headers } = await requireUser(request, env, "guide");
  const { data: guide } = await admin
    .from("guides")
    .select("status, tier, slug, guide_verifications(check_type, status)")
    .eq("user_id", user.id)
    .single();
  return data({ name: profile.full_name, guide }, { headers });
}

const STEPS = ["applied", "in_review", "verified"] as const;
const STEP_LABEL: Record<string, string> = {
  applied: "Applied",
  in_review: "In review",
  verified: "Verified",
};

export default function GuideStatus({ loaderData }: Route.ComponentProps) {
  const { name, guide } = loaderData as any;
  const status: string = guide?.status ?? "applied";
  const rejected = status === "removed" || status === "suspended";
  const activeIdx = STEPS.indexOf(status as any);
  const checks = guide?.guide_verifications ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Namaste, {name.split(" ")[0]}</h1>
        <p className="text-sm text-ink-soft">Here’s where your application stands.</p>
      </div>

      {rejected ? (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-4">
          <p className="font-medium text-danger">Application not approved</p>
          <p className="mt-1 text-sm text-ink-soft">
            Our team couldn’t verify your application this time. We’ll be in touch
            with next steps.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {STEPS.map((s, i) => {
            const done = activeIdx >= 0 && i <= activeIdx;
            const current = i === activeIdx;
            return (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm",
                    done ? "bg-accent text-white" : "bg-border text-ink-soft",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={cn("text-sm", current && "font-medium text-ink")}>
                  {STEP_LABEL[s]}
                  {s === "verified" && status === "verified" && (
                    <span className="ml-2 text-accent">— you’re live!</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {checks.length > 0 && (
        <div className="rounded-card border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium text-ink">Verification checklist</p>
          <ul className="space-y-1.5 text-sm">
            {checks.map((c: any) => (
              <li key={c.check_type} className="flex items-center justify-between">
                <span>{CHECK_LABELS[c.check_type] ?? c.check_type}</span>
                <span
                  className={cn(
                    "text-xs",
                    c.status === "passed"
                      ? "text-accent"
                      : c.status === "failed"
                        ? "text-danger"
                        : "text-ink-soft",
                  )}
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-soft">
        Questions? Our team in Kathmandu is on it.
      </p>
    </div>
  );
}
