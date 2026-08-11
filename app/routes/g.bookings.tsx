import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/g.bookings";
import { fmtDate, fmtDateRange } from "~/lib/format";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { submitReview } from "~/lib/reviews.server";
import { Badge } from "~/components/ops/ui";
import { Button } from "~/components/Button";

const STATUS_TONE: Record<string, "amber" | "teal" | "green" | "neutral" | "blue"> = {
  deposit_paid: "amber",
  docs_pending: "amber",
  confirmed: "blue",
  active: "teal",
  completed: "green",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, start_date, end_date, party_size, status, trekker_id, offering:offerings(title), trekker:users(full_name, country_code, phone)",
    )
    .eq("guide_id", user.id)
    .not("status", "in", "(cancelled_trekker,cancelled_guide,cancelled_force_majeure)")
    .order("start_date", { ascending: false });
  const { data: myReviews } = await admin
    .from("reviews")
    .select("booking_id")
    .eq("author_id", user.id)
    .eq("direction", "guide_to_trekker");
  const reviewed = new Set((myReviews ?? []).map((r) => r.booking_id));
  return data(
    { bookings: (bookings ?? []).map((b: any) => ({ ...b, reviewed: reviewed.has(b.id) })) },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const bookingId = String(form.get("booking_id"));
  // Confirm this is the guide's completed booking.
  const { data: b } = await admin
    .from("bookings")
    .select("id, trekker_id, status")
    .eq("id", bookingId)
    .eq("guide_id", user.id)
    .maybeSingle();
  if (!b || b.status !== "completed") return data({ error: "Not reviewable." }, { status: 400 });

  const overall = Number(form.get("overall") ?? 5);
  const subRatings: Record<string, number> = {
    fitness_honesty: Number(form.get("sub_fitness_honesty") ?? overall) || overall,
    punctuality: Number(form.get("sub_punctuality") ?? overall) || overall,
    respect: Number(form.get("sub_respect") ?? overall) || overall,
  };
  await submitReview(admin, {
    bookingId,
    authorId: user.id,
    subjectId: b.trekker_id,
    direction: "guide_to_trekker",
    overall,
    subRatings,
    body: String(form.get("body") ?? "").trim() || null,
  });
  return data({ ok: true }, { headers });
}

export default function GuideBookings({ loaderData }: Route.ComponentProps) {
  const bookings = loaderData.bookings as any[];
  const upcoming = bookings.filter((b) => b.status !== "completed");
  const past = bookings.filter((b) => b.status === "completed");
  const nav = useNavigation();

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink">Your trips</h1>

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium text-ink-soft">Upcoming &amp; active</p>
          <ul className="space-y-2">
            {upcoming.map((b) => (
              <li key={b.id} className="rounded-card border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{b.offering?.title}</p>
                  <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-sm text-ink-soft">
                  {b.trekker?.full_name}{b.trekker?.country_code ? ` · ${b.trekker.country_code}` : ""} · {b.party_size}p
                </p>
                <p className="text-sm text-ink-soft">{fmtDateRange(b.start_date, b.end_date)}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {b.trekker?.phone && b.status !== "deposit_paid" && (
                    <a href={`tel:${b.trekker.phone}`} className="text-sm font-medium text-primary">
                      Call {b.trekker.full_name.split(" ")[0]}
                    </a>
                  )}
                  <a href={`/messages/${b.id}`} className="text-sm font-medium text-primary">
                    Message
                  </a>
                  {/* The guide signs the contract and is asked for the TIMS card
                      at checkpoints — both were ops/trekker-only links before. */}
                  <a href={`/pdf/contract/${b.id}`} target="_blank" rel="noreferrer" className="text-sm text-ink-soft hover:text-primary">
                    Agreement PDF
                  </a>
                  <a href={`/pdf/tims/${b.id}`} target="_blank" rel="noreferrer" className="text-sm text-ink-soft hover:text-primary">
                    TIMS card
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium text-ink-soft">Completed</p>
          <ul className="space-y-2">
            {past.map((b) => (
              <li key={b.id} className="rounded-card border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{b.offering?.title}</p>
                  <Badge tone="green">completed</Badge>
                </div>
                <p className="text-sm text-ink-soft">{b.trekker?.full_name} · {fmtDate(b.start_date)}</p>
                {b.reviewed ? (
                  <p className="mt-2 text-xs text-ink-soft">You reviewed this trekker ✓</p>
                ) : (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-primary">Review your trekker</summary>
                    <Form method="post" className="mt-2 space-y-2">
                      <input type="hidden" name="booking_id" value={b.id} />
                      <label className="block text-sm">
                        Overall
                        <select name="overall" defaultValue="5" className="ml-2 rounded border border-border px-2 py-1 text-sm">
                          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
                        </select>
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {["fitness_honesty", "punctuality", "respect"].map((k) => (
                          <label key={k} className="text-xs text-ink-soft">
                            {k.replace(/_/g, " ")}
                            <select name={`sub_${k}`} defaultValue="5" className="mt-1 w-full rounded border border-border px-1 py-1 text-sm">
                              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <textarea name="body" rows={2} placeholder="A note about this trekker" className="w-full rounded-button border border-border px-2 py-1 text-sm" />
                      <Button type="submit" size="sm" loading={nav.state !== "idle"}>
                        Leave the review
                      </Button>
                    </Form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
