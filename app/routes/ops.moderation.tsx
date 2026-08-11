import { Form, data } from "react-router";
import type { Route } from "./+types/ops.moderation";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { SmartImage } from "~/components/SmartImage";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const [{ data: flagged }, { data: photos }, { data: changeRequests }] = await Promise.all([
    admin
      .from("messages")
      .select("id, body, flagged_reason, created_at, sender:users(full_name)")
      .not("flagged_reason", "is", null)
      .order("created_at", { ascending: false }),
    admin
      .from("offering_photos")
      .select("id, url, alt_text, credit_name, offering:offerings(title)")
      .eq("approved", false)
      .eq("source", "trekker"),
    admin
      .from("guide_change_requests")
      .select("id, note, created_at, guide:guides(slug, users(full_name))")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ]);
  return data(
    { flagged: flagged ?? [], photos: photos ?? [], changeRequests: changeRequests ?? [] },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "dismiss_flag") {
    await admin.from("messages").update({ flagged_reason: null }).eq("id", String(form.get("id")));
  } else if (intent === "approve_photo") {
    await admin.from("offering_photos").update({ approved: true }).eq("id", String(form.get("id")));
  } else if (intent === "reject_photo") {
    await admin.from("offering_photos").delete().eq("id", String(form.get("id")));
  } else if (intent === "done_change_request") {
    await admin
      .from("guide_change_requests")
      .update({ status: "done", handled_at: new Date().toISOString() })
      .eq("id", String(form.get("id")));
  }
  return data({ ok: true }, { headers });
}

export default function OpsModeration({ loaderData }: Route.ComponentProps) {
  const { flagged, photos, changeRequests } = loaderData as any;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Moderation</h1>

      <Panel title={`Guide change requests (${changeRequests.length})`}>
        {changeRequests.length === 0 ? (
          <EmptyRow>No open requests.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {changeRequests.map((r: any) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.guide?.users?.full_name ?? "Guide"}{" "}
                    <a href={`/guides/${r.guide?.slug ?? ""}`} className="text-primary">
                      (profile)
                    </a>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-ink-soft">{r.note}</p>
                </div>
                <Form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="done_change_request" />
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-sm text-primary hover:underline">Mark done</button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Flagged messages (${flagged.length})`}>
        {flagged.length === 0 ? (
          <EmptyRow>No flagged messages.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {flagged.map((m: any) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.sender?.full_name}</span>
                    <Badge tone="red">{m.flagged_reason}</Badge>
                  </div>
                  <p className="text-sm text-ink-soft">"{m.body}"</p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="dismiss_flag" />
                  <input type="hidden" name="id" value={m.id} />
                  <button className="rounded border border-border px-2 py-1 text-xs">Dismiss</button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Photos awaiting approval (${photos.length})`}>
        {photos.length === 0 ? (
          <EmptyRow>No photos to moderate.</EmptyRow>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {photos.map((p: any) => (
              <div key={p.id} className="rounded-card border border-border p-2">
                <SmartImage src={p.url} alt={p.alt_text} width={300} height={225} className="aspect-[4/3] w-full rounded" />
                <p className="mt-1 text-xs text-ink-soft">{p.credit_name} · {p.offering?.title}</p>
                <div className="mt-2 flex gap-2">
                  <Form method="post" className="flex-1">
                    <input type="hidden" name="intent" value="approve_photo" />
                    <input type="hidden" name="id" value={p.id} />
                    <button className="w-full rounded bg-accent px-2 py-1 text-xs text-white">Approve</button>
                  </Form>
                  <Form method="post" className="flex-1">
                    <input type="hidden" name="intent" value="reject_photo" />
                    <input type="hidden" name="id" value={p.id} />
                    <button className="w-full rounded border border-border px-2 py-1 text-xs">Reject</button>
                  </Form>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
