import { data, redirect } from "react-router";
import type { Route } from "./+types/groups.$slug.enquire";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { activeMembers, blockedFromBooking, type GroupMember, type TripGroup } from "~/lib/groups";
import { systemLine } from "~/lib/groups.server";
import { ENQUIRY_TTL_HOURS } from "~/lib/config";
import { firstName } from "~/lib/names";

/**
 * A ready group asks the guide to hold the dates.
 *
 * The group does not invent a second booking path — it produces one ordinary
 * enquiry, for the whole party, from the organiser. Everything downstream
 * (the guide's accept, the deposit, the permits, the contract) is the flow we
 * already have and already test. The only thing the group adds is that the
 * party size and the date came from several people agreeing rather than one
 * person guessing.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const back = `/groups/${params.slug}`;
  if (!user) return redirect(`/login?next=${encodeURIComponent(back)}`, { headers });

  const admin = createAdminClient(env);
  const { data: groupRow } = await admin
    .from("trip_groups")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!groupRow) throw new Response("Not found", { status: 404 });
  const group = groupRow as TripGroup;

  if (group.organiser_id !== user.id) {
    return data({ error: "Only the organiser can send this." }, { status: 403, headers });
  }

  const { data: rows } = await admin
    .from("trip_group_members")
    .select("*")
    .eq("group_id", group.id)
    .order("created_at");
  const members = (rows ?? []) as GroupMember[];

  // The same gate the button is disabled by — re-checked here because a
  // disabled button is a hint, not a rule.
  const blocked = blockedFromBooking(group, members);
  if (blocked) return data({ error: blocked }, { status: 400, headers });

  const party = activeMembers(members).length;
  const { data: offering } = await admin
    .from("offerings")
    .select("id, title, guide_id, min_party, max_party")
    .eq("id", group.offering_id!)
    .maybeSingle();
  if (!offering) return data({ error: "That trip isn't available." }, { status: 400, headers });

  const minP = offering.min_party ?? 1;
  const maxP = offering.max_party ?? 12;
  if (party < minP || party > maxP) {
    return data(
      {
        error: `This trek takes ${minP}–${maxP} people and there are ${party} of you. Change the roster or pick another trip.`,
      },
      { status: 400, headers },
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!group.start_date || group.start_date <= today) {
    return data({ error: "Pick a start date in the future." }, { status: 400, headers });
  }

  const profile = await getProfile(env, user.id);
  const names = activeMembers(members)
    .map((m) => m.display_name)
    .join(", ");

  const { data: enq, error } = await admin
    .from("enquiries")
    .insert({
      trekker_id: user.id,
      guide_id: offering.guide_id,
      offering_id: offering.id,
      start_date: group.start_date,
      party_size: party,
      message:
        `We are a group of ${party} — ${names}. ` +
        (group.payment_mode === "organiser"
          ? "I am paying for everyone."
          : "We are splitting the cost between us.") +
        (group.note ? `\n\n${group.note}` : ""),
      status: "open",
      expires_at: new Date(Date.now() + ENQUIRY_TTL_HOURS * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !enq) {
    return data({ error: "Could not send it to the guide." }, { status: 400, headers });
  }

  await admin.from("trip_groups").update({ status: "ready" }).eq("id", group.id);
  await systemLine(
    admin,
    group.id,
    user.id,
    `${firstName(profile?.full_name) || "The organiser"} asked the guide to hold ${group.start_date} for ${party}.`,
  );

  const { notifyNewEnquiry } = await import("~/lib/notifications.server");
  await notifyNewEnquiry(env, admin, {
    guideId: offering.guide_id,
    offeringTitle: offering.title,
    startDate: group.start_date,
    partySize: party,
  });

  return redirect(back, { headers });
}
