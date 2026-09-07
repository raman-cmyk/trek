import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/proposals.$id";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { pageMeta } from "~/lib/seo";
import { Button } from "~/components/Button";
import { useMoney } from "~/lib/currency-context";
import { firstName } from "~/lib/names";
import { describeChanges, optionsOf } from "~/lib/packages";
import { partyAmounts, type PriceBreakdown } from "~/lib/experience-pricing";
import { TrustPanel } from "~/components/public/TrustPanel";

export function meta() {
  return pageMeta({
    title: "A change to your trip",
    description: "What your guide suggested, and what it costs.",
    canonical: "",
    noindex: true,
  });
}

/**
 * The screen where a negotiation becomes a booking.
 *
 * A guide has adjusted the trip — a day either way, a different group, an
 * extra in or out — and this is where the trekker sees precisely what moved
 * and says yes. Approving creates the booking and goes straight to the
 * deposit, because a decision and its payment are one moment, not two.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const next = `/proposals/${params.id}`;
  if (!user) throw redirect(`/login?next=${encodeURIComponent(next)}`, { headers });

  const admin = createAdminClient(env);
  const { data: p } = await admin
    .from("package_proposals")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!p || (p.trekker_id !== user.id && p.guide_id !== user.id)) {
    throw new Response("Not found", { status: 404 });
  }

  const [{ data: enq }, { data: guide }] = await Promise.all([
    admin
      .from("enquiries")
      .select(
        "id, start_date, party_size, selected_options, offering:offerings(id, title, slug, kind, days, price_breakdown)",
      )
      .eq("id", p.enquiry_id)
      .maybeSingle(),
    admin
      .from("public_guides")
      .select("slug, full_name, avatar_url")
      .eq("user_id", p.guide_id)
      .maybeSingle(),
  ]);

  const base = ((enq as any)?.offering?.price_breakdown ?? null) as PriceBreakdown | null;
  const labels = new Map(optionsOf(base).map((l) => [l.id, l.label]));
  // What the package includes that the offering marked optional — the ticks,
  // resolved back into words.
  const proposed = (p.price_breakdown as PriceBreakdown)?.lines ?? [];
  const proposedOptionIds = proposed.filter((l) => labels.has(l.id)).map((l) => l.id);
  const askedOptionIds: string[] = Array.isArray((enq as any)?.selected_options)
    ? (enq as any).selected_options
    : [];

  const changes = enq
    ? describeChanges(
        {
          days: (enq as any).offering?.days ?? p.days,
          partySize: (enq as any).party_size,
          startDate: (enq as any).start_date,
          optionIds: askedOptionIds,
        },
        {
          days: p.days,
          partySize: p.party_size,
          startDate: p.start_date,
          optionIds: proposedOptionIds,
        },
        (id) => labels.get(id) ?? id,
      )
    : [];

  // Lines the guide wrote for this trip that were never in the listing.
  const baseIds = new Set((base?.lines ?? []).map((l) => l.id));
  const extras = proposed.filter((l) => !baseIds.has(l.id)).map((l) => l.label);

  // What it would have cost as asked, so the difference is a real number.
  const asIs = base
    ? partyAmounts(base, (enq as any)?.party_size ?? p.party_size, (enq as any)?.start_date ?? p.start_date)
        .totalUsdCents
    : null;

  return data(
    {
      p,
      offering: (enq as any)?.offering ?? null,
      guide: guide ?? null,
      changes,
      extras,
      asIs,
      isTrekker: p.trekker_id === user.id,
      lines: proposed.map((l) => ({ id: l.id, label: l.label })),
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) return redirect(`/login?next=/proposals/${params.id}`, { headers });

  const admin = createAdminClient(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "approve") {
    const { approveProposal } = await import("~/lib/booking.server");
    const bookingId = await approveProposal(admin, params.id, user.id);
    if (!bookingId) {
      return data(
        { error: "That plan is no longer available — your guide may have sent a new one." },
        { status: 409, headers },
      );
    }
    const { notifyProposalApproved } = await import("~/lib/notifications.server");
    await notifyProposalApproved(env, admin, { proposalId: params.id, bookingId });
    // Straight to the deposit: approving and paying are one decision.
    return redirect(`/checkout/${bookingId}`, { headers });
  }

  if (intent === "decline") {
    await admin
      .from("package_proposals")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("trekker_id", user.id)
      .eq("status", "proposed");
    return data({ ok: "Told them. You can keep talking in messages." }, { headers });
  }

  return data({ error: "Unknown action." }, { status: 400, headers });
}

export default function ProposalPage({ loaderData, actionData }: Route.ComponentProps) {
  const { p, offering, guide, changes, extras, asIs, isTrekker } = loaderData as any;
  const { m } = useMoney();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const each = Math.round(p.total_usd_cents / Math.max(1, p.party_size));
  const diff = asIs == null ? null : p.total_usd_cents - asIs;
  const answered = p.status !== "proposed";

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="label text-muted">A plan from your guide</p>
      <h1 className="mt-2 font-display text-3xl text-ink">
        {guide ? `${firstName(guide.full_name)} suggests a change` : "A change to your trip"}
      </h1>
      {offering && (
        <p className="mt-1 text-sm text-muted">
          {offering.title} · starting {p.start_date}
        </p>
      )}

      {(actionData as any)?.error && (
        <p className="mt-4 rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}
      {(actionData as any)?.ok && (
        <p className="mt-4 rounded bg-mist px-3 py-2 text-sm text-moss">
          {(actionData as any).ok}
        </p>
      )}

      {p.note && (
        <blockquote className="mt-5 border-l-2 border-chartreuse pl-3 font-display text-lg leading-snug text-ink">
          {p.note}
        </blockquote>
      )}

      {/* What moved. The whole point of the page. */}
      <section className="mt-6 rounded-md border border-line bg-card p-4">
        <h2 className="font-display text-xl text-ink">What is different</h2>
        {changes.length === 0 && extras.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Same trip, same dates — your guide has simply put the price in
            writing.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {changes.map((c: string) => (
              <li key={c} className="flex gap-2">
                <span aria-hidden="true" className="text-moss">
                  →
                </span>
                {c}
              </li>
            ))}
            {extras.map((x: string) => (
              <li key={x} className="flex gap-2">
                <span aria-hidden="true" className="text-moss">
                  +
                </span>
                {x}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The money, plainly. */}
      <section className="mt-4 rounded-md border border-line bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ink">Whole trip, {p.party_size} {p.party_size === 1 ? "person" : "people"}</span>
          <span className="font-mono text-lg font-medium text-ink">{m(p.total_usd_cents)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 text-sm text-muted">
          <span>Each person</span>
          <span className="font-mono">{m(each)}</span>
        </div>
        {diff != null && diff !== 0 && (
          <p className="mt-2 text-sm text-muted">
            {diff > 0 ? "That is " : "That is "}
            <span className="font-mono text-ink">{m(Math.abs(diff))}</span>
            {diff > 0 ? " more than" : " less than"} the trip as you asked for it.
          </p>
        )}
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="font-medium text-ink">To confirm now</span>
          <span className="font-mono text-lg font-medium text-ink">
            {m(p.deposit_usd_cents)}
          </span>
        </div>
        <p className="mt-1 text-caption text-muted">
          The rest is due 14 days before you leave.
        </p>
      </section>

      {answered ? (
        <p className="mt-6 rounded-md bg-mist p-3 text-sm text-ink">
          {p.status === "approved"
            ? "You approved this plan."
            : p.status === "declined"
              ? "You turned this down. Your guide can send another."
              : "This plan was replaced by a newer one."}
          {p.booking_id && (
            <>
              {" "}
              <Link to={`/trips/${p.booking_id}`} className="text-moss underline underline-offset-4">
                Open the trip →
              </Link>
            </>
          )}
        </p>
      ) : isTrekker ? (
        <>
          <Form method="post" className="mt-6">
            <input type="hidden" name="intent" value="approve" />
            <Button type="submit" loading={busy} className="w-full">
              Approve and pay {m(p.deposit_usd_cents)}
            </Button>
          </Form>
          <div className="mt-3 flex items-center justify-between gap-3">
            <Form method="post">
              <input type="hidden" name="intent" value="decline" />
              <button className="text-sm text-muted hover:text-ember">
                Not this — tell them no
              </button>
            </Form>
            {guide?.slug && (
              <Link to={`/guides/${guide.slug}`} className="text-sm text-moss hover:underline">
                Ask {firstName(guide.full_name)} a question →
              </Link>
            )}
          </div>

          <TrustPanel
            className="mt-6"
            title="What happens if you approve"
            items={[
              {
                label: `Your dates are held the moment the deposit is in.`,
                note: "Nobody else can book those days out from under you.",
              },
              {
                label: "The rest is due 14 days before you leave.",
                note: "You'll get a reminder — nothing is charged without one.",
              },
              { label: "Cancel free until 30 days before you leave." },
            ]}
          />
        </>
      ) : (
        <p className="mt-6 rounded-md bg-mist p-3 text-sm text-ink">
          Waiting for them to approve it.
        </p>
      )}
    </main>
  );
}
