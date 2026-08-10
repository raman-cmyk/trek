import { useState } from "react";
import { Form, Link, data, useFetcher } from "react-router";
import type { Route } from "./+types/insurance";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { evaluatePolicy, altitudeThresholdM, type PolicyAnswers } from "~/lib/insurance";
import { cn } from "~/lib/cn";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return pageMeta({
    title: "Does your travel insurance qualify for Nepal? — free checker",
    description:
      "Since 2026, Nepal requires insurance covering high-altitude trekking and helicopter evacuation before a permit or TIMS card is issued. Check your policy in 30 seconds.",
    canonical: d?.canonical ?? "",
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("bookingId");
  let ctx: { bookingId: string; trekTitle: string; maxAltitudeM: number | null } | null = null;

  if (bookingId) {
    const { user } = await getSessionUser(request, env);
    if (user) {
      const admin = createAdminClient(env);
      const { data: b } = await admin
        .from("bookings")
        .select("id, offering:offerings(title, route:routes(max_altitude_m))")
        .eq("id", bookingId)
        .eq("trekker_id", user.id)
        .maybeSingle();
      if (b) {
        ctx = {
          bookingId: b.id,
          trekTitle: (b as any).offering?.title ?? "your trek",
          maxAltitudeM: (b as any).offering?.route?.max_altitude_m ?? null,
        };
      }
    }
  }
  return { ctx, canonical: absoluteUrl(env.SITE_URL, "/insurance") };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user } = await getSessionUser(request, env);
  if (!user) return data({ error: "Please sign in to save this to your trip." }, { status: 401 });
  const form = await request.formData();
  const bookingId = String(form.get("bookingId"));
  const admin = createAdminClient(env);
  const { data: b } = await admin
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .eq("trekker_id", user.id)
    .maybeSingle();
  if (!b) return data({ error: "Booking not found." }, { status: 404 });

  const meta = {
    altitude: form.get("altitude") === "1",
    helicopter: form.get("helicopter") === "1",
    medical: form.get("medical") === "1",
    repatriation: form.get("repatriation") === "1",
    datesCovered: form.get("datesCovered") === "1",
  };
  await admin
    .from("bookings")
    .update({
      insurance_provider: String(form.get("provider") ?? "").trim() || null,
      insurance_policy_no: String(form.get("policy_no") ?? "").trim() || null,
      insurance_meta: meta,
      insurance_attested_at: new Date().toISOString(),
    })
    .eq("id", b.id);
  return data({ saved: true });
}

const QUESTIONS: { key: keyof PolicyAnswers; q: string; hint: string }[] = [
  { key: "altitude", q: "Covers trekking at high altitude", hint: "Up to your trek's altitude — not just 2,500–3,000m." },
  { key: "helicopter", q: "Covers emergency helicopter evacuation", hint: "Mountain rescue / heli-evac. The one most policies miss." },
  { key: "medical", q: "Covers medical expenses abroad", hint: "Hospital + treatment in Nepal (aim for $100k+)." },
  { key: "repatriation", q: "Covers repatriation", hint: "Getting you home if it comes to that." },
  { key: "datesCovered", q: "Valid for your whole trip", hint: "Every day you're in Nepal." },
];

