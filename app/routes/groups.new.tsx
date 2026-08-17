import { useState } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/groups.new";
import { pageMeta } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { createGroup } from "~/lib/groups.server";
import { useMoney } from "~/lib/currency-context";
import { fromPerPersonUsdCents, type PriceBreakdown , hasBreakdown } from "~/lib/experience-pricing";
import { firstName } from "~/lib/names";

export function meta() {
  return pageMeta({
    title: "Start a trip together",
    description: "Plan a trek with other people and split the cost.",
    canonical: "",
    noindex: true,
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  const url = new URL(request.url);
  if (!user) {
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, { headers });
  }
  const client = createPublicClient(env);
  const [{ data: offerings }, { data: guides }] = await Promise.all([
    client
      .from("public_offerings")
      .select(
        "id, slug, kind, title, days, price_usd_cents, price_breakdown, max_party, guide_id, guide_name, route_name",
      )
      .order("title"),
    client
      .from("public_guides")
      .select("user_id, slug, full_name, home_district, day_rate_usd_cents")
      .order("full_name"),
  ]);

  const profile = await getProfile(env, user.id);
  return {
    offerings: offerings ?? [],
    guides: guides ?? [],
    preselect: url.searchParams.get("offering") ?? "",
    preselectGuide: url.searchParams.get("guide") ?? "",
    suggestedName: profile?.full_name ? `${profile.full_name.split(" ")[0]}'s trip` : "Our trip",
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) return redirect("/login?next=/groups/new", { headers });

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) {
    return data({ error: "Give the trip a name your friends will recognise." }, { status: 400, headers });
  }
  const partyTarget = Math.min(24, Math.max(1, Number(form.get("party_target")) || 2));
  const paymentMode = form.get("payment_mode") === "organiser" ? "organiser" : "split";
  const offeringId = String(form.get("offering_id") ?? "") || null;
  const startDate = String(form.get("start_date") ?? "") || null;

  // The date has to be ahead of us. A group formed around a date in the past
  // produces a booking nobody can take.
  if (startDate && startDate < new Date().toISOString().slice(0, 10)) {
    return data({ error: "Pick a date in the future." }, { status: 400, headers });
  }

  const admin = createAdminClient(env);
  // You can start from either end: pick a trek (which carries its guide), or
  // pick the person and work out the trek later. The trek wins when both are
  // given, because an offering belongs to exactly one guide and a mismatch
  // would put a stranger's name on the page.
  let guideId: string | null = String(form.get("guide_id") ?? "") || null;
  if (offeringId) {
    const { data: o } = await admin
      .from("offerings")
      .select("guide_id")
      .eq("id", offeringId)
      .maybeSingle();
    guideId = o?.guide_id ?? null;
  } else if (guideId) {
    const { data: g } = await admin
      .from("guides")
      .select("user_id")
      .eq("user_id", guideId)
      .eq("status", "verified")
      .maybeSingle();
    if (!g) {
      return data({ error: "That guide isn't available." }, { status: 400, headers });
    }
  }

  const profile = await getProfile(env, user.id);
  try {
    const group = await createGroup(admin, {
      organiserId: user.id,
      organiserName: firstName(profile?.full_name) || "The organiser",
      name,
      offeringId,
      guideId,
      startDate,
      partyTarget,
      paymentMode,
    });
    return redirect(`/groups/${group.slug}`, { headers });
  } catch (e) {
    return data({ error: (e as Error).message }, { status: 400, headers });
  }
}

