import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeMembers,
  assignShares,
  groupSlug,
  slugTail,
  splitEvenly,
  type GroupMember,
  type PaymentMode,
  type TripGroup,
} from "~/lib/groups";
import { partyAmounts, type PriceBreakdown } from "~/lib/experience-pricing";

/**
 * Trip-group writes.
 *
 * Everything a group page can do runs through here so the two rules that
 * matter — shares always sum to the trip total, and the roster always agrees
 * with the party size we would book — have one implementation.
 */

export async function createGroup(
  admin: SupabaseClient,
  input: {
    organiserId: string;
    organiserName: string;
    name: string;
    offeringId?: string | null;
    guideId?: string | null;
    startDate?: string | null;
    partyTarget: number;
    paymentMode: PaymentMode;
  },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = groupSlug(input.name, slugTail(crypto.getRandomValues(new Uint8Array(8))));
    const { data: group, error } = await admin
      .from("trip_groups")
      .insert({
        slug,
        name: input.name.trim(),
        organiser_id: input.organiserId,
        offering_id: input.offeringId ?? null,
        guide_id: input.guideId ?? null,
        start_date: input.startDate || null,
        party_target: input.partyTarget,
        payment_mode: input.paymentMode,
      })
      .select("*")
      .single();
    // Unique violation on the slug is the only retryable failure; anything
    // else is a real error and retrying would just repeat it.
    if (error?.code === "23505") continue;
    if (error) throw new Error(error.message);

    await admin.from("trip_group_members").insert({
      group_id: group.id,
      user_id: input.organiserId,
      display_name: input.organiserName,
      role: "organiser",
      status: "joined",
      joined_at: new Date().toISOString(),
    });
    await systemLine(admin, group.id, input.organiserId, `${input.organiserName} started this trip.`);
    await recomputeShares(admin, group.id);
    return group as TripGroup;
  }
  throw new Error("Could not create the group — try a different name.");
}

/** A line in the chat that nobody typed: joins, payments, the booking. */
export async function systemLine(
  admin: SupabaseClient,
  groupId: string,
  authorId: string,
  body: string,
) {
  await admin.from("trip_group_messages").insert({
    group_id: groupId,
    author_id: authorId,
    body,
    kind: "system",
  });
}

/**
 * Price the trip for the current roster and write each member's share.
 *
 * Called after anything that changes the total or the roster — a new member,
 * a drop-out, a different trek, a switch between payment modes. Shares are
 * derived, never edited by hand, so the group total cannot drift away from
 * what the booking would actually cost.
 */
export async function recomputeShares(admin: SupabaseClient, groupId: string) {
  const { data: group } = await admin
    .from("trip_groups")
    .select("*")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return;
  if (group.status === "cancelled") return;

  const { data: rows } = await admin
    .from("trip_group_members")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at");
  const members = (rows ?? []) as GroupMember[];
  const party = Math.max(1, activeMembers(members).length);

  let total = 0;
  // A booked group splits the real bill, not a fresh quote. The booking is
  // the authority the moment it exists — re-pricing here would let the group
  // page disagree with the invoice.
  if (group.booking_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("total_usd_cents, party_size")
      .eq("id", group.booking_id)
      .maybeSingle();
    if (booking) {
      // Split across the party that was booked, not across whoever has
      // joined so far: two people who have claimed their seats on a trip
      // booked for four owe two shares, not half the trek each.
      const seats = Math.max(1, booking.party_size);
      const perSeat = splitEvenly(booking.total_usd_cents, seats);
      const ordered = activeMembers(members);
      const shares = new Map<string, number>();
      for (const m of members) shares.set(m.id, 0);
      if (group.payment_mode === "organiser") {
        const org = ordered.find((m) => m.user_id === group.organiser_id) ?? ordered[0];
        if (org) shares.set(org.id, booking.total_usd_cents);
      } else {
        ordered.forEach((m, i) => shares.set(m.id, perSeat[i] ?? perSeat[perSeat.length - 1] ?? 0));
      }
      await Promise.all(
        members.map((m) =>
          admin
            .from("trip_group_members")
            .update({ share_usd_cents: shares.get(m.id) ?? 0 })
            .eq("id", m.id),
        ),
      );
      return;
    }
  }
  if (group.offering_id) {
    const { data: offering } = await admin
      .from("offerings")
      .select("price_breakdown, price_usd_cents, max_party")
      .eq("id", group.offering_id)
      .maybeSingle();
    const bd = offering?.price_breakdown as PriceBreakdown | null;
    if (bd?.guide_fee_total_usd_cents) {
      // The whole trip for this many people — the same number the
      // booking would charge, so the shares add up to the real bill.
      total = partyAmounts(bd, party).totalUsdCents;
    } else if (offering?.price_usd_cents) {
      total = offering.price_usd_cents * party;
    }
  }

  const shares = assignShares(members, total, group.payment_mode as PaymentMode, group.organiser_id);
  await Promise.all(
    members.map((m) =>
      admin
        .from("trip_group_members")
        .update({ share_usd_cents: shares.get(m.id) ?? 0 })
        .eq("id", m.id),
    ),
  );
}

