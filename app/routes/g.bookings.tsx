import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/g.bookings";
import { fmtDate, fmtDateRange } from "~/lib/format";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { submitReview } from "~/lib/reviews.server";
import { TREKKER_SUB_RATINGS } from "~/lib/trekker-profile";
import { firstName } from "~/lib/names";
import { TripPipeline } from "~/components/TripPipeline";
import { permitProgress } from "~/lib/pipeline";
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
      "id, start_date, end_date, party_size, status, trekker_id, offering:offerings(title, kind), trekker:users!bookings_trekker_id_fkey(full_name, country_code, phone)",
    )
    .eq("guide_id", user.id)
    // Cancelled trips stay in. Filtering them out meant a guide's trip simply
    // vanished from this list — and the only other signal was an SMS that
    // does not send, so nothing anywhere told them it was gone.
    .order("start_date", { ascending: false });
  const { data: myReviews } = await admin
    .from("reviews")
    .select("booking_id")
    .eq("author_id", user.id)
    .eq("direction", "guide_to_trekker");
  const reviewed = new Set((myReviews ?? []).map((r) => r.booking_id));

  // The trekker's trip page now says the guide collects the permits from the
  // office. It has to be true at the other end too: before this the guide was
  // told nothing about permits anywhere in the app.
  const ids = (bookings ?? []).map((b: any) => b.id);
  const { data: permitRows } = ids.length
    ? await admin.from("permit_applications").select("booking_id, status").in("booking_id", ids)
    : { data: [] as any[] };
  const permitsBy: Record<string, Array<{ status: string }>> = {};
  for (const r of permitRows ?? []) (permitsBy[r.booking_id] ??= []).push({ status: r.status });

  return data(
    {
      bookings: (bookings ?? []).map((b: any) => ({
        ...b,
        reviewed: reviewed.has(b.id),
        permits: permitProgress(permitsBy[b.id] ?? []),
      })),
    },
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
  const cancelled = bookings.filter((b) => String(b.status ?? "").startsWith("cancelled"));
  const live = bookings.filter((b) => !String(b.status ?? "").startsWith("cancelled"));
  const upcoming = live.filter((b) => b.status !== "completed");
  const past = live.filter((b) => b.status === "completed");
  const nav = useNavigation();

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink">Your trips</h1>

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium text-ink-soft">Upcoming &amp; active</p>
          <ul className="space-y-2">
            {upcoming.map((b) => (
              <li key={b.id} className="rounded-photo border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{b.offering?.title}</p>
                  <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-sm text-ink-soft">
                  {firstName(b.trekker?.full_name)}{b.trekker?.country_code ? ` · ${b.trekker.country_code}` : ""} · {b.party_size}p
                </p>
                <p className="text-sm text-ink-soft">{fmtDateRange(b.start_date, b.end_date)}</p>
                {/* The status badge says "docs pending"; this says what that
                    means and what is next, in the steps this kind of trip has. */}
                <TripPipeline
                  compact
                  className="mt-1.5"
                  kind={b.offering?.kind}
                  bookingStatus={b.status}
                  permits={b.permits}
                />
                {/* Two taps and a plain sentence: the one thing a guide has
                    to physically do before this trek, and where to do it. */}
                {b.permits === "issued" && b.status !== "active" && (
                  <p className="mt-1.5 rounded-button bg-moss/10 px-2.5 py-1.5 text-sm text-moss">
                    Permits are ready. Collect them from the Kathmandu office
                    before you go.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {b.trekker?.phone && b.status !== "deposit_paid" && (
                    <a href={`tel:${b.trekker.phone}`} className="text-sm font-medium text-primary">
                      Call {b.trekker.full_name.split(" ")[0]}
                    </a>
                  )}
                  <a href={`/messages/${b.id}`} className="text-sm font-medium text-primary">
                    Message
                  </a>
                  <a href={`/trekkers/${b.trekker_id}`} className="text-sm font-medium text-primary">
                    Their profile
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

      {/* Below the live work, above the archive: a trip that was taken off
          you is worth seeing, and is not worth seeing first. */}
      {cancelled.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium text-ink-soft">Cancelled</p>
          <ul className="space-y-2">
            {cancelled.map((b) => (
              <li key={b.id} className="rounded-photo border border-border bg-card p-4 opacity-80">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-ink">{b.offering?.title}</p>
                  <Badge tone="red">{b.status.replace("cancelled_", "").replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-sm text-ink-soft">
                  {firstName(b.trekker?.full_name)} · {fmtDate(b.start_date)} ·
                  {" "}your calendar is open again
                </p>
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
              <li key={b.id} className="rounded-photo border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{b.offering?.title}</p>
                  <Badge tone="green">completed</Badge>
                </div>
                <p className="text-sm text-ink-soft">
                  <a href={`/trekkers/${b.trekker_id}`} className="text-primary hover:underline">
                    {firstName(b.trekker?.full_name)}
                  </a>{" "}
                  · {fmtDate(b.start_date)}
                </p>
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
                        {TREKKER_SUB_RATINGS.map((sub) => (
                          <label key={sub.key} className="text-xs text-ink-soft">
                            {/* Labelled in words now: these appear on the
                                trekker's own profile, and "fitness honesty"
                                is a column name, not a question. */}
                            {sub.label}
                            <select name={`sub_${sub.key}`} defaultValue="5" className="mt-1 w-full rounded border border-border px-1 py-1 text-sm">
                              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <textarea name="body" rows={2} placeholder="A note the next guide would want — how they walked, how they were to be with." className="w-full rounded-button border border-border px-2 py-1 text-sm" />
                      <p className="text-xs text-ink-soft">
                        Sealed until they have reviewed you too, or two weeks
                        pass — the same rule that protects your own reviews.
                        Then it sits on their profile for the next guide.
                      </p>
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
