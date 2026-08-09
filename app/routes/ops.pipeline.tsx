import { Form, data } from "react-router";
import type { Route } from "./+types/ops.pipeline";
import { Badge } from "~/components/ops/ui";
import { formatUsd } from "~/lib/pricing";
import { getEnv, requireOps } from "~/lib/supabase.server";

// Happy-path pipeline columns (docs/01 F1). Cancellations shown separately.
const COLUMNS = [
  "pending_deposit",
  "deposit_paid",
  "docs_pending",
  "confirmed",
  "active",
  "completed",
] as const;

const LABELS: Record<string, string> = {
  pending_deposit: "Pending deposit",
  deposit_paid: "Deposit paid",
  docs_pending: "Docs pending",
  confirmed: "Confirmed",
  active: "Active",
  completed: "Completed",
};

// The next status a booking advances to (walk it through every state).
const NEXT: Record<string, string | null> = {
  pending_deposit: "deposit_paid",
  deposit_paid: "docs_pending",
  docs_pending: "confirmed",
  confirmed: "active",
  active: "completed",
  completed: null,
};

// Timestamp columns to stamp as a booking advances.
const STAMP: Record<string, string | undefined> = {
  deposit_paid: "deposit_paid_at",
  confirmed: "balance_paid_at",
  completed: "completed_confirmed_at",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, party_size, total_usd_cents, trekker:users(full_name, country_code), guide:guides(users(full_name)), offering:offerings(title)",
    )
    .order("start_date");
  return data({ bookings: bookings ?? [] }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const id = String(form.get("bookingId"));
  const next = String(form.get("next"));
  const patch: Record<string, unknown> = { status: next };
  const stamp = STAMP[next];
  if (stamp) patch[stamp] = new Date().toISOString();
  await admin.from("bookings").update(patch).eq("id", id);
  return data({ ok: true }, { headers });
}

export default function OpsPipeline({ loaderData }: Route.ComponentProps) {
  const bookings = loaderData.bookings as any[];
  const byStatus = (s: string) => bookings.filter((b) => b.status === s);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Booking pipeline</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((col) => {
          const cards = byStatus(col);
          return (
            <div key={col} className="rounded-lg border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-medium">{LABELS[col]}</span>
                <span className="text-xs text-ink-soft">{cards.length}</span>
              </header>
              <div className="space-y-2 p-2">
                {cards.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-md border border-border/70 bg-surface p-2 text-xs"
                  >
                    <a
                      href={`/ops/bookings/${b.id}`}
                      className="font-medium text-ink hover:text-primary hover:underline"
                    >
                      {b.offering?.title ?? "—"}
                    </a>
                    <p className="mt-1 text-ink-soft">
                      {b.trekker?.full_name}
                      {b.trekker?.country_code
                        ? ` · ${b.trekker.country_code}`
                        : ""}
                    </p>
                    <p className="text-ink-soft">
                      guide {b.guide?.users?.full_name ?? "—"}
                    </p>
                    <p className="mt-1 text-ink-soft">
                      {b.start_date} · {b.party_size}p ·{" "}
                      {formatUsd(b.total_usd_cents)}
                    </p>
                    {NEXT[b.status] && (
                      <Form method="post" className="mt-2">
                        <input type="hidden" name="bookingId" value={b.id} />
                        <input
                          type="hidden"
                          name="next"
                          value={NEXT[b.status]!}
                        />
                        <button className="w-full rounded border border-border bg-card px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary">
                          → {LABELS[NEXT[b.status]!]}
                        </button>
                      </Form>
                    )}
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-ink-soft">
                    —
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CancelledStrip bookings={bookings} />
    </div>
  );
}

function CancelledStrip({ bookings }: { bookings: any[] }) {
  const cancelled = bookings.filter((b) => b.status.startsWith("cancelled"));
  if (cancelled.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {cancelled.map((b) => (
        <Badge key={b.id} tone="red">
          {b.offering?.title} — {b.status.replace("cancelled_", "")}
        </Badge>
      ))}
    </div>
  );
}
