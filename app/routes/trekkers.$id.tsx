import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/trekkers.$id";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser, getProfile } from "~/lib/auth.server";
import { SmartImage } from "~/components/SmartImage";
import { Button } from "~/components/Button";
import { fmtDate } from "~/lib/format";
import { firstName } from "~/lib/names";
import { loadTrekkerProfile, mayReadTrekker } from "~/lib/trekker-profile.server";
import {
  EXPERIENCE_LABELS,
  EXPERIENCE_ORDER,
  TREKKER_SUB_RATINGS,
  profileIsEmpty,
  rateTrekker,
  trekkerSummary,
  type TrekExperience,
} from "~/lib/trekker-profile";

export function meta() {
  // Never indexed. This page names a person, the countries they came from and
  // the dates they were in the mountains.
  return [{ title: "Trekker" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) {
    throw redirect(`/login?next=/trekkers/${params.id}`, { headers });
  }
  const profile = await getProfile(env, user.id);
  const admin = createAdminClient(env);

  const allowed = await mayReadTrekker(admin, user.id, profile?.role ?? null, params.id);
  // 404 rather than 403: a "you may not see this" tells a stranger the person
  // exists, which is the thing the rule is protecting.
  if (!allowed) throw new Response("Not found", { status: 404 });

  const loaded = await loadTrekkerProfile(admin, params.id);
  if (!loaded) throw new Response("Not found", { status: 404 });

  return data(
    {
      ...loaded,
      isSelf: user.id === params.id,
      isGuide: profile?.role === "guide",
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user || user.id !== params.id) {
    return data({ error: "Not yours to edit." }, { status: 403, headers });
  }
  const admin = createAdminClient(env);
  const form = await request.formData();
  const experience = String(form.get("trek_experience") ?? "");
  await admin
    .from("users")
    .update({
      about_me: String(form.get("about_me") ?? "").trim().slice(0, 1200) || null,
      trek_experience: EXPERIENCE_ORDER.includes(experience as TrekExperience)
        ? experience
        : null,
    })
    .eq("id", user.id);
  return data({ ok: true }, { headers });
}

export default function TrekkerProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { person, treks, reviews, isSelf, isGuide } = loaderData as any;
  const nav = useNavigation();
  const rating = rateTrekker(reviews);
  const summary = trekkerSummary(treks);
  const published = reviews.filter((r: any) => r.published_at);
  const waiting = reviews.filter((r: any) => !r.published_at);
  const empty = profileIsEmpty(treks, rating, person);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex items-start gap-4">
        <SmartImage
          src={person.avatar_url ?? ""}
          alt={person.full_name}
          width={72}
          height={72}
          className="h-16 w-16 shrink-0 rounded-full"
        />
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-ink">
            {isSelf ? person.full_name : firstName(person.full_name)}
          </h1>
          <p className="text-sm text-ink-soft">
            {person.country_code ? `${person.country_code} · ` : ""}
            With us since {fmtDate(person.created_at)}
          </p>
          {person.trek_experience && (
            <p className="mt-1 text-sm text-ink">
              {EXPERIENCE_LABELS[person.trek_experience as TrekExperience]}
            </p>
          )}
        </div>
      </header>

      {isSelf && (
        <p className="mt-4 rounded-card bg-surface p-3 text-sm text-ink-soft">
          This is what a guide sees when you ask them to take you. It is never
          public — only a guide you have asked, and our office.
        </p>
      )}

      {/* What the guides who took them said. Written after every completed
          trek since the beginning and read by nothing until now. */}
      <section className="mt-6">
        <h2 className="font-display text-xl text-ink">
          {isSelf ? "What your guides said" : "What other guides said"}
        </h2>
        {rating.count > 0 ? (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-2xl text-ink">{rating.average?.toFixed(1)}</span>
              <span className="text-sm text-ink-soft">
                from {rating.count} {rating.count === 1 ? "guide" : "guides"}
              </span>
            </div>
            <dl className="mt-3 space-y-1.5">
              {TREKKER_SUB_RATINGS.filter((s) => rating.subAverages[s.key] !== undefined).map(
                (s) => (
                  <div key={s.key} className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0 text-sm text-ink">
                      {s.label}
                      <span className="block text-xs text-ink-soft">{s.blurb}</span>
                    </dt>
                    <dd className="shrink-0 font-mono text-sm text-ink">
                      {rating.subAverages[s.key].toFixed(1)}
                    </dd>
                  </div>
                ),
              )}
            </dl>

            {published.some((r: any) => r.body) && (
              <ul className="mt-4 space-y-3">
                {published
                  .filter((r: any) => r.body)
                  .map((r: any) => (
                    <li key={r.id} className="rounded-card border border-border bg-card p-4">
                      <p className="text-sm text-ink">“{r.body}”</p>
                      <p className="mt-1.5 text-xs text-ink-soft">
                        {r.author_slug ? (
                          <Link to={`/guides/${r.author_slug}`} className="text-primary hover:underline">
                            {firstName(r.author_name)}
                          </Link>
                        ) : (
                          firstName(r.author_name) || "A guide"
                        )}
                        {r.trip_title ? ` · ${r.trip_title}` : ""}
                        {r.trip_date ? ` · ${fmtDate(r.trip_date)}` : ""}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {isSelf
              ? "Nothing yet. Guides write these after a trek, and they appear once you have written yours or two weeks have passed — the same rule that applies to your reviews of them."
              : "Nobody has rated them yet."}
          </p>
        )}
        {isSelf && waiting.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            {waiting.length} more {waiting.length === 1 ? "is" : "are"} written and sealed
            until both sides have had their say.
          </p>
        )}
      </section>

      {/* Where they have been. */}
      <section className="mt-6">
        <h2 className="font-display text-xl text-ink">
          {summary.treks > 0
            ? `${summary.treks} ${summary.treks === 1 ? "trek" : "treks"}, ${summary.days} days on the trail`
            : "Treks with us"}
        </h2>
        {treks.length > 0 ? (
          <>
            {summary.regions.length > 0 && (
              <p className="mt-1 text-sm text-ink-soft">{summary.regions.join(" · ")}</p>
            )}
            <ul className="mt-3 space-y-2">
              {treks.map((t: any) => (
                <li
                  key={t.bookingId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-card border border-border bg-card p-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{t.title}</span>
                    <span className="block text-xs text-ink-soft">
                      {t.guideSlug ? (
                        <>
                          with{" "}
                          <Link to={`/guides/${t.guideSlug}`} className="text-primary hover:underline">
                            {firstName(t.guideName)}
                          </Link>
                        </>
                      ) : (
                        `with ${firstName(t.guideName) || "a guide"}`
                      )}
                      {t.partySize > 1 ? ` · ${t.partySize} of them` : " · solo"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-ink-soft">
                    {fmtDate(t.startDate)} · {t.days}d
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {isSelf
              ? "Your first trek with us has not happened yet."
              : "This would be their first trek with us."}
          </p>
        )}
      </section>

      {/* Their own words. */}
      {(person.about_me || isSelf) && (
        <section className="mt-6">
          <h2 className="font-display text-xl text-ink">
            {isSelf ? "What guides should know about you" : "In their words"}
          </h2>
          {isSelf ? (
            <Form method="post" className="mt-2 space-y-3 rounded-card border border-border bg-card p-4">
              <label className="block">
                <span className="text-sm text-ink">How much trekking have you done?</span>
                <select
                  name="trek_experience"
                  defaultValue={person.trek_experience ?? ""}
                  className="mt-1 w-full rounded-button border border-border bg-card px-3 py-2 text-base text-ink outline-none focus:border-primary"
                >
                  <option value="">—</option>
                  {EXPERIENCE_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {EXPERIENCE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-ink">Anything a guide should know</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Your pace, a knee that complains, what you eat, why you are
                  coming. A guide reads this deciding whether they are the right
                  person for your trek — it is the same thing you read on their
                  page.
                </span>
                <textarea
                  name="about_me"
                  rows={5}
                  maxLength={1200}
                  defaultValue={person.about_me ?? ""}
                  className="mt-1 w-full rounded-button border border-border bg-card px-3 py-2 text-base text-ink outline-none focus:border-primary"
                />
              </label>
              <Button type="submit" size="sm" loading={nav.state !== "idle"}>
                Save
              </Button>
              {actionData && "ok" in (actionData as any) && (
                <span className="ml-3 text-sm text-accent">Saved</span>
              )}
            </Form>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {person.about_me}
            </p>
          )}
        </section>
      )}

      {isGuide && empty && (
        <p className="mt-6 rounded-card bg-surface p-3 text-sm text-ink-soft">
          Nothing here yet — this is their first trip with us, and they have not
          written anything about themselves. Ask them in the messages; most
          people answer at length.
        </p>
      )}
    </main>
  );
}
