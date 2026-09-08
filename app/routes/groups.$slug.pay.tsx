import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/groups.$slug.pay";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { getStripe } from "~/lib/stripe.server";
import { Button } from "~/components/Button";
import { useMoney } from "~/lib/currency-context";
import { firstName } from "~/lib/names";
import { activeMembers, type GroupMember, type TripGroup } from "~/lib/groups";
import { recomputeShares, systemLine } from "~/lib/groups.server";
import { depositIsCovered, depositShares, shareState } from "~/lib/group-pay";
import { TrustPanel } from "~/components/public/TrustPanel";

export function meta() {
  return [{ title: "Pay your share" }, { name: "robots", content: "noindex" }];
}

/**
 * One person paying their own share of a group's deposit.
 *
 * The other half of the group feature, and the half that was never built: the
 * database has carried a share per member since 0039, and every member was
 * told to "settle up with the organiser" because checkout only ever spoke to
 * the booking's own trekker. So the organiser fronted six people's money and
 * chased it by hand — the exact errand this is supposed to delete.
 *
 * The booking is not advanced by any one payment. It advances when the
 * payments add up to the deposit, whoever made them.
 */
async function load(request: Request, env: any, slug: string, userId: string) {
  const admin = createAdminClient(env);
  const { data: groupRow } = await admin
    .from("trip_groups")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!groupRow) throw new Response("Not found", { status: 404 });
  const group = groupRow as TripGroup;

  const { data: memberRows } = await admin
    .from("trip_group_members")
    .select("*")
    .eq("group_id", group.id)
    .order("created_at");
  const members = (memberRows ?? []) as GroupMember[];
  const me = members.find((m) => m.user_id === userId) ?? null;
  if (!me || (me.status !== "joined" && me.status !== "invited")) {
    throw new Response("Not found", { status: 404 });
  }

  const { data: booking } = group.booking_id
    ? await admin
        .from("bookings")
        .select("id, status, deposit_usd_cents, total_usd_cents, start_date, offering:offerings(title)")
        .eq("id", group.booking_id)
        .maybeSingle()
    : { data: null };

  return { admin, group, members, me, booking };
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) {
    throw redirect(`/login?next=/groups/${params.slug}/pay`, { headers });
  }
  const { admin, group, members, me, booking } = await load(request, env, params.slug!, user.id);
  if (!booking) {
    // Nothing to pay into yet — the guide has not taken the trip.
    throw redirect(`/groups/${params.slug}`, { headers });
  }

  const shares = depositShares(
    booking.deposit_usd_cents,
    members,
    group.payment_mode,
    group.organiser_id,
  );
  const mine = shareState(me, shares.get(me.id) ?? 0);

  // Reuse a pending intent across reloads rather than minting one per visit,
  // the same rule the single-payer checkout follows.
  const stripe = getStripe(env);
  const { data: pending } = await admin
    .from("payments")
    .select("stripe_payment_intent, amount_usd_cents")
    .eq("booking_id", booking.id)
    .eq("group_member_id", me.id)
    .eq("status", "pending")
    .maybeSingle();

  let intent: { paymentIntentId: string; mock: boolean };
  if (pending?.stripe_payment_intent && pending.amount_usd_cents === mine.outstandingUsdCents) {
    intent = { paymentIntentId: pending.stripe_payment_intent, mock: !!stripe.isMock };
  } else {
    const created = await stripe.createDepositIntent({
      amountUsdCents: mine.outstandingUsdCents,
      bookingId: booking.id,
      saveCard: false,
    });
    intent = { paymentIntentId: created.paymentIntentId, mock: created.mock };
    if (mine.outstandingUsdCents > 0) {
      await admin.from("payments").insert({
        booking_id: booking.id,
        group_member_id: me.id,
        stripe_payment_intent: created.paymentIntentId,
        type: "share",
        amount_usd_cents: mine.outstandingUsdCents,
        status: "pending",
      });
    }
  }

  return data(
    {
      group,
      booking,
      mine,
      seats: activeMembers(members).length,
      paymentIntentId: intent.paymentIntentId,
      isMock: intent.mock,
      isOrganiser: group.organiser_id === user.id,
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) return redirect(`/login?next=/groups/${params.slug}/pay`, { headers });

  const { admin, group, members, me, booking } = await load(request, env, params.slug!, user.id);
  if (!booking) return data({ error: "There is nothing to pay yet." }, { status: 400, headers });

  const form = await request.formData();
  const paymentIntentId = String(form.get("payment_intent_id") ?? "");
  const stripe = getStripe(env);
  const pi = await stripe.retrievePaymentIntent(paymentIntentId);
  if (pi.status !== "succeeded") {
    return data({ error: "Payment didn’t complete. Try again." }, { status: 400, headers });
  }

  // Idempotent on the intent: a double submit or a re-delivered webhook must
  // not credit one person's share twice.
  const { data: already } = await admin
    .from("payments")
    .select("id")
    .eq("stripe_payment_intent", paymentIntentId)
    .eq("status", "succeeded")
    .maybeSingle();

  const shares = depositShares(
    booking.deposit_usd_cents,
    members,
    group.payment_mode,
    group.organiser_id,
  );
  const mine = shareState(me, shares.get(me.id) ?? 0);

  // Credit what the intent was actually created for, not what is owed at this
  // instant: somebody joining the group between the page loading and the
  // button being pressed changes the arithmetic, and the money that moved is
  // the amount on the intent.
  const { data: pendingRow } = await admin
    .from("payments")
    .select("amount_usd_cents")
    .eq("stripe_payment_intent", paymentIntentId)
    .eq("group_member_id", me.id)
    .maybeSingle();
  const charged = Math.max(0, pendingRow?.amount_usd_cents ?? mine.outstandingUsdCents);

  if (!already && charged > 0) {
    await admin.from("payments").upsert(
      {
        booking_id: booking.id,
        group_member_id: me.id,
        stripe_payment_intent: paymentIntentId,
        type: "share",
        amount_usd_cents: charged,
        status: "succeeded",
      },
      { onConflict: "stripe_payment_intent,type" },
    );
    await admin
      .from("trip_group_members")
      .update({ paid_usd_cents: mine.paidUsdCents + charged })
      .eq("id", me.id);

    const profile = await getProfile(env, user.id);
    await systemLine(
      admin,
      group.id,
      user.id,
      `${firstName(profile?.full_name) || me.display_name} paid their share.`,
    );
  }

  // The booking moves when the money adds up — not when any one person pays.
  const { data: payments } = await admin
    .from("payments")
    .select("type, amount_usd_cents, status")
    .eq("booking_id", booking.id);
  if (depositIsCovered(payments ?? [], booking.deposit_usd_cents)) {
    const { advanceOnDepositPaid } = await import("~/lib/booking.server");
    await advanceOnDepositPaid(admin, booking.id);
    await systemLine(
      admin,
      group.id,
      user.id,
      "Everyone has paid — the trip is booked.",
    );
    const { notifyDepositPaid } = await import("~/lib/notifications.server");
    await notifyDepositPaid(env, admin, booking.id);
  }
  await recomputeShares(admin, group.id);

  return redirect(`/groups/${params.slug}`, { headers });
}

