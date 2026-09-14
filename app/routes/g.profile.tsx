import { Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/g.profile";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { loadGuideProfile, saveGuideProfile } from "~/lib/guide-profile.server";
import { setupProgress, factsFrom } from "~/lib/guide-setup";
import {
  AskTeam,
  BasicsForm,
  CannedAnswers,
  GuidePhotos,
  GuideVoice,
  HeldByTeam,
  LanguagesEditor,
  PromiseForm,
  RatePayoutForm,
  RegionsForm,
  RoutesEditor,
  StoryForm,
} from "~/components/guide/ProfileSections";

/**
 * The whole profile on one long page, for a guide who knows what they want
 * to change. A new guide is walked through the same sections one at a time
 * at /g/setup; both post to the same save code.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const profile = await loadGuideProfile(admin, user.id);
  const progress = setupProgress(factsFrom(profile));
  return data({ ...profile, progress }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const result = await saveGuideProfile(admin, user.id, await request.formData());
  return data(result, { status: result.error ? 400 : 200, headers });
}

export default function GuideProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { guide, languages, photos, canned, walked, routes, progress } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl text-ink">Your profile</h1>
        {guide?.slug && (
          <Link
            to={`/guides/${guide.slug}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            See your page →
          </Link>
        )}
      </div>

      {!progress.complete && (
        <Link
          to={`/g/setup/${progress.next}`}
          className="block rounded-card border border-moss/30 bg-moss/5 px-4 py-3 text-sm text-ink hover:bg-moss/10"
        >
          <span className="font-medium">Your page is {progress.percent}% ready.</span>{" "}
          <span className="text-ink-soft">Finish it step by step →</span>
        </Link>
      )}

      {actionData && "ok" in actionData && actionData.ok && (
        <p className="rounded-button bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {actionData.ok}
        </p>
      )}
      {actionData && "error" in actionData && actionData.error && (
        <p className="rounded-button bg-ember/10 px-3 py-2 text-sm text-ember">
          {actionData.error}
        </p>
      )}

      <PromiseForm guide={guide} busy={busy} />
      <GuidePhotos photos={photos} busy={busy} />
      <StoryForm guide={guide} busy={busy} />
      <GuideVoice url={guide?.voice_intro_url ?? null} busy={busy} />
      <LanguagesEditor languages={languages} busy={busy} />
      <RegionsForm guide={guide} busy={busy} />
      <RoutesEditor walked={walked} routes={routes} busy={busy} />
      <BasicsForm guide={guide} busy={busy} />
      <HeldByTeam guide={guide} />
      <CannedAnswers canned={canned} />
      <RatePayoutForm guide={guide} busy={busy} />
      <AskTeam busy={busy} />
    </div>
  );
}
