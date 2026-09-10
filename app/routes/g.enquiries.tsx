import { useState } from "react";
import { Form, Link, data } from "react-router";
import type { Route } from "./+types/g.enquiries";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { firstName } from "~/lib/names";
import { Button } from "~/components/Button";
import { hasBreakdown, type PriceBreakdown } from "~/lib/experience-pricing";
import { optionsOf } from "~/lib/packages";
import { EXPERIENCE_LABELS, type TrekExperience } from "~/lib/trekker-profile";
import { PackageComposer } from "~/components/messages/PackageComposer";
import { formatUsd } from "~/lib/pricing";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { data: enquiries } = await admin
    .from("enquiries")
    .select(
      "id, trekker_id, start_date, party_size, message, status, expires_at, selected_options, trekker:users(full_name, country_code, trek_experience), offering:offerings(id, title, kind, days, price_breakdown)",
    )
    .eq("guide_id", user.id)
    .in("status", ["open", "quoted"])
    .order("expires_at");

  // Proposals already sent, so a guide sees what they offered rather than
  // being invited to offer it again.
  const ids = (enquiries ?? []).map((e: any) => e.id);
  const { data: proposals } = ids.length
    ? await admin
        .from("package_proposals")
        .select("id, enquiry_id, days, party_size, start_date, total_usd_cents, status, created_at")
        .in("enquiry_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };

  return data({ enquiries: enquiries ?? [], proposals: proposals ?? [] }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const id = String(form.get("id"));
  const decision = String(form.get("decision"));

  // ── Propose a different package ────────────────────────────────────────
  if (decision === "propose") {
    const { data: enq } = await admin
      .from("enquiries")
      .select("id, trekker_id, guide_id, offering_id, start_date, party_size, status")
      .eq("id", id)
      .eq("guide_id", user.id)
      .in("status", ["open", "quoted"])
      .maybeSingle();
    if (!enq) {
      return data({ error: "That request has expired or was already handled." }, { status: 409, headers });
    }

    const { createProposal, clamp, extraLineFrom } = await import("~/lib/proposals.server");
    const res = await createProposal(admin, {
      guideId: user.id,
      trekkerId: enq.trekker_id,
      offeringId: enq.offering_id,
      enquiryId: enq.id,
      startDate: String(form.get("start_date") || enq.start_date),
      days: clamp(form.get("days"), 1, 60, 1),
      partySize: clamp(form.get("party_size"), 1, 24, enq.party_size),
      includedOptionIds: form.getAll("option").map(String),
      extraLines: extraLineFrom(form),
      note: String(form.get("note") ?? "").trim().slice(0, 800) || null,
    });
    if (res.error) return data({ error: res.error }, { status: 400, headers });

    await admin.from("enquiries").update({ status: "quoted" }).eq("id", enq.id);

    const { notifyPackageProposed } = await import("~/lib/notifications.server");
    await notifyPackageProposed(env, admin, { enquiryId: enq.id });
    return data({ ok: "Sent. They'll get an email with what you proposed." }, { headers });
  }

  // ── Accept exactly what was asked for ──────────────────────────────────
  if (decision === "accepted") {
    const { acceptEnquiry, DaysTakenError } = await import("~/lib/booking.server");
    let bookingId: string | null = null;
    try {
      bookingId = await acceptEnquiry(admin, id, user.id);
    } catch (e) {
      // The days went while the request sat waiting. Say which ones, so the
      // guide can propose different dates instead of guessing what happened.
      if (e instanceof DaysTakenError) {
        const days = e.days.slice(0, 3).join(", ");
        return data(
          {
            error: `You are already busy on ${days}${e.days.length > 3 ? " and more" : ""}. Propose different dates instead.`,
          },
          { status: 409, headers },
        );
      }
      throw e;
    }
    if (!bookingId) {
      // Also the answer when the same trek on the same dates is already
      // booked for this trekker — a duplicate ask from before those were
      // refused. Accepting it would book the fortnight twice.
      return data({ error: "This request has expired or was already handled." }, { status: 409, headers });
    }
    const { notifyEnquiryAccepted } = await import("~/lib/notifications.server");
    await notifyEnquiryAccepted(env, admin, bookingId);
    return data({ ok: "Accepted. They pay the deposit next." }, { headers });
  }

  await admin
    .from("enquiries")
    .update({ status: "declined" })
    .eq("id", id)
    .eq("guide_id", user.id)
    .in("status", ["open", "quoted"]);
  return data({ ok: "Declined." }, { headers });
}

export default function GuideEnquiries({ loaderData, actionData }: Route.ComponentProps) {
  const { enquiries, proposals } = loaderData as any;
  const msg = actionData as any;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-ink">Requests</h1>
      {msg?.error && (
        <p className="rounded-card bg-ember/10 p-3 text-sm text-ember">{msg.error}</p>
      )}
      {msg?.ok && (
        <p className="rounded-card bg-mist p-3 text-sm text-moss">{msg.ok}</p>
      )}
      {enquiries.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-6 text-center text-sm text-ink-soft">
          No new requests right now. Most guides get their first within 2 weeks —
          keep your calendar open and your profile fresh.
        </div>
      ) : (
        <ul className="space-y-3">
          {enquiries.map((e: any) => (
            <EnquiryCard
              key={e.id}
              enquiry={e}
              sent={proposals.filter((p: any) => p.enquiry_id === e.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One request, and the three answers to it.
 *
 * "Yes" and "no" were the only two, which is not how any of these
 * conversations actually go — the third is "yes, but fifteen days", and until
 * now it happened over WhatsApp and never reached the booking. It is one tap
 * to open and stays closed by default, so accepting as asked is still the
 * two-tap job it was.
 */
function EnquiryCard({ enquiry: e, sent }: { enquiry: any; sent: any[] }) {
  const [open, setOpen] = useState(false);
  const base = e.offering?.price_breakdown as PriceBreakdown | null;
  const options = optionsOf(base);
  const asked: string[] = Array.isArray(e.selected_options) ? e.selected_options : [];
  const canPropose = hasBreakdown(base);
  const live = sent.find((p) => p.status === "proposed");

  return (
    <li className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-ink">
          {firstName(e.trekker?.full_name)}
          {e.trekker?.country_code ? ` · ${e.trekker.country_code}` : ""}
        </p>
        <span className="text-xs text-ink-soft">{e.party_size}p</span>
      </div>
      {/* Who is asking. Accepting this costs the guide two weeks of their
          season, and until now they decided it on a first name. */}
      <p className="text-sm">
        <Link to={`/trekkers/${e.trekker_id}`} className="text-primary hover:underline">
          See who they are
        </Link>
        {e.trekker?.trek_experience && (
          <span className="text-ink-soft">
            {" "}· {EXPERIENCE_LABELS[e.trekker.trek_experience as TrekExperience].toLowerCase()}
          </span>
        )}
      </p>
      <p className="text-sm text-ink-soft">{e.offering?.title}</p>
      <p className="text-sm text-ink-soft">
        Start {e.start_date} · {e.offering?.days ?? 1} days
      </p>

      {/* What they ticked. It used to be collected and shown to nobody. */}
      {asked.length > 0 && (
        <p className="mt-2 text-sm text-ink">
          Wants:{" "}
          {asked
            .map((id) =>
              // "no_porter" is not one of the guide's lines — it is the porter
              // tick box on the trip page, turned off.
              id === "no_porter"
                ? "no porter"
                : (options.find((o) => o.id === id)?.label ?? null),
            )
            .filter(Boolean)
            .join(", ") || "—"}
        </p>
      )}

      {e.message && (
        <p className="mt-2 rounded-md bg-surface p-2 text-sm text-ink">“{e.message}”</p>
      )}

      {live && (
        <p className="mt-3 rounded-md bg-mist p-2 text-sm text-moss">
          You proposed {live.days} days for {live.party_size} —{" "}
          {formatUsd(live.total_usd_cents)}. Waiting for them to approve it.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Form method="post" className="flex-1">
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="decision" value="accepted" />
          <Button type="submit" className="w-full">
            Accept as asked
          </Button>
        </Form>
        <Form method="post" className="flex-1">
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="decision" value="declined" />
          <Button type="submit" variant="secondary" className="w-full">
            Decline
          </Button>
        </Form>
      </div>

      {canPropose && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 w-full rounded-button border border-moss px-4 py-2.5 text-sm font-medium text-moss"
          >
            {open ? "Close" : live ? "Propose something else" : "Suggest changes"}
          </button>
          {open && (
            <div className="mt-3 border-t border-border pt-3">
              <PackageComposer
                base={base!}
                options={options}
                defaults={{
                  days: e.offering?.days ?? base!.days ?? 1,
                  partySize: e.party_size,
                  startDate: e.start_date,
                  optionIds: asked,
                }}
                hidden={{ id: e.id, decision: "propose" }}
                onSent={() => setOpen(false)}
              />
            </div>
          )}
        </>
      )}
    </li>
  );
}
