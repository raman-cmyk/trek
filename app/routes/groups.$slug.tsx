import { useEffect, useRef } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/groups.$slug";
import { pageMeta } from "~/lib/seo";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { SmartImage } from "~/components/SmartImage";
import { useMoney } from "~/lib/currency-context";
import {
  activeMembers,
  blockedFromBooking,
  groupMoney,
  type GroupMember,
  type TripGroup,
} from "~/lib/groups";
import { joinGroup, recomputeShares, systemLine } from "~/lib/groups.server";
import { cn } from "~/lib/cn";
import { firstName } from "~/lib/names";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return pageMeta({
    title: (d as any)?.group?.name ?? "A trip together",
    description: "Who is coming, what it costs, and who has paid.",
    canonical: "",
    noindex: true,
  });
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const next = `/groups/${params.slug}`;
  if (!user) throw redirect(`/login?next=${encodeURIComponent(next)}`, { headers });

  const admin = createAdminClient(env);
  const { data: group } = await admin
    .from("trip_groups")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!group) throw new Response("Not found", { status: 404 });

  const { data: rows } = await admin
    .from("trip_group_members")
    .select("*")
    .eq("group_id", group.id)
    .order("created_at");
  const members = (rows ?? []) as (GroupMember & { group_id: string })[];
  const me = members.find((m) => m.user_id === user.id) ?? null;

  // Not a member yet: the invite link lands here, so show the trip and a way
  // in rather than a 404 that reads like a broken link.
  const isMember = !!me && me.status !== "removed" && me.status !== "declined";
  const isOrganiser = group.organiser_id === user.id;

  const [{ data: messages }, { data: offering }, { data: booking }, { data: guide }, { data: profiles }] =
    await Promise.all([
    isMember
      ? admin
          .from("trip_group_messages")
          .select("id, author_id, body, kind, created_at")
          .eq("group_id", group.id)
          .order("created_at")
          .limit(300)
      : Promise.resolve({ data: [] }),
    group.offering_id
      ? admin
          .from("public_offerings")
          .select("id, slug, kind, title, days, cover_photo_url, guide_slug, guide_name, guide_avatar_url, route_name, route_slug, max_party")
          .eq("id", group.offering_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    group.booking_id
      ? admin
          .from("bookings")
          .select("id, total_usd_cents, party_size, status, deposit_usd_cents")
          .eq("id", group.booking_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    group.guide_id
      ? admin
          .from("public_guides")
          .select("user_id, slug, full_name, avatar_url, home_district, only_with_me, day_rate_usd_cents")
          .eq("user_id", group.guide_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("users")
      .select("id, full_name, avatar_url")
      .in("id", members.map((m) => m.user_id).filter(Boolean) as string[]),
  ]);

  const avatarById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const origin = new URL(request.url).origin;

  return data(
    {
      group: group as TripGroup,
      members: members.map((m) => ({
        ...m,
        avatar_url: m.user_id ? (avatarById.get(m.user_id)?.avatar_url ?? null) : null,
      })),
      messages: messages ?? [],
      offering: offering ?? null,
      booking: booking ?? null,
      guide: guide ?? null,
      me,
      isMember,
      isOrganiser,
      userId: user.id,
      inviteUrl: `${origin}/groups/${group.slug}`,
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const next = `/groups/${params.slug}`;
  if (!user) return redirect(`/login?next=${encodeURIComponent(next)}`, { headers });

  const admin = createAdminClient(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const { data: group } = await admin
    .from("trip_groups")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!group) throw new Response("Not found", { status: 404 });

  const profile = await getProfile(env, user.id);
  const myName = profile?.full_name ?? "Someone";
  const isOrganiser = group.organiser_id === user.id;

  const { data: memberRows } = await admin
    .from("trip_group_members")
    .select("*")
    .eq("group_id", group.id)
    .order("created_at");
  const members = (memberRows ?? []) as GroupMember[];
  const me = members.find((m) => m.user_id === user.id) ?? null;
  const iAmIn = !!me && (me.status === "joined" || me.status === "invited");

  if (intent === "join") {
    const err = await joinGroup(admin, group, { id: user.id, email: profile?.email }, myName);
    return err ? data({ error: err }, { status: 400, headers }) : data({ ok: true }, { headers });
  }

  if (!iAmIn && !isOrganiser) {
    return data({ error: "Join the trip first." }, { status: 403, headers });
  }

  if (intent === "message") {
    const body = String(form.get("body") ?? "").trim();
    if (!body) return data({ error: "Type something first." }, { status: 400, headers });
    const { error } = await admin.from("trip_group_messages").insert({
      group_id: group.id,
      author_id: user.id,
      body: body.slice(0, 4000),
    });
    return error
      ? data({ error: error.message }, { status: 400, headers })
      : data({ ok: true }, { headers });
  }

  if (intent === "leave") {
    if (isOrganiser) {
      return data(
        { error: "You started this trip — cancel it instead of leaving." },
        { status: 400, headers },
      );
    }
    if (me) {
      await admin.from("trip_group_members").update({ status: "declined" }).eq("id", me.id);
      await systemLine(admin, group.id, user.id, `${myName} left the trip.`);
      await recomputeShares(admin, group.id);
    }
    return redirect("/groups", { headers });
  }

  // ── Organiser-only from here ──────────────────────────────────────────────
  if (!isOrganiser) {
    return data({ error: "Only the organiser can change the trip." }, { status: 403, headers });
  }

  if (intent === "invite") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!email.includes("@")) {
      return data({ error: "That does not look like an email address." }, { status: 400, headers });
    }
    if (activeMembers(members).length >= group.party_target) {
      return data(
        { error: "The trip is full — raise the number of people first." },
        { status: 400, headers },
      );
    }
    const { error } = await admin.from("trip_group_members").insert({
      group_id: group.id,
      invited_email: email,
      display_name: email.split("@")[0],
      status: "invited",
    });
    if (error) {
      return data(
        { error: error.code === "23505" ? "They are already on the list." : error.message },
        { status: 400, headers },
      );
    }
    await systemLine(admin, group.id, user.id, `${myName} invited ${email}.`);
    await recomputeShares(admin, group.id);
    return data({ ok: true }, { headers });
  }

  if (intent === "remove") {
    const id = String(form.get("member_id") ?? "");
    const target = members.find((m) => m.id === id);
    if (target && target.role !== "organiser") {
      await admin.from("trip_group_members").update({ status: "removed" }).eq("id", id);
      await systemLine(admin, group.id, user.id, `${target.display_name} was taken off the list.`);
      await recomputeShares(admin, group.id);
    }
    return data({ ok: true }, { headers });
  }

  if (intent === "settings") {
    const patch: Record<string, unknown> = {};
    const offeringId = String(form.get("offering_id") ?? "");
    if (form.has("offering_id")) {
      patch.offering_id = offeringId || null;
      if (offeringId) {
        const { data: o } = await admin
          .from("offerings")
          .select("guide_id")
          .eq("id", offeringId)
          .maybeSingle();
        patch.guide_id = o?.guide_id ?? null;
      } else {
        patch.guide_id = null;
      }
    }
    if (form.has("start_date")) patch.start_date = String(form.get("start_date") ?? "") || null;
    if (form.has("party_target")) {
      patch.party_target = Math.min(24, Math.max(1, Number(form.get("party_target")) || 2));
    }
    if (form.has("payment_mode")) {
      patch.payment_mode = form.get("payment_mode") === "organiser" ? "organiser" : "split";
    }
    patch.updated_at = new Date().toISOString();
    const { error } = await admin.from("trip_groups").update(patch).eq("id", group.id);
    if (error) return data({ error: error.message }, { status: 400, headers });
    await recomputeShares(admin, group.id);
    return data({ ok: true }, { headers });
  }

  if (intent === "cancel") {
    await admin.from("trip_groups").update({ status: "cancelled" }).eq("id", group.id);
    await systemLine(admin, group.id, user.id, `${myName} cancelled the trip.`);
    return data({ ok: true }, { headers });
  }

  return data({ error: "Unknown action." }, { status: 400, headers });
}

export default function GroupPage({ loaderData, actionData }: Route.ComponentProps) {
  const { group, members, messages, offering, booking, guide, me, isMember, isOrganiser, userId, inviteUrl } =
    loaderData as any;
  const { m: money } = useMoney();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  // On a booked trip the bill is the booking's, and the seats are the party
  // that was booked — not however many people have signed in so far.
  const seats = booking ? booking.party_size : undefined;
  const purse = groupMoney(members, booking?.total_usd_cents, seats);
  const blocked = blockedFromBooking(group, members);
  const active = activeMembers(members);
  const mine = members.find((x: GroupMember) => x.user_id === userId);
  const organiserName =
    members.find((x: GroupMember) => x.role === "organiser")?.display_name ?? "the organiser";
  const iOwe = mine ? Math.max(0, mine.share_usd_cents - mine.paid_usd_cents) : 0;

  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Newest at the bottom, like every chat anyone has ever used.
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);

  if (!isMember) {
    return (
      <JoinInvite
        group={group}
        offering={offering}
        guide={guide}
        actionData={actionData}
        busy={busy}
      />
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/groups" className="text-sm text-moss hover:underline">
        ← Your trips
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink sm:text-4xl">{group.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {offering ? (
              <Link
                to={`/${offering.kind === "trek" ? "treks" : "experiences"}/${offering.slug}`}
                className="text-moss underline underline-offset-4"
              >
                {offering.title}
              </Link>
            ) : guide ? (
              <>
                Trek not picked — going with{" "}
                <Link to={`/guides/${guide.slug}`} className="text-moss underline underline-offset-4">
                  {firstName(guide.full_name)}
                </Link>
              </>
            ) : (
              "No trek or guide picked yet"
            )}
            {group.start_date && ` · ${group.start_date}`}
            {` · ${active.length} of ${group.party_target}`}
          </p>
        </div>
        <span
          className={cn(
            "rounded-pill px-3 py-1 text-sm font-medium",
            group.status === "booked"
              ? "bg-moss text-paper"
              : group.status === "cancelled"
                ? "bg-ember/15 text-ember"
                : "border border-line text-muted",
          )}
        >
          {group.status === "booked" ? "Booked" : group.status === "cancelled" ? "Cancelled" : "Planning"}
        </span>
      </header>

      {(actionData as any)?.error && (
        <p className="mt-4 rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_20rem]">
        {/* ── Left: money, roster, chat ─────────────────────────────────── */}
        <div className="min-w-0 space-y-8">
          {/* What it costs and who has paid. The bar is the whole story. */}
          <section className="rounded-md border border-line bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl text-ink">
                {group.payment_mode === "organiser" ? "One person is paying" : "Everyone pays their share"}
              </h2>
              {purse.totalUsdCents > 0 && (
                <p className="font-mono text-sm text-muted">
                  <span className="text-ink">{money(purse.paidUsdCents)}</span> of{" "}
                  {money(purse.totalUsdCents)}
                </p>
              )}
            </div>

            {purse.totalUsdCents === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Pick the trek and the shares work themselves out — the price
                depends on how many of you go.
              </p>
            ) : (
              <>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist">
                  <div
                    className="h-full rounded-full bg-moss transition-[width] duration-slow ease-out-soft"
                    style={{ width: `${Math.round(purse.progress * 100)}%` }}
                  />
                </div>
                {purse.unclaimedSeats > 0 && (
                  <p className="mt-2 font-mono text-caption text-muted">
                    {purse.unclaimedSeats} of {seats} {seats === 1 ? "seat" : "seats"} still
                    unclaimed — send them the link below.
                  </p>
                )}
                {iOwe > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-mist p-3">
                    <p className="min-w-0 flex-1 text-sm text-ink">
                      Your share is{" "}
                      <span className="font-mono font-medium">{money(mine.share_usd_cents)}</span>
                      {mine.paid_usd_cents > 0 && (
                        <> — {money(mine.paid_usd_cents)} already in</>
                      )}
                    </p>
                    {/* Three different truths, and saying the wrong one is
                        worse than saying nothing: the organiser of a booked
                        trip has a real deposit to pay right now; the others
                        cannot pay us directly until per-person charging is
                        live; and on an unbooked trip nobody owes anything
                        yet. */}
                    {booking && isOrganiser ? (
                      <Link
                        to={`/checkout/${booking.id}`}
                        className="shrink-0 rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
                      >
                        Pay the deposit — {money(booking.deposit_usd_cents)}
                      </Link>
                    ) : booking ? (
                      <span className="shrink-0 rounded border border-line bg-paper px-3 py-2 text-sm text-muted">
                        Settle {money(iOwe)} with {organiserName}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded border border-line bg-paper px-3 py-2 text-sm text-muted">
                        Nothing to pay until the guide confirms
                      </span>
                    )}
                  </div>
                ) : (
                  active.length > 0 && (
                    <p className="mt-3 text-sm text-moss">
                      {purse.everyoneIn
                        ? "Everyone is paid up."
                        : group.payment_mode === "organiser"
                          ? "Nothing for you to pay — the organiser has this."
                          : "Your share is paid."}
                    </p>
                  )
                )}
              </>
            )}
          </section>

          {/* Who is coming */}
          <section>
            <h2 className="font-display text-xl text-ink">Who is coming</h2>
            <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-card">
              {members
                .filter((x: any) => x.status !== "removed" && x.status !== "declined")
                .map((x: any) => {
                  const owes = Math.max(0, x.share_usd_cents - x.paid_usd_cents);
                  return (
                    <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                      <SmartImage
                        src={x.avatar_url ?? ""}
                        alt={x.display_name}
                        width={40}
                        height={40}
                        className="h-9 w-9 shrink-0 rounded-full"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {x.display_name}
                          {x.role === "organiser" && (
                            <span className="ml-2 font-normal text-caption text-muted">organiser</span>
                          )}
                        </p>
                        <p className="font-mono text-caption text-muted">
                          {x.status === "invited"
                            ? "invited — not accepted yet"
                            : x.share_usd_cents === 0
                              ? "nothing to pay"
                              : owes === 0
                                ? `${money(x.share_usd_cents)} · paid`
                                : `${money(x.share_usd_cents)} · ${money(owes)} to go`}
                        </p>
                      </div>
                      {isOrganiser && x.role !== "organiser" && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="remove" />
                          <input type="hidden" name="member_id" value={x.id} />
                          <button
                            className="text-caption text-muted hover:text-ember"
                            aria-label={`Remove ${x.display_name}`}
                          >
                            Remove
                          </button>
                        </Form>
                      )}
                    </li>
                  );
                })}
            </ul>

            {isOrganiser && group.status === "forming" && (
              <div className="mt-3 space-y-3">
                <Form method="post" className="flex flex-wrap gap-2">
                  <input type="hidden" name="intent" value="invite" />
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="their@email.com"
                    className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss"
                  />
                  <button
                    disabled={busy}
                    className="rounded border border-moss px-4 py-2 text-sm font-medium text-moss hover:bg-mist disabled:opacity-60"
                  >
                    Invite
                  </button>
                </Form>
                <CopyLink url={inviteUrl} />
              </div>
            )}
          </section>

          {/* The chat */}
          <section>
            <h2 className="font-display text-xl text-ink">Talk it through</h2>
            <div
              ref={scroller}
              className="mt-3 max-h-[26rem] space-y-3 overflow-y-auto rounded-md border border-line bg-card p-4"
            >
              {messages.length === 0 && (
                <p className="text-sm text-muted">
                  Nothing said yet. Somebody has to go first.
                </p>
              )}
              {messages.map((msg: any) => {
                const author = members.find((x: any) => x.user_id === msg.author_id);
                if (msg.kind === "system") {
                  return (
                    <p key={msg.id} className="text-center text-caption text-muted">
                      {msg.body}
                    </p>
                  );
                }
                const isMe = msg.author_id === userId;
                return (
                  <div key={msg.id} className={cn("flex gap-2.5", isMe && "flex-row-reverse")}>
                    <SmartImage
                      src={author?.avatar_url ?? ""}
                      alt={author?.display_name ?? ""}
                      width={32}
                      height={32}
                      className="h-7 w-7 shrink-0 rounded-full"
                    />
                    <div className={cn("max-w-[80%]", isMe && "text-right")}>
                      <p className="text-caption text-muted">
                        {isMe ? "You" : (author?.display_name ?? "Someone")}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 inline-block whitespace-pre-line rounded-md px-3 py-2 text-left text-[15px] leading-relaxed",
                          isMe ? "bg-pine text-paper" : "bg-mist text-ink",
                        )}
                      >
                        {msg.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <Form method="post" replace className="mt-3 flex gap-2">
              <input type="hidden" name="intent" value="message" />
              <input
                name="body"
                required
                maxLength={4000}
                placeholder="Say something…"
                className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss"
              />
              <button
                disabled={busy}
                className="rounded bg-pine px-4 py-2.5 text-sm font-medium text-paper hover:bg-moss disabled:opacity-60"
              >
                Send
              </button>
            </Form>
          </section>
        </div>

        {/* ── Right: the trip, and the button that ends the planning ────── */}
        <aside className="space-y-4">
          {offering && (
            <div className="overflow-hidden rounded-md border border-line bg-card">
              <SmartImage
                src={offering.cover_photo_url ?? ""}
                alt={offering.title}
                width={480}
                height={300}
                className="aspect-[8/5] w-full"
              />
              <div className="p-4">
                <p className="font-medium text-ink">{offering.title}</p>
                <p className="mt-0.5 font-mono text-caption text-muted">
                  {offering.days} days
                  {offering.route_name && ` · ${offering.route_name}`}
                </p>
                <Link
                  to={`/guides/${offering.guide_slug}`}
                  className="mt-3 flex items-center gap-2 text-sm text-ink hover:text-moss"
                >
                  <SmartImage
                    src={offering.guide_avatar_url ?? ""}
                    alt={firstName(offering.guide_name)}
                    width={32}
                    height={32}
                    className="h-7 w-7 rounded-full"
                  />
                  {firstName(offering.guide_name)}
                </Link>
              </div>
            </div>
          )}

          {!offering && guide && (
            <div className="rounded-md border border-line bg-card p-4">
              <Link to={`/guides/${guide.slug}`} className="flex items-center gap-3">
                <SmartImage
                  src={guide.avatar_url ?? ""}
                  alt={firstName(guide.full_name)}
                  width={56}
                  height={56}
                  className="h-12 w-12 rounded-full"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{firstName(guide.full_name)}</span>
                  <span className="block font-mono text-caption text-muted">
                    {guide.home_district}
                  </span>
                </span>
              </Link>
              {guide.only_with_me && (
                <p className="mt-3 border-l-2 border-chartreuse pl-2.5 font-display text-sm leading-snug text-ink">
                  {guide.only_with_me}
                </p>
              )}
              <Form method="post" action="/conversations" className="mt-3">
                <input type="hidden" name="guide_id" value={guide.user_id} />
                <input type="hidden" name="next" value={`/groups/${group.slug}`} />
                <button className="w-full rounded border border-moss px-3 py-2 text-sm font-medium text-moss hover:bg-mist">
                  Ask {firstName(guide.full_name)} what he would run
                </button>
              </Form>
            </div>
          )}

          <div className="rounded-md border border-line bg-card p-4">
            <p className="label text-muted">Next</p>
            {group.status === "booked" ? (
              <>
                <p className="mt-2 text-sm text-ink">This trip is booked.</p>
                {group.booking_id && (
                  <Link
                    to={`/trips/${group.booking_id}`}
                    className="mt-2 inline-block text-sm text-moss underline underline-offset-4"
                  >
                    See the booking →
                  </Link>
                )}
              </>
            ) : blocked ? (
              <p className="mt-2 text-sm text-muted">{blocked}</p>
            ) : (
              <p className="mt-2 text-sm text-moss">
                Everyone is in and paid up. {isOrganiser ? "Send it to the guide." : "The organiser can send it now."}
              </p>
            )}
            {isOrganiser && group.status === "forming" && offering && (
              <Form method="post" action={`/groups/${group.slug}/enquire`} className="mt-3">
                <button
                  disabled={busy || !!blocked}
                  className="w-full rounded bg-pine px-4 py-2.5 text-sm font-medium text-paper hover:bg-moss disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ask {firstName(offering.guide_name)} to hold it
                </button>
              </Form>
            )}
          </div>

          {isOrganiser && group.status === "forming" && (
            <details className="rounded-md border border-line bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                Change the trip
              </summary>
              <Form method="post" className="mt-3 space-y-3">
                <input type="hidden" name="intent" value="settings" />
                <label className="block text-caption text-ink-soft">
                  Start date
                  <input
                    type="date"
                    name="start_date"
                    defaultValue={group.start_date ?? ""}
                    className="mt-1 w-full rounded border border-line bg-paper px-2.5 py-2 text-sm text-ink"
                  />
                </label>
                <label className="block text-caption text-ink-soft">
                  How many people
                  <input
                    type="number"
                    name="party_target"
                    min={1}
                    max={24}
                    defaultValue={group.party_target}
                    className="mt-1 w-full rounded border border-line bg-paper px-2.5 py-2 text-sm text-ink"
                  />
                </label>
                <label className="block text-caption text-ink-soft">
                  Who pays
                  <select
                    name="payment_mode"
                    defaultValue={group.payment_mode}
                    className="mt-1 w-full rounded border border-line bg-paper px-2.5 py-2 text-sm text-ink"
                  >
                    <option value="split">Everyone pays their share</option>
                    <option value="organiser">One person pays</option>
                  </select>
                </label>
                <button
                  disabled={busy}
                  className="w-full rounded border border-moss px-3 py-2 text-sm font-medium text-moss hover:bg-mist disabled:opacity-60"
                >
                  Save
                </button>
              </Form>
            </details>
          )}

          {!isOrganiser && group.status === "forming" && (
            <Form method="post">
              <input type="hidden" name="intent" value="leave" />
              <button className="text-caption text-muted hover:text-ember">
                Leave this trip
              </button>
            </Form>
          )}
        </aside>
      </div>
    </main>
  );
}

/** Landing for someone who followed the invite link but is not on the list. */
function JoinInvite({
  group,
  offering,
  guide,
  actionData,
  busy,
}: {
  group: TripGroup;
  offering: any;
  guide: any;
  actionData: unknown;
  busy: boolean;
}) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <p className="label text-muted">You have been invited</p>
      <h1 className="mt-2 font-display text-4xl text-ink">{group.name}</h1>
      <p className="mt-3 text-body-l text-ink">
        {offering ? (
          <>
            {offering.title} — {offering.days} days with {firstName(offering.guide_name)}
            {group.start_date && `, from ${group.start_date}`}.
          </>
        ) : guide ? (
          <>
            Going with {firstName(guide.full_name)}
            {guide.home_district && ` of ${guide.home_district}`}
            {group.start_date && `, from ${group.start_date}`} — the trek is
            still being decided.
          </>
        ) : (
          "The trek is not decided yet — join and help pick it."
        )}
      </p>
      <p className="mt-3 text-sm text-muted">
        {group.payment_mode === "organiser"
          ? "One person is paying for this trip. You just come."
          : "Everyone pays their own share, split evenly."}
      </p>

      {(actionData as any)?.error && (
        <p className="mt-4 rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      <Form method="post" className="mt-6">
        <input type="hidden" name="intent" value="join" />
        <button
          disabled={busy}
          className="rounded bg-pine px-5 py-3 font-medium text-paper hover:bg-moss disabled:opacity-60"
        >
          {busy ? "Joining…" : "I'm in"}
        </button>
      </Form>
      <p className="mt-3 text-caption text-muted">
        Joining costs nothing and books nothing.
      </p>
    </main>
  );
}

/** The invite link, with a copy button that says it worked. */
function CopyLink({ url }: { url: string }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-mist px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-caption text-muted">{url}</code>
      <button
        ref={ref}
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            const b = ref.current;
            if (!b) return;
            const was = b.textContent;
            b.textContent = "Copied";
            setTimeout(() => {
              if (b) b.textContent = was;
            }, 1600);
          } catch {
            // Clipboard blocked (insecure context, or the user said no). The
            // link is right there to select by hand.
          }
        }}
        className="shrink-0 rounded border border-line bg-paper px-3 py-1.5 text-caption font-medium text-ink hover:border-sage"
      >
        Copy link
      </button>
    </div>
  );
}
