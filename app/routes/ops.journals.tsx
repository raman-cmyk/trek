import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/ops.journals";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { uniqueSlug, validateDraft } from "~/lib/journals.server";
import { fmtDate } from "~/lib/format";

/**
 * Ops journal desk — the concierge model. We interview a guide by phone, type
 * the journal in on their behalf, and publish it. This is how the first
 * hundred journals get written; the guide-facing flow at /g/journals is the
 * same data with a smaller form.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireUser(request, env, "ops");

  const [{ data: journals }, { data: guides }] = await Promise.all([
    admin
      .from("journals")
      .select("id, slug, title, status, start_date, guide_id, published_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    admin
      .from("guides")
      .select("user_id, slug, journals_count, users:users(full_name)")
      .eq("status", "verified")
      .order("slug"),
  ]);

  const names = new Map(
    (guides ?? []).map((g: any) => [g.user_id, g.users?.full_name ?? g.slug]),
  );

  return data(
    {
      journals: (journals ?? []).map((j) => ({ ...j, guide_name: names.get(j.guide_id) ?? "—" })),
      guides: (guides ?? []).map((g: any) => ({
        user_id: g.user_id,
        name: g.users?.full_name ?? g.slug,
        count: g.journals_count,
      })),
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireUser(request, env, "ops");
  const form = await request.formData();

  const draft = {
    guide_id: String(form.get("guide_id") ?? ""),
    title: String(form.get("title") ?? "").trim(),
    start_date: String(form.get("start_date") ?? ""),
    end_date: String(form.get("end_date") ?? ""),
    pre_platform: true, // ops-created journals start as verified-by-us
  };
  if (!draft.guide_id) return data({ error: "Pick a guide." }, { status: 400, headers });
  const bad = validateDraft(draft);
  if (bad) return data({ error: bad }, { status: 400, headers });

  const slug = await uniqueSlug(admin, draft.title, draft.start_date);
  const { data: created, error } = await admin
    .from("journals")
    .insert({ ...draft, slug })
    .select("id")
    .single();
  if (error) return data({ error: error.message }, { status: 400, headers });

  return redirect(`/ops/journals/${created.id}`, { headers });
}

export default function OpsJournals({ loaderData, actionData }: Route.ComponentProps) {
  const { journals, guides } = loaderData as any;
  const nav = useNavigation();
  const cls = "w-full rounded border border-line px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink">Trek journals</h1>

      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      <Form method="post" className="grid gap-3 rounded-md border border-line bg-card p-4 sm:grid-cols-5">
        <label className="sm:col-span-2">
          <span className="text-sm text-ink-soft">Guide</span>
          <select name="guide_id" className={cls} required>
            <option value="">— pick —</option>
            {guides.map((g: any) => (
              <option key={g.user_id} value={g.user_id}>
                {g.name} ({g.count})
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-3">
          <span className="text-sm text-ink-soft">Title</span>
          <input name="title" className={cls} required placeholder="Manaslu in late October…" />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm text-ink-soft">Started</span>
          <input type="date" name="start_date" className={cls} required />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm text-ink-soft">Finished</span>
          <input type="date" name="end_date" className={cls} required />
        </label>
        <div className="flex items-end">
          <Button type="submit" size="sm" loading={nav.state !== "idle"}>
            Start journal
          </Button>
        </div>
      </Form>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Guide</th>
              <th className="px-3 py-2 font-medium">Trek dates</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {journals.map((j: any) => (
              <tr key={j.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <Link to={`/ops/journals/${j.id}`} className="text-primary hover:underline">
                    {j.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink-soft">{j.guide_name}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink-soft">
                  {fmtDate(j.start_date)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      j.status === "published"
                        ? "rounded-pill bg-mist px-2 py-0.5 text-xs text-moss"
                        : "rounded-pill bg-wheat/40 px-2 py-0.5 text-xs text-ink"
                    }
                  >
                    {j.status}
                  </span>
                </td>
              </tr>
            ))}
            {journals.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted">
                  No journals yet. Ring a guide and write the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