export default function Insurance({ loaderData }: Route.ComponentProps) {
  const { ctx } = loaderData;
  const fetcher = useFetcher<{ saved?: boolean; error?: string }>();
  const [ans, setAns] = useState<PolicyAnswers>({
    altitude: false,
    helicopter: false,
    medical: false,
    repatriation: false,
    datesCovered: false,
  });
  const v = evaluatePolicy(ans, { maxAltitudeM: ctx?.maxAltitudeM });
  const alt = altitudeThresholdM(ctx?.maxAltitudeM);
  const toggle = (k: keyof PolicyAnswers) => setAns((a) => ({ ...a, [k]: !a[k] }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="label text-moss">Nepal · 2026 rule</p>
      <h1 className="mt-2 font-display text-display-l text-ink">Does your policy qualify?</h1>
      <p className="mt-3 max-w-[68ch] text-body-l text-ink">
        Since 2026, you must show insurance covering <strong>high-altitude trekking</strong> and{" "}
        <strong>emergency helicopter evacuation</strong> before a permit or TIMS card is issued.
        Check yours in 30 seconds{ctx ? ` for ${ctx.trekTitle}` : ""}.
      </p>

      <div className="mt-8 space-y-2">
        {QUESTIONS.map((item) => {
          const on = ans[item.key];
          const req = item.key === "altitude" || item.key === "helicopter";
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => toggle(item.key)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors",
                on ? "border-moss bg-mist" : "border-line bg-card hover:bg-mist/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm",
                  on ? "border-moss bg-moss text-white" : "border-line text-transparent",
                )}
                aria-hidden
              >
                ✓
              </span>
              <span>
                <span className="font-medium text-ink">
                  {item.q}
                  {req && <span className="ml-2 rounded-full bg-chartreuse px-2 py-0.5 text-[11px] font-semibold uppercase text-pine">required</span>}
                </span>
                <span className="mt-0.5 block text-sm text-muted">{item.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Live verdict */}
      <div
        className={cn(
          "mt-8 rounded-lg border p-6",
          v.qualifies ? "border-moss/40 bg-mist" : "border-ember/30 bg-ember/5",
        )}
      >
        {v.qualifies ? (
          <>
            <p className="font-display text-display-m text-ink">Your policy qualifies ✓</p>
            <p className="mt-1 text-ink">
              It covers high-altitude trekking and helicopter evacuation — the two things Nepal
              requires before we can issue your permits and blue TIMS card.
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-display-m text-ink">Not yet — here's the gap</p>
            <ul className="mt-2 space-y-1 text-ink">
              {v.missingRequired.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <span className="text-ember" aria-hidden>✕</span> {m}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">
              Most standard travel policies stop at 2,500–3,000m and exclude heli-rescue. Look for a
              trekking add-on that names your altitude (to <span className="font-mono">{alt.toLocaleString()}m</span>)
              and emergency helicopter evacuation, or ask us for a partner policy that qualifies.
            </p>
          </>
        )}
      </div>

      {/* Save to trip (only in booking context, once qualifying) */}
      {ctx && v.qualifies && (
        <div className="mt-6 rounded-lg border border-line bg-card p-6">
          <h2 className="font-display text-xl text-ink">Save this to your trip</h2>
          <p className="mt-1 text-sm text-muted">
            We'll attach it to {ctx.trekTitle}. Upload the certificate on your trip page; our team
            verifies it before issuing your permits.
          </p>
          {fetcher.data?.saved ? (
            <p className="mt-3 rounded-md bg-mist px-3 py-2 text-sm text-pine">
              Saved ✓ — head to your trip to upload the certificate.
            </p>
          ) : (
            <fetcher.Form method="post" className="mt-4 space-y-3">
              <input type="hidden" name="bookingId" value={ctx.bookingId} />
              {(Object.keys(ans) as (keyof PolicyAnswers)[]).map((k) => (
                <input key={k} type="hidden" name={k} value={ans[k] ? "1" : "0"} />
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="provider" placeholder="Insurer (e.g. World Nomads)" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="policy_no" placeholder="Policy number" className="rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <button className="rounded-md bg-moss px-5 py-2.5 font-medium text-white hover:bg-pine">
                Save to my trip
              </button>
              {fetcher.data?.error && <p className="text-sm text-ember">{fetcher.data.error}</p>}
            </fetcher.Form>
          )}
        </div>
      )}

      {!ctx && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/guides" className="rounded-md bg-moss px-5 py-3 font-medium text-white hover:bg-pine">
            Find your guide
          </Link>
          <Link to="/safety" className="rounded-md border border-line px-5 py-3 font-medium text-ink hover:bg-mist">
            How permits &amp; TIMS work
          </Link>
        </div>
      )}
      <p className="mt-8 text-xs text-muted">
        This checker is guidance, not insurance advice. Always confirm cover with your insurer in
        writing. Requirements reflect Nepal's 2026 rules and can change.
      </p>
    </main>
  );
}