export default function PayShare({ loaderData, actionData }: Route.ComponentProps) {
  const { group, booking, mine, seats, paymentIntentId, isMock } = loaderData as any;
  const { m } = useMoney();
  const nav = useNavigation();
  const done = mine.outstandingUsdCents === 0;

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link to={`/groups/${group.slug}`} className="text-sm text-primary">
        ← {group.name}
      </Link>
      <h1 className="mt-2 font-display text-2xl text-ink">Your share</h1>
      <p className="mt-1 text-ink-soft">
        {booking.offering?.title} · {seats} {seats === 1 ? "person" : "people"}
      </p>

      {done ? (
        <div className="mt-6 rounded-card border border-border bg-card p-4">
          <p className="font-medium text-ink">Your share is in.</p>
          <p className="mt-1 text-sm text-ink-soft">
            {m(mine.paidUsdCents)} paid. The trip is booked once everyone else
            has done the same — nobody is chasing you, and you are not chasing
            them.
          </p>
          <Link
            to={`/groups/${group.slug}`}
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            Back to the trip →
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-card border border-border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">Due now</span>
              <span className="font-mono text-2xl text-ink">
                {m(mine.outstandingUsdCents)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-sm text-ink-soft">
              <span>Your share of the whole trip</span>
              <span className="font-mono">{m(mine.tripShareUsdCents)}</span>
            </div>
            <p className="mt-3 border-t border-border pt-3 text-sm text-ink-soft">
              This is your part of the deposit, and it is what holds the dates.
              The rest of your share is due before you fly.
            </p>
          </div>

          {actionData && "error" in (actionData as any) && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {(actionData as any).error}
            </p>
          )}

          <Form method="post" className="mt-4">
            <input type="hidden" name="payment_intent_id" value={paymentIntentId} />
            <Button type="submit" className="w-full" loading={nav.state !== "idle"}>
              Pay {m(mine.outstandingUsdCents)}
            </Button>
          </Form>

          {isMock && (
            <p className="mt-2 text-center text-xs text-ink-soft">
              Test mode — no card is charged.
            </p>
          )}

          <TrustPanel
            className="mt-4"
            title="What this pays for"
            items={[
              {
                label: "Only your share.",
                note: "Everyone pays their own; nobody fronts the group's money.",
              },
              {
                label: "The trip books when the last share lands.",
                note: "Until then everything paid is held against this booking.",
              },
              { label: "Cancel free until 30 days before you leave." },
            ]}
          />
        </>
      )}
    </main>
  );
}
