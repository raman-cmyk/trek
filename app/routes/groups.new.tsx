import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/groups.new";
import { pageMeta } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { createGroup } from "~/lib/groups.server";
import { useMoney } from "~/lib/currency-context";
import { fromPerPersonUsdCents, type PriceBreakdown } from "~/lib/experience-pricing";

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
  const { data: offerings } = await client
    .from("public_offerings")
    .select(
      "id, slug, kind, title, days, price_usd_cents, price_breakdown, max_party, guide_id, guide_name, route_name",
    )
    .order("title");

  const profile = await getProfile(env, user.id);
  return {
    offerings: offerings ?? [],
    preselect: url.searchParams.get("offering") ?? "",
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
  let guideId: string | null = null;
  if (offeringId) {
    const { data: o } = await admin
      .from("offerings")
      .select("guide_id")
      .eq("id", offeringId)
      .maybeSingle();
    guideId = o?.guide_id ?? null;
  }

  const profile = await getProfile(env, user.id);
  try {
    const group = await createGroup(admin, {
      organiserId: user.id,
      organiserName: profile?.full_name ?? "The organiser",
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
  const { offerings, preselect, suggestedName } = loaderData as any;
  const { mr } = useMoney();
  const nav = useNavigation();
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

        <label className="block text-sm text-ink-soft">
          Which trek — you can decide this later
          <select name="offering_id" defaultValue={preselect} className={field}>
            <option value="">— not decided yet —</option>
            {offerings.map((o: any) => {
              const from = o.price_breakdown?.guide_fee_total_usd_cents
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
        </label>

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
