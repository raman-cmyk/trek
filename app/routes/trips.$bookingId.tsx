import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/trips.$bookingId";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { getStripe } from "~/lib/stripe.server";
import { cancelBooking } from "~/lib/booking.server";
import { uploadDocument } from "~/lib/documents.server";
import { submitReview, createRecap, addReviewPhoto } from "~/lib/reviews.server";
import { uploadPublicPhoto } from "~/lib/media.server";
import { SUBRATINGS } from "~/lib/reviews";
import { sendEmail } from "~/lib/notify.server";
import { briefUnlocked, guidePhoneUnlocked, daysUntilStart } from "~/lib/unlocks";
import { formatUsd } from "~/lib/pricing";
import { Button } from "~/components/Button";
import { Badge } from "~/components/ops/ui";
import { TimsCard } from "~/components/TimsCard";
import { cn } from "~/lib/cn";

const STEPS = [
  ["pending_deposit", "Deposit due"],
  ["deposit_paid", "Deposit paid"],
  ["docs_pending", "Documents"],
  ["confirmed", "Confirmed"],
  ["active", "On the trail"],
  ["completed", "Completed"],
] as const;

export function meta() {
  return [{ title: "Your trip" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, party_size, total_usd_cents, deposit_usd_cents, guide_id, insurance_attested_at, insurance_verified_at, offering:offerings(title, kind, meeting_point), guide:guides(slug, users(full_name, phone))",
    )
    .eq("id", params.bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: payments }, { data: docs }, { data: permits }, { data: myReview }, { data: recap }, { data: tims }, { data: instalments }] =
    await Promise.all([
      admin.from("payments").select("type, amount_usd_cents, status, created_at").eq("booking_id", b.id).order("created_at"),
      admin.from("booking_documents").select("id, person_name, type, verified_at").eq("booking_id", b.id).order("created_at"),
      admin.from("permit_applications").select("status, reference_no, permit:permits(name)").eq("booking_id", b.id),
      admin.from("reviews").select("id").eq("booking_id", b.id).eq("author_id", user.id).maybeSingle(),
      admin.from("recaps").select("slug").eq("booking_id", b.id).maybeSingle(),
      admin
        .from("tims_cards")
        .select("card_no, trekker_name, nationality, guide_name, guide_licence_no, route_name, region, entry_point, start_date, end_date, party_size, issued_at, status")
        .eq("booking_id", b.id)
        .maybeSingle(),
      admin.from("instalments").select("seq, amount_usd_cents, due_date, status").eq("booking_id", b.id).order("seq"),
    ]);

  const phoneUnlocked = guidePhoneUnlocked(b.start_date, today);
  return data(
    {
      booking: b,
      payments: payments ?? [],
      documents: docs ?? [],
      permits: permits ?? [],
      guidePhone: phoneUnlocked ? (b as any).guide?.users?.phone ?? null : null,
      briefUnlocked: briefUnlocked(b.start_date, today),
      daysUntil: daysUntilStart(b.start_date, today),
      hasReviewed: !!myReview,
      recapSlug: recap?.slug ?? null,
      tims: tims ?? null,
      instalments: instalments ?? [],
      today,
      insuranceAttested: !!b.insurance_attested_at,
      insuranceVerified: !!b.insurance_verified_at,
      isTrek: (b as any).offering?.kind === "trek",
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, end_date, guide_id, offering_id")
    .eq("id", params.bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!b) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "upload") {
    const file = form.get("file");
    const personName = String(form.get("person_name") ?? "").trim();
    const type = String(form.get("type")) as "passport" | "insurance";
    if (!(file instanceof File) || !file.size || !personName) {
      return data({ error: "Add a name and choose a file." }, { status: 400 });
    }
    const res = await uploadDocument(admin, {
      bookingId: b.id,
      personName,
      type,
      file,
    });
    if (!res.ok) return data({ error: res.error ?? "Upload failed." }, { status: 400 });
    // Move deposit_paid → docs_pending once the first doc is in.
    if (b.status === "deposit_paid") {
      await admin.from("bookings").update({ status: "docs_pending" }).eq("id", b.id);
    }
    return data({ ok: "Uploaded — our team will verify it." }, { headers });
  }

  if (intent === "complete") {
    const deleteAfter = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    await admin
      .from("bookings")
      .update({ status: "completed", completed_confirmed_at: new Date().toISOString() })
      .eq("id", b.id);
    // Schedule document deletion 90 days out (retention sweep).
    await admin.from("booking_documents").update({ delete_after: deleteAfter }).eq("booking_id", b.id);
    // Auto-generate the shareable recap.
    await createRecap(admin, b.id);
    await sendEmail(env, user.email, "How was your trek?", "Please leave your guide a review.");
    return data({ ok: "Trip marked complete. Please leave a review!" }, { headers });
  }

  if (intent === "review") {
    const overall = Number(form.get("overall") ?? 0);
    const body = String(form.get("body") ?? "").trim() || null;
    const subRatings: Record<string, number> = {};
    for (const k of SUBRATINGS.trekker_to_guide) {
      subRatings[k] = Number(form.get(`sub_${k}`) ?? overall) || overall;
    }
    const res = await submitReview(admin, {
      bookingId: b.id,
      authorId: user.id,
      subjectId: b.guide_id,
      direction: "trekker_to_guide",
      overall,
      subRatings,
      body,
    });
    if (!res.ok) return data({ error: res.error ?? "Couldn’t save review." }, { status: 400 });
    // Optional photo → offering photo moderation queue.
    const photo = form.get("photo");
    if (photo instanceof File && photo.size) {
      const url = await uploadPublicPhoto(admin, `reviews/${b.id}`, photo);
      if (url) {
        const person = String(form.get("credit_name") ?? "A trekker");
        await addReviewPhoto(admin, {
          offeringId: b.offering_id,
          url,
          creditName: person,
          alt: `Trekker photo from the trek`,
        });
      }
    }
    return data({ ok: "Thanks for your review!" }, { headers });
  }

  if (intent === "cancel") {
    const outcome = await cancelBooking(admin, getStripe(env), b.id, "trekker");
    return data({ cancelled: true, refund: outcome.refundToTrekkerUsdCents }, { headers });
  }
  return data({ ok: null }, { headers });
}

export default function TripDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { booking: b, payments, documents, permits, guidePhone, briefUnlocked: brief, daysUntil, hasReviewed, recapSlug, tims, instalments, today, insuranceAttested, insuranceVerified } =
    loaderData as any;
  const nav = useNavigation();
  const cancelled = b.status.startsWith("cancelled");
  const activeIdx = STEPS.findIndex((s) => s[0] === b.status);
  const isTrek = b.offering?.kind === "trek";
  const canComplete =
    b.status === "active" ||
    (["confirmed", "active"].includes(b.status) && daysUntil < 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/trips" className="text-sm text-primary">
        ← My trips
      </Link>
      <h1 className="mt-2 font-display text-2xl text-ink">{b.offering?.title}</h1>
      <p className="text-ink-soft">
        with {b.guide?.users?.full_name} · {b.start_date} → {b.end_date} ·{" "}
        {b.party_size}p
      </p>
      {!cancelled && (
        <Link
          to={`/messages/${b.id}`}
          className="mt-3 inline-block rounded-button border border-border px-3 py-1.5 text-sm text-primary"
        >
          Message your guide
        </Link>
      )}

      {actionData && "ok" in actionData && actionData.ok && (
        <p className="mt-3 rounded-card bg-emerald-50 p-3 text-sm text-emerald-800">
          {actionData.ok}
        </p>
      )}
      {actionData && "cancelled" in actionData && (
        <p className="mt-3 rounded-card bg-amber-50 p-3 text-sm text-amber-800">
          Cancelled. Refund of {formatUsd((actionData as any).refund)} is on its way.
        </p>
      )}

      {b.status === "pending_deposit" && !cancelled && (
        <Link
          to={`/checkout/${b.id}`}
          className="mt-5 block rounded-button bg-primary px-4 py-3 text-center font-medium text-white"
        >
          Pay {formatUsd(b.deposit_usd_cents)} deposit
        </Link>
      )}

      {b.status === "active" && (
        <section className="mt-5 rounded-card border border-danger/30 bg-danger/5 p-4">
          <p className="font-medium text-danger">SOS — while you're on the trail</p>
          <ul className="mt-1 text-sm text-ink-soft">
            <li>Trek ops line: +977 1 555 0100</li>
            <li>Insurer hotline: on your policy card</li>
            <li>Your guide: {guidePhone ?? "released 48h before start"}</li>
          </ul>
        </section>
      )}

      {/* Status timeline */}
      {!cancelled ? (
        <ol className="mt-6 space-y-3">
          {STEPS.map(([key, label], i) => {
            const done = activeIdx >= 0 && i <= activeIdx;
            return (
              <li key={key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    done ? "bg-accent text-white" : "bg-border text-ink-soft",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={cn("text-sm", i === activeIdx && "font-medium text-ink")}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-6 rounded-card bg-surface p-3 text-sm text-ink-soft">
          This booking was cancelled.
        </p>
      )}

      {/* Documents (treks) */}
      {isTrek && !cancelled && b.status !== "pending_deposit" && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-xl">Documents</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Upload a passport and insurance certificate for each trekker. Required
            before your trek is confirmed.
          </p>
          {documents.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {documents.map((d: any) => (
                <li key={d.id} className="flex items-center justify-between">
                  <a
                    href={`/trips/${b.id}/doc/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {d.type} — {d.person_name}
                  </a>
                  <Badge tone={d.verified_at ? "green" : "amber"}>
                    {d.verified_at ? "verified" : "pending"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Form method="post" encType="multipart/form-data" className="space-y-2 rounded-card border border-border bg-card p-3">
            <input type="hidden" name="intent" value="upload" />
            <input
              name="person_name"
              placeholder="Trekker name (as on passport)"
              required
              className="w-full rounded-button border border-border px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <select name="type" className="rounded-button border border-border px-2 py-2 text-sm">
                <option value="passport">Passport</option>
                <option value="insurance">Insurance</option>
              </select>
              <input type="file" name="file" accept="image/*,application/pdf" required className="flex-1 text-sm" />
            </div>
            {actionData && "error" in actionData && (actionData as any).error && (
              <p className="text-sm text-danger">{(actionData as any).error}</p>
            )}
            <Button type="submit" size="sm" loading={nav.state !== "idle"}>
              Upload
            </Button>
          </Form>
        </section>
      )}

      {/* Permits */}
      {permits.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-xl">Permits</h2>
          <ul className="space-y-1 text-sm">
            {permits.map((p: any, i: number) => (
              <li key={i} className="flex items-center justify-between">
                <span>{p.permit?.name}</span>
                <Badge tone={p.status === "ready" || p.status === "approved" ? "green" : "amber"}>
                  {p.status.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Insurance + blue TIMS card (2026 rule) */}
      {isTrek && !cancelled && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-xl">Insurance &amp; TIMS</h2>
          <div className="rounded-card border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink">Travel insurance</p>
                <p className="text-sm text-ink-soft">
                  {insuranceVerified
                    ? "Verified — high-altitude + helicopter evacuation ✓"
                    : insuranceAttested
                      ? "Checked — our team will verify your certificate."
                      : "Required before we can issue your permits & TIMS card."}
                </p>
              </div>
              <Link
                to={`/insurance?bookingId=${b.id}`}
                className="rounded-button border border-border px-3 py-1.5 text-sm text-primary"
              >
                {insuranceAttested ? "Re-check policy" : "Check my policy"}
              </Link>
            </div>
          </div>

          {tims ? (
            <div className="mt-4">
              <TimsCard tims={tims} />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-ink-soft">
                  Show this at checkpoints — guide licence is verified alongside it.
                </p>
                <a
                  href={`/pdf/tims/${b.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-button border border-border px-3 py-1.5 text-sm font-medium text-primary"
                >
                  Download PDF
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-card bg-surface p-3 text-sm text-ink-soft">
              Your blue TIMS card is issued by our team once your insurance is verified — it appears
              here automatically. The old green independent-trekker card no longer exists.
            </p>
          )}
        </section>
      )}

      {/* Pre-trek brief (T-7) */}
      {isTrek && !cancelled && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-xl">Pre-trek brief</h2>
          {brief ? (
            <div className="space-y-1 rounded-card border border-border bg-card p-4 text-sm text-ink">
              <p><strong>Meeting point:</strong> {b.offering?.meeting_point ?? "TBC"}</p>
              <p><strong>Packing:</strong> layers, broken-in boots, headlamp, sun protection, refillable bottle.</p>
              <p><strong>Altitude:</strong> hydrate, ascend slowly, tell your guide about any headache early.</p>
              {guidePhone && <p><strong>Your guide:</strong> {guidePhone}</p>}
            </div>
          ) : (
            <p className="rounded-card bg-surface p-3 text-sm text-ink-soft">
              Unlocks 7 days before you start ({daysUntil} days to go).
            </p>
          )}
        </section>
      )}

      {/* Payments */}
      {payments.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-xl">Payments</h2>
          <ul className="space-y-1 text-sm">
            {payments.map((p: any, i: number) => (
              <li key={i} className="flex justify-between">
                <span className="capitalize text-ink-soft">{p.type}</span>
                <span>{formatUsd(p.amount_usd_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Instalment plan — interest-free balance split (v3 §1d) */}
      {instalments.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-xl">Payment plan</h2>
          <p className="mb-2 text-sm text-ink-soft">
            Your balance is split into {instalments.length} interest-free payments, charged
            automatically to your card. All due before you depart.
          </p>
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {instalments.map((it: any) => {
              const paid = it.status === "paid";
              const overdue = !paid && it.due_date < today;
              return (
                <li key={it.seq} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink-soft">
                    Payment {it.seq}
                    <span className="ml-2 text-ink">{it.due_date}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{formatUsd(it.amount_usd_cents)}</span>
                    <Badge tone={paid ? "green" : overdue ? "amber" : "neutral"}>
                      {paid ? "paid" : overdue ? "due" : "scheduled"}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Recap */}
      {recapSlug && (
        <section className="mt-6">
          <Link
            to={`/recap/${recapSlug}`}
            className="block rounded-card border border-accent/40 bg-accent/5 p-4 text-center font-medium text-accent"
          >
            View & share your trek recap →
          </Link>
        </section>
      )}

      {/* Review (after completion) */}
      {b.status === "completed" && !hasReviewed && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-xl">Leave a review</h2>
          <Form
            method="post"
            encType="multipart/form-data"
            className="space-y-3 rounded-card border border-border bg-card p-4"
          >
            <input type="hidden" name="intent" value="review" />
            <label className="block text-sm">
              <span className="text-ink-soft">Overall</span>
              <select name="overall" defaultValue="5" className="mt-1 w-full rounded-button border border-border px-3 py-2">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} ★</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {["safety", "communication", "local_knowledge", "english", "pace", "value"].map((k) => (
                <label key={k} className="text-xs text-ink-soft">
                  {k.replace(/_/g, " ")}
                  <select name={`sub_${k}`} defaultValue="5" className="mt-1 w-full rounded border border-border px-2 py-1 text-sm">
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <textarea name="body" rows={3} placeholder="How was your trek?" className="w-full rounded-button border border-border px-3 py-2 text-sm" />
            <input name="credit_name" placeholder="Credit name for your photo (optional)" className="w-full rounded-button border border-border px-3 py-2 text-sm" />
            <input type="file" name="photo" accept="image/*" className="text-sm" />
            <p className="text-xs text-ink-soft">Your review is hidden until your guide reviews you too, or 14 days pass.</p>
            <Button type="submit" size="sm" loading={nav.state !== "idle"}>Submit review</Button>
          </Form>
        </section>
      )}

      {/* Actions */}
      <div className="mt-8 flex items-center gap-4">
        {canComplete && (
          <Form method="post">
            <input type="hidden" name="intent" value="complete" />
            <Button type="submit" size="sm">Confirm completion</Button>
          </Form>
        )}
        {!cancelled && ["pending_deposit", "deposit_paid", "docs_pending"].includes(b.status) && (
          <Form method="post">
            <input type="hidden" name="intent" value="cancel" />
            <button className="text-sm text-danger hover:underline" disabled={nav.state !== "idle"}>
              Cancel this booking
            </button>
          </Form>
        )}
      </div>
    </main>
  );
}
