import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.permits";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { signedPermitScanUrl, uploadPermitScan } from "~/lib/documents.server";
import { fmtDate } from "~/lib/format";
import {
  bySoonest,
  manualEntryProblem,
  PERMIT_STATUSES,
  PERMIT_TONE,
  stampsFor,
  type PermitStatus,
} from "~/lib/permits";
import { StatusTabs } from "~/components/ops/StatusTabs";
import { applyFilter, countsFor, resolveKey } from "~/lib/status-filter";
import { PERMIT_FILTERS } from "~/lib/ops-filters";

/**
 * Every permit for every upcoming trek.
 *
 * Sorted by which trek leaves first, which is the right order to work in and
 * the wrong one to answer a question in — "what is still waiting on documents"
 * meant reading all of it. The tabs are the questions this page is asked.
 *
 * Two things the tracker could not do: log a permit that the confirm trigger
 * never created (a fee paid at a municipal office, a permit filed before the
 * booking existed), and hold the permit itself. A trekker's page said "ready"
 * and they arrived at the checkpost with our word for it; now they arrive with
 * the thing.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const url = new URL(request.url);
  const filter = resolveKey(PERMIT_FILTERS, url.searchParams.get("status"));

  const [{ data: apps }, { data: bookings }, { data: permits }] = await Promise.all([
    admin
      .from("permit_applications")
      .select(
        "id, status, reference_no, scan_path, scan_uploaded_at, booking_id, permit:permits(name, issuing_body, lead_time_days), booking:bookings(start_date, trekker:users(full_name), offering:offerings(title))",
      ),
    // For logging one by hand: the trips a permit could belong to. Cancelled
    // ones are not among them.
    admin
      .from("bookings")
      .select("id, start_date, trekker:users(full_name), offering:offerings(title, route_id)")
      .not("status", "like", "cancelled%")
      .order("start_date")
      .limit(200),
    admin.from("permits").select("id, name, issuing_body, route:routes(name)").order("name"),
  ]);

  const all = bySoonest((apps ?? []) as any[]);
  return data(
    {
      rows: applyFilter(all, PERMIT_FILTERS, filter, (r: any) => r.status),
      counts: countsFor(all, PERMIT_FILTERS, (r: any) => r.status),
      filter,
      bookings: bookings ?? [],
      permits: permits ?? [],
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "advance");

  // ── Log one by hand ───────────────────────────────────────────────────
  if (intent === "log") {
    const bookingId = String(form.get("booking_id") ?? "");
    const permitId = String(form.get("permit_id") ?? "");
    const status = String(form.get("status") ?? "awaiting_docs");
    const problem = manualEntryProblem({ bookingId, permitId, status });
    if (problem) return data({ error: problem }, { status: 400, headers });

    const { data: app, error } = await admin
      .from("permit_applications")
      .insert({
        booking_id: bookingId,
        permit_id: permitId,
        status,
        reference_no: String(form.get("reference_no") ?? "").trim() || null,
        notes: String(form.get("notes") ?? "").trim() || null,
        created_by: user.id,
        ...stampsFor(status),
      })
      .select("id")
      .single();

    if (error) {
      // 0074's index: the confirm trigger already made this one, or somebody
      // logged it a moment ago.
      const already = String((error as any).code ?? "") === "23505";
      return data(
        {
          error: already
            ? "That permit is already on this booking — find it in the list below."
            : "Could not log that permit.",
        },
        { status: 400, headers },
      );
    }

    const scan = form.get("scan");
    if (scan instanceof File && scan.size > 0) {
      await uploadPermitScan(admin, {
        applicationId: app.id,
        bookingId,
        file: scan,
        uploadedBy: user.id,
      });
    }
    return data({ ok: "Permit logged." }, { headers });
  }

  // ── Attach the issued permit ──────────────────────────────────────────
  if (intent === "scan") {
    const id = String(form.get("id"));
    const bookingId = String(form.get("booking_id"));
    const scan = form.get("scan");
    if (!(scan instanceof File) || scan.size === 0) {
      return data({ error: "Choose a file first." }, { status: 400, headers });
    }
    const res = await uploadPermitScan(admin, {
      applicationId: id,
      bookingId,
      file: scan,
      uploadedBy: user.id,
    });
    return res.ok
      ? data({ ok: "Permit attached — the trekker can see it now." }, { headers })
      : data({ error: res.error ?? "Upload failed." }, { status: 400, headers });
  }

  // ── Open one ──────────────────────────────────────────────────────────
  if (intent === "view") {
    const url = await signedPermitScanUrl(admin, String(form.get("id")));
    return url
      ? data({ url }, { headers })
      : data({ error: "Nothing attached to that one." }, { status: 404, headers });
  }

  // ── Move a permit along ───────────────────────────────────────────────
  const id = String(form.get("id"));
  const status = String(form.get("status"));
  if (!PERMIT_STATUSES.includes(status as PermitStatus)) {
    return data({ error: "That is not a permit status." }, { status: 400, headers });
  }
  await admin
    .from("permit_applications")
    .update({
      status,
      reference_no: String(form.get("reference_no") ?? "") || null,
      ...stampsFor(status),
    })
    .eq("id", id);
  return data({ ok: true }, { headers });
}

export default function OpsPermits({ loaderData, actionData }: Route.ComponentProps) {
  const { rows, counts, filter, bookings, permits } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const act = (actionData ?? {}) as any;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Permit tracker</h1>
        {/* The questions this page gets asked, answered the same way as on
            every other console list. */}
        <StatusTabs filters={PERMIT_FILTERS} current={filter} counts={counts} />
      </div>

      {act.error && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {act.error}
        </p>
      )}
      {typeof act.ok === "string" && (
        <p className="rounded border border-accent/40 bg-accent/5 p-3 text-sm text-ink">{act.ok}</p>
      )}
      {act.url && (
        <p className="rounded border border-border bg-card p-3 text-sm">
          <a href={act.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            Open the permit →
          </a>{" "}
          <span className="text-xs text-ink-soft">Link expires in ten minutes.</span>
        </p>
      )}

      {/* ── Logging one by hand ─────────────────────────────────────────── */}
      <Panel title="Log a permit">
        <p className="mb-3 text-xs text-ink-soft">
          For a permit the system did not create for itself — a fee paid at a municipal
          office, or one filed before the booking came through. Attach the permit and the
          trekker sees it on their trip.
        </p>
        <Form method="post" encType="multipart/form-data" className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="intent" value="log" />
          <label className="block text-xs text-ink-soft">
            Booking
            <select name="booking_id" required className={field}>
              <option value="">Pick a trip…</option>
              {bookings.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.offering?.title ?? "Trip"} · {b.trekker?.full_name ?? "—"} ·{" "}
                  {fmtDate(b.start_date)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-soft">
            Permit
            <select name="permit_id" required className={field}>
              <option value="">Pick a permit…</option>
              {permits.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.route?.name ? `${p.route.name} — ` : ""}
                  {p.name}
                  {p.issuing_body ? ` (${p.issuing_body})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-soft">
            Status
            <select name="status" defaultValue="ready" className={field}>
              {PERMIT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-soft">
            Reference number
            <input name="reference_no" placeholder="SNP-2026-0148" className={field} />
          </label>
          <label className="block text-xs text-ink-soft sm:col-span-2">
            The permit itself <span className="opacity-70">— photo or PDF, optional</span>
            <input type="file" name="scan" accept="image/*,application/pdf" className={field} />
          </label>
          <label className="block text-xs text-ink-soft sm:col-span-2">
            Note <span className="opacity-70">— for the office, not the trekker</span>
            <input name="notes" className={field} />
          </label>
          <div className="sm:col-span-2">
            <button
              disabled={busy}
              className="rounded-button bg-pine px-3 py-1.5 text-sm font-medium text-paper hover:bg-moss disabled:opacity-50"
            >
              Log it
            </button>
          </div>
        </Form>
      </Panel>

      {/* ── The tracker ─────────────────────────────────────────────────── */}
      <Panel>
        {rows.length === 0 ? (
          <EmptyRow>
            {filter === "all"
              ? "No open permit applications."
              : "Nothing in this list right now."}
          </EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-soft">
                <tr className="border-b border-border">
                  <th className="pb-2 font-medium">Permit</th>
                  <th className="pb-2 font-medium">Trek / trekker</th>
                  <th className="pb-2 font-medium">Start</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Advance</th>
                  <th className="pb-2 font-medium">The permit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{r.permit?.name}</p>
                      <p className="text-xs text-ink-soft">
                        {r.permit?.issuing_body} · lead {r.permit?.lead_time_days}d
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <p>{r.booking?.offering?.title}</p>
                      <p className="text-xs text-ink-soft">{r.booking?.trekker?.full_name}</p>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-ink-soft">
                      {fmtDate(r.booking?.start_date)}
                    </td>
                    <td className="py-3 pr-3">
                      <Badge tone={PERMIT_TONE[r.status as PermitStatus] ?? "neutral"}>
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3">
                      <Form method="post" className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={r.id} />
                        <select
                          name="status"
                          defaultValue={r.status}
                          className="rounded border border-border bg-card px-1.5 py-1 text-xs"
                        >
                          {PERMIT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                        <input
                          name="reference_no"
                          defaultValue={r.reference_no ?? ""}
                          placeholder="ref no."
                          className="w-24 rounded border border-border bg-card px-1.5 py-1 text-xs"
                        />
                        <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                          Save
                        </button>
                      </Form>
                    </td>
                    <td className="py-3">
                      {r.scan_path ? (
                        <div className="space-y-1">
                          <Form method="post">
                            <input type="hidden" name="intent" value="view" />
                            <input type="hidden" name="id" value={r.id} />
                            <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                              View
                            </button>
                          </Form>
                          <p className="text-[11px] text-ink-soft">
                            attached {fmtDate(r.scan_uploaded_at)}
                          </p>
                        </div>
                      ) : (
                        <Form method="post" encType="multipart/form-data" className="space-y-1">
                          <input type="hidden" name="intent" value="scan" />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="booking_id" value={r.booking_id} />
                          <input
                            type="file"
                            name="scan"
                            accept="image/*,application/pdf"
                            className="w-40 text-[11px]"
                          />
                          <button className="rounded border border-border px-2 py-1 text-xs hover:bg-mist">
                            Attach
                          </button>
                        </Form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

const field =
  "mt-1 w-full rounded border border-border bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary";