/**
 * Add someone to a group by the invite link.
 *
 * If the organiser pre-invited their email, that row is claimed rather than a
 * second one created — otherwise Marie appears twice, once as an invite and
 * once as herself, and the party size is wrong by one.
 */
export async function joinGroup(
  admin: SupabaseClient,
  group: { id: string; party_target: number; status: string },
  user: { id: string; email?: string | null },
  displayName: string,
): Promise<string | null> {
  if (group.status === "booked") return "This trip is already booked.";
  if (group.status === "cancelled") return "This trip was cancelled.";

  const { data: rows } = await admin
    .from("trip_group_members")
    .select("*")
    .eq("group_id", group.id);
  const members = (rows ?? []) as GroupMember[];

  const mine = members.find((m) => m.user_id === user.id);
  if (mine) {
    if (mine.status === "joined") return null; // already in; not an error
    await admin
      .from("trip_group_members")
      .update({ status: "joined", joined_at: new Date().toISOString() })
      .eq("id", mine.id);
    await systemLine(admin, group.id, user.id, `${displayName} joined.`);
    await recomputeShares(admin, group.id);
    return null;
  }

  const byEmail = user.email
    ? members.find(
        (m) => m.invited_email?.toLowerCase() === user.email!.toLowerCase() && !m.user_id,
      )
    : undefined;
  if (byEmail) {
    // The invite row was named from the email local part ("yuki") because that
    // is all the organiser gave us. Now that she has signed in, use the name
    // she goes by.
    await admin
      .from("trip_group_members")
      .update({
        user_id: user.id,
        display_name: displayName,
        status: "joined",
        joined_at: new Date().toISOString(),
      })
      .eq("id", byEmail.id);
    await systemLine(admin, group.id, user.id, `${displayName} joined.`);
    await recomputeShares(admin, group.id);
    return null;
  }

  if (activeMembers(members).length >= group.party_target) {
    return "This trip is full. Ask the organiser to make room.";
  }

  const { error } = await admin.from("trip_group_members").insert({
    group_id: group.id,
    user_id: user.id,
    display_name: displayName,
    status: "joined",
    joined_at: new Date().toISOString(),
  });
  if (error) return error.message;
  await systemLine(admin, group.id, user.id, `${displayName} joined.`);
  await recomputeShares(admin, group.id);
  return null;
}


/**
 * Turn an accepted booking into a group.
 *
 * The other direction from /groups/new: someone books a trek for four in the
 * ordinary way, the guide accepts, and only then do they need somewhere to
 * invite the other three, talk, and split the bill. Waiting for the accept is
 * the point — a group formed around a trip the guide never confirmed is a room
 * full of people with nothing to plan.
 *
 * Solo bookings get nothing. Idempotent: one group per booking, ever.
 */
export async function groupForBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const { data: booking } = await admin
    .from("bookings")
    .select("id, trekker_id, guide_id, offering_id, start_date, party_size, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.party_size < 2) return null;

  const { data: existing } = await admin
    .from("trip_groups")
    .select("slug")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) return existing.slug;

  const [{ data: offering }, { data: trekker }] = await Promise.all([
    admin.from("offerings").select("title").eq("id", booking.offering_id).maybeSingle(),
    admin.from("users").select("full_name").eq("id", booking.trekker_id).maybeSingle(),
  ]);
  const organiserName = trekker?.full_name ?? "The organiser";

  for (let attempt = 0; attempt < 5; attempt++) {
    const name = offering?.title ?? "Our trek";
    const slug = groupSlug(name, slugTail(crypto.getRandomValues(new Uint8Array(8))));
    const { data: group, error } = await admin
      .from("trip_groups")
      .insert({
        slug,
        name,
        organiser_id: booking.trekker_id,
        offering_id: booking.offering_id,
        guide_id: booking.guide_id,
        start_date: booking.start_date,
        party_target: booking.party_size,
        payment_mode: "split",
        status: "booked",
        booking_id: booking.id,
      })
      .select("id, slug")
      .single();
    if (error?.code === "23505") continue;
    if (error) return null; // never let group creation break an accepted booking

    await admin.from("trip_group_members").insert({
      group_id: group.id,
      user_id: booking.trekker_id,
      display_name: organiserName,
      role: "organiser",
      status: "joined",
      joined_at: new Date().toISOString(),
    });
    await systemLine(
      admin,
      group.id,
      booking.trekker_id,
      `The guide confirmed ${booking.start_date} for ${booking.party_size}. Invite the others and split it here.`,
    );
    await recomputeShares(admin, group.id);
    return group.slug;
  }
  return null;
}
