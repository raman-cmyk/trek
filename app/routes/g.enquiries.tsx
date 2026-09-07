import { useState } from "react";
import { Form, data } from "react-router";
import type { Route } from "./+types/g.enquiries";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { firstName } from "~/lib/names";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";
import {
  partyAmounts,
  hasBreakdown,
  type PriceBreakdown,
  type PriceLine,
} from "~/lib/experience-pricing";
import { composePackage, optionsOf } from "~/lib/packages";
import { formatUsd } from "~/lib/pricing";
import { computeDeposit } from "~/lib/pricing";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { data: enquiries } = await admin
    .from("enquiries")
    .select(
      "id, start_date, party_size, message, status, expires_at, selected_options, trekker:users(full_name, country_code), offering:offerings(id, title, kind, days, price_breakdown)",
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
      .select(
        "id, trekker_id, guide_id, offering_id, start_date, party_size, status, offering:offerings(days, price_breakdown)",
      )
      .eq("id", id)
      .eq("guide_id", user.id)
      .in("status", ["open", "quoted"])
      .maybeSingle();
    if (!enq) {
      return data({ error: "That request has expired or was already handled." }, { status: 409, headers });
    }
    const base = (enq as any).offering?.price_breakdown as PriceBreakdown | null;
    if (!hasBreakdown(base)) {
      return data(
        { error: "This trip has no itemised price yet — price it in Experiences first." },
        { status: 400, headers },
      );
    }

    const days = Math.max(1, Math.min(60, Number(form.get("days")) || (enq as any).offering?.days || 1));
    const partySize = Math.max(1, Math.min(24, Number(form.get("party_size")) || enq.party_size));
    const startDate = String(form.get("start_date") || enq.start_date);
    const includedOptionIds = form.getAll("option").map(String);
    const note = String(form.get("note") ?? "").trim().slice(0, 800) || null;

    // One line the guide can write for this trip alone — a helicopter out, a
    // night in Kathmandu. Anything more belongs in the listing.
    const extraLabel = String(form.get("extra_label") ?? "").trim().slice(0, 60);
    const extraUsd = Math.max(0, Number(form.get("extra_usd")) || 0);
    const extraLines: PriceLine[] =
      extraLabel && extraUsd > 0
        ? [
            {
              id: `extra-${Date.now()}`,
              label: extraLabel,
              amountUsdCents: Math.round(extraUsd * 100),
              basis: "person",
              cadence: "trip",
              optional: false,
              bucket: "logistics",
            },
          ]
        : [];

    const composed = composePackage(base, { days, includedOptionIds, extraLines });
    const amounts = partyAmounts(composed, partySize, startDate);
    const daysUntil = Math.round(
      (Date.parse(startDate) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000,
    );
    const deposit = computeDeposit(amounts.totalUsdCents, daysUntil);

    const { error } = await admin.from("package_proposals").insert({
      enquiry_id: enq.id,
      guide_id: user.id,
      trekker_id: enq.trekker_id,
      start_date: startDate,
      days,
      party_size: partySize,
      price_breakdown: composed,
      total_usd_cents: amounts.totalUsdCents,
      deposit_usd_cents: deposit,
      note,
    });
    if (error) return data({ error: "That didn't send. Try again." }, { status: 400, headers });

    await admin.from("enquiries").update({ status: "quoted" }).eq("id", enq.id);

    const { notifyPackageProposed } = await import("~/lib/notifications.server");
    await notifyPackageProposed(env, admin, { enquiryId: enq.id });
    return data({ ok: "Sent. They'll get an email with what you proposed." }, { headers });
  }

  // ── Accept exactly what was asked for ──────────────────────────────────
  if (decision === "accepted") {
    const { acceptEnquiry } = await import("~/lib/booking.server");
    const bookingId = await acceptEnquiry(admin, id, user.id);
    if (!bookingId) {
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
      <p className="text-sm text-ink-soft">{e.offering?.title}</p>
      <p className="text-sm text-ink-soft">
        Start {e.start_date} · {e.offering?.days ?? 1} days
      </p>

      {/* What they ticked. It used to be collected and shown to nobody. */}
      {asked.length > 0 && (
        <p className="mt-2 text-sm text-ink">
          Wants:{" "}
          {asked
            .map((id) => options.find((o) => o.id === id)?.label ?? null)
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
          {open && <Proposer enquiry={e} base={base!} options={options} asked={asked} />}
        </>
      )}
    </li>
  );
}

/**
 * The changes a guide actually makes: a day either way, a different group, the
 * extras in or out, and one line of their own. Priced live, because a guide
 * proposing a change should never have to wonder what they just charged.
 */
function Proposer({
  enquiry: e,
  base,
  options,
  asked,
}: {
  enquiry: any;
  base: PriceBreakdown;
  options: PriceLine[];
  asked: string[];
}) {
  const [days, setDays] = useState<number>(e.offering?.days ?? base.days ?? 1);
  const [party, setParty] = useState<number>(e.party_size);
  const [startDate, setStartDate] = useState<string>(e.start_date);
  const [picked, setPicked] = useState<Set<string>>(new Set(asked));
  const [extraLabel, setExtraLabel] = useState("");
  const [extraUsd, setExtraUsd] = useState("");

  const extraLines: PriceLine[] =
    extraLabel.trim() && Number(extraUsd) > 0
      ? [
          {
            id: "preview",
            label: extraLabel.trim(),
            amountUsdCents: Math.round(Number(extraUsd) * 100),
            basis: "person",
            cadence: "trip",
            optional: false,
            bucket: "logistics",
          },
        ]
      : [];

  const composed = composePackage(base, {
    days,
    includedOptionIds: [...picked],
    extraLines,
  });
  const amounts = partyAmounts(composed, party, startDate);
  const each = Math.round(amounts.totalUsdCents / Math.max(1, party));

  const field =
    "mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss";

  return (
    <Form method="post" className="mt-3 space-y-3 border-t border-border pt-3">
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="decision" value="propose" />

      <div className="grid grid-cols-3 gap-2">
        <label className="block text-caption text-ink-soft">
          Days
          <input
            type="number"
            name="days"
            min={1}
            max={60}
            value={days}
            onChange={(ev) => setDays(Math.max(1, Number(ev.target.value) || 1))}
            className={field}
          />
        </label>
        <label className="block text-caption text-ink-soft">
          People
          <input
            type="number"
            name="party_size"
            min={1}
            max={24}
            value={party}
            onChange={(ev) => setParty(Math.max(1, Number(ev.target.value) || 1))}
            className={field}
          />
        </label>
        <label className="block text-caption text-ink-soft">
          Starts
          <input
            type="date"
            name="start_date"
            value={startDate}
            onChange={(ev) => setStartDate(ev.target.value)}
            className={field}
          />
        </label>
      </div>

      {options.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption text-ink-soft">What is included</p>
          {options.map((o) => (
            <label key={o.id} className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>{o.label}</span>
              <input
                type="checkbox"
                name="option"
                value={o.id}
                checked={picked.has(o.id)}
                onChange={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    n.has(o.id) ? n.delete(o.id) : n.add(o.id);
                    return n;
                  })
                }
              />
            </label>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="block text-caption text-ink-soft">
          Add one more thing
          <input
            name="extra_label"
            value={extraLabel}
            onChange={(ev) => setExtraLabel(ev.target.value)}
            placeholder="Helicopter out from Lukla"
            maxLength={60}
            className={field}
          />
        </label>
        <label className="block text-caption text-ink-soft">
          $ each
          <input
            name="extra_usd"
            type="number"
            min={0}
            step="1"
            value={extraUsd}
            onChange={(ev) => setExtraUsd(ev.target.value)}
            className={field}
          />
        </label>
      </div>

      <label className="block text-caption text-ink-soft">
        Say why, in your words
        <textarea
          name="note"
          rows={2}
          maxLength={800}
          placeholder="Two extra nights at Namche — you will walk it far better acclimatised."
          className={field}
        />
      </label>

      <div className={cn("rounded-md bg-mist p-3 text-sm")}>
        <div className="flex justify-between">
          <span className="text-ink-soft">They pay, each</span>
          <span className="font-mono font-medium text-ink">{formatUsd(each)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">Whole trip</span>
          <span className="font-mono text-ink">{formatUsd(amounts.totalUsdCents)}</span>
        </div>
      </div>

      <Button type="submit" className="w-full">
        Send this to them
      </Button>
      <p className="text-caption text-muted">
        Nothing is booked until they approve it and pay the deposit.
      </p>
    </Form>
  );
}