export default function NewGroup({ loaderData, actionData }: Route.ComponentProps) {
  const { offerings, guides, preselect, preselectGuide, suggestedName } = loaderData as any;
  const { mr } = useMoney();
  const nav = useNavigation();
  // Which end you are starting from. Picking a trek fixes the guide (an
  // offering belongs to one person), so the two are alternatives, not a pair
  // of independent dropdowns that can contradict each other.
  const [start, setStart] = useState<"trek" | "guide" | "later">(
    preselect ? "trek" : preselectGuide ? "guide" : "later",
  );
  const [guideId, setGuideId] = useState<string>(preselectGuide);
  const guideTreks = guideId
    ? offerings.filter((o: any) => o.guide_id === guideId)
    : offerings;
  const field =
    "mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/groups" className="text-sm text-moss hover:underline">
        ← Your trips
      </Link>
      <h1 className="mt-2 font-display text-4xl text-ink">Start a trip together</h1>
      <p className="mt-3 max-w-[56ch] text-body-l text-ink">
        Make the trip, send the link to whoever is coming. Everyone sees the same
        dates and the same guide, and nobody has to chase anybody over WhatsApp.
      </p>

      {(actionData as any)?.error && (
        <p className="mt-5 rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      <Form method="post" className="mt-7 space-y-5">
        <label className="block text-sm text-ink-soft">
          What to call it
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={suggestedName}
            className={field}
          />
        </label>

        {/* Start from either end. Some people know the walk and want to see
            who runs it; some have already found their guide and will take
            whatever he recommends. Both are how this actually happens. */}
        <fieldset>
          <legend className="text-sm text-ink-soft">Where you are starting from</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["trek", "I know the trek"],
                ["guide", "I know the guide"],
                ["later", "Neither yet"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStart(value)}
                aria-pressed={start === value}
                className={
                  "rounded-pill px-3.5 py-1.5 text-sm transition-colors " +
                  (start === value
                    ? "bg-pine text-paper"
                    : "border border-line bg-card text-ink hover:border-sage")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {start === "guide" && (
          <label className="block text-sm text-ink-soft">
            Which guide
            <select
              name="guide_id"
              value={guideId}
              onChange={(e) => setGuideId(e.target.value)}
              className={field}
              required
            >
              <option value="">— pick a guide —</option>
              {guides.map((g: any) => (
                <option key={g.user_id} value={g.user_id}>
                  {firstName(g.full_name)}
                  {g.home_district ? ` · ${g.home_district}` : ""}
                  {g.day_rate_usd_cents ? ` · ${mr(g.day_rate_usd_cents)}/day` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {start !== "later" && (
          <label className="block text-sm text-ink-soft">
            {start === "guide"
              ? "One of their trips — or leave it and decide together"
              : "Which trek"}
            <select name="offering_id" defaultValue={preselect} className={field} key={guideId}>
              <option value="">— not decided yet —</option>
              {(start === "guide" ? guideTreks : offerings).map((o: any) => {
                const from = hasBreakdown(o.price_breakdown)
                  ? fromPerPersonUsdCents(o.price_breakdown as PriceBreakdown, o.max_party ?? undefined)
                  : o.price_usd_cents;
                return (
                  <option key={o.id} value={o.id}>
                    {o.title} · {o.days} days · with {o.guide_name}
                    {from ? ` · from ${mr(from)} pp` : ""}
                  </option>
                );
              })}
            </select>
            {start === "guide" && guideId && guideTreks.length === 0 && (
              <span className="mt-1 block text-caption text-muted">
                They have no packaged trips listed — start the group and ask
                them what they would run.
              </span>
            )}
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-ink-soft">
            Roughly when
            <input type="date" name="start_date" className={field} />
          </label>
          <label className="block text-sm text-ink-soft">
            How many of you
            <input
              type="number"
              name="party_target"
              min={1}
              max={24}
              defaultValue={2}
              className={field}
            />
          </label>
        </div>

        {/* The whole reason a group exists. Two radio cards, not a dropdown:
            this is the decision people argue about, so it gets room. */}
        <fieldset>
          <legend className="text-sm text-ink-soft">Who pays</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <PayOption
              value="split"
              defaultChecked
              title="Everyone pays their share"
              body="The trip is split evenly. Each person pays their own part, and the page shows who is still to pay."
            />
            <PayOption
              value="organiser"
              title="One person pays"
              body="You pay for the whole trip. The others just turn up. Settle up between yourselves however you like."
            />
          </div>
        </fieldset>

        <button
          disabled={nav.state !== "idle"}
          className="rounded bg-pine px-5 py-3 font-medium text-paper hover:bg-moss disabled:opacity-60"
        >
          {nav.state !== "idle" ? "Making it…" : "Make the trip"}
        </button>
        <p className="text-caption text-muted">
          Nothing is booked yet and no money moves. You can change the trek, the
          date and who pays until everyone is in.
        </p>
      </Form>
    </main>
  );
}

function PayOption({
  value,
  title,
  body,
  defaultChecked,
}: {
  value: string;
  title: string;
  body: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="group relative block cursor-pointer rounded-md border border-line bg-card p-4 transition-colors has-[:checked]:border-moss has-[:checked]:bg-mist hover:border-sage">
      <input
        type="radio"
        name="payment_mode"
        value={value}
        defaultChecked={defaultChecked}
        className="absolute right-3 top-3 accent-moss"
      />
      <p className="pr-6 font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </label>
  );
}
