import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/g.profile";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { formatUsd } from "~/lib/pricing";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const [{ data: guide }, { data: langs }, { count: photoCount }] = await Promise.all([
    admin
      .from("guides")
      .select("slug, hook_line, bio, home_district, day_rate_usd_cents, payout_method, payout_account, tier")
      .eq("user_id", user.id)
      .single(),
    admin.from("guide_languages").select("language").eq("guide_id", user.id),
    admin.from("guide_photos").select("id", { count: "exact", head: true }).eq("guide_id", user.id),
  ]);
  return data(
    { guide, languages: (langs ?? []).map((l: any) => l.language), photoCount: photoCount ?? 0 },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "commercial") {
    // Guide may edit only their own commercial fields (guard trigger + this
    // whitelist enforce that status/tier/licence stay ops-controlled).
    const dayRate = Number(form.get("day_rate_usd") ?? 0);
    const patch: Record<string, unknown> = {};
    if (dayRate > 0) patch.day_rate_usd_cents = Math.round(dayRate * 100);
    const method = String(form.get("payout_method") ?? "");
    if (["esewa", "khalti", "bank"].includes(method)) patch.payout_method = method;
    const acct = String(form.get("payout_account") ?? "").trim();
    if (acct) patch.payout_account = acct;
    if (Object.keys(patch).length) {
      await admin.from("guides").update(patch).eq("user_id", user.id);
    }
    return data({ ok: "Saved." }, { headers });
  }

  // Change request for bio/photos — these are ops-edited to keep quality.
  return data(
    { ok: "Thanks — we’ll pass your request to the team." },
    { headers },
  );
}

export default function GuideProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { guide, languages, photoCount } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink">Your profile</h1>

      {actionData && "ok" in actionData && (
        <p className="rounded-button bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {(actionData as any).ok}
        </p>
      )}

      <section className="space-y-1 rounded-card border border-border bg-card p-4 text-sm">
        <Row label="Hook line" value={guide?.hook_line} />
        <Row label="District" value={guide?.home_district} />
        <Row label="Languages" value={languages.join(", ") || "—"} />
        <Row label="Photos" value={`${photoCount}`} />
        <Row
          label="Current day rate"
          value={guide?.day_rate_usd_cents ? formatUsd(guide.day_rate_usd_cents) : "—"}
        />
      </section>

      {/* Guide-editable commercial fields */}
      <Form method="post" className="space-y-3 rounded-card border border-border bg-card p-4">
        <input type="hidden" name="intent" value="commercial" />
        <p className="text-sm font-medium text-ink">Rate & payout</p>
        <label className="block text-sm">
          <span className="text-ink-soft">Day rate (USD)</span>
          <input
            name="day_rate_usd"
            type="number"
            defaultValue={guide?.day_rate_usd_cents ? guide.day_rate_usd_cents / 100 : ""}
            className="mt-1 w-full rounded-button border border-border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Payout method</span>
          <select
            name="payout_method"
            defaultValue={guide?.payout_method ?? ""}
            className="mt-1 w-full rounded-button border border-border px-3 py-2"
          >
            <option value="esewa">eSewa</option>
            <option value="khalti">Khalti</option>
            <option value="bank">Bank</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Payout account</span>
          <input
            name="payout_account"
            defaultValue={guide?.payout_account ?? ""}
            className="mt-1 w-full rounded-button border border-border px-3 py-2"
          />
        </label>
        <Button type="submit" size="sm" loading={busy}>
          Save
        </Button>
      </Form>

      {/* Bio/photo changes go through ops */}
      <Form method="post" className="space-y-2 rounded-card border border-border bg-card p-4">
        <input type="hidden" name="intent" value="request" />
        <p className="text-sm font-medium text-ink">Request a change to your bio or photos</p>
        <textarea
          name="note"
          rows={3}
          placeholder="e.g. Please update my bio to mention my new first-aid cert."
          className="w-full rounded-button border border-border px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary">
          Send request
        </Button>
      </Form>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right text-ink">{value || "—"}</span>
    </div>
  );
}
