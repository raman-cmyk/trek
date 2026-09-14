import { Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/g.setup";
import { cn } from "~/lib/cn";
import { copy } from "~/lib/copy";
import { formatUsd } from "~/lib/pricing";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { loadGuideProfile, saveGuideProfile } from "~/lib/guide-profile.server";
import {
  SETUP_STEPS,
  factsFrom,
  isSetupStep,
  setupProgress,
  stepAfter,
  stepBefore,
  stepDone,
  type SetupStepKey,
} from "~/lib/guide-setup";
import { Button } from "~/components/Button";
import {
  GuidePhotos,
  LanguagesEditor,
  PromiseForm,
  RatePayoutForm,
  RegionsForm,
  RoutesEditor,
  StoryForm,
} from "~/components/guide/ProfileSections";

/**
 * Setting up a guide's page, one thing at a time.
 *
 * The long profile page asks for everything at once, which on a phone is a
 * wall. This is the same sections in an order, each on its own screen, with
 * a score at the top that goes up as things get done and a card underneath
 * showing what a trekker will see. "Save and continue" saves, and moves on
 * only once the step is actually done — otherwise the guide stays, with the
 * saved thing on the screen and the rest still to fill in.
 *
 * /g/setup with no step is the overview: every step, what it is worth, and
 * one button for the next thing.
 */

export function meta() {
  return [{ title: copy.setup.title }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const profile = await loadGuideProfile(admin, user.id);
  const facts = factsFrom(profile);
  const progress = setupProgress(facts);
  const step = params.step;
  if (step !== undefined && !isSetupStep(step)) {
    throw redirect("/g/setup", { headers });
  }
  return data(
    {
      ...profile,
      progress,
      step: (step ?? null) as SetupStepKey | null,
      after: step && isSetupStep(step) ? stepAfter(step, facts) : progress.next,
      before: step && isSetupStep(step) ? stepBefore(step) : null,
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const result = await saveGuideProfile(admin, user.id, form);
  if (result.error) return data(result, { status: 400, headers });

  // Move on only when this step is really done; a half-filled step stays on
  // screen with what was just saved, not a page that says "finished".
  const step = params.step;
  if (form.get("then") === "next" && isSetupStep(step)) {
    const facts = factsFrom(await loadGuideProfile(admin, user.id));
    if (stepDone(step, facts)) {
      const next = stepAfter(step, facts);
      throw redirect(next ? `/g/setup/${next}` : "/g/setup", { headers });
    }
  }
  return data(result, { headers });
}

export default function GuideSetup({ loaderData, actionData }: Route.ComponentProps) {
  const d = loaderData as any;
  const { progress, step, after, before, guide } = d;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const said = actionData as { ok?: string; error?: string } | undefined;
  const current = step ? SETUP_STEPS.find((s) => s.key === step)! : null;
  const stepIndex = step ? SETUP_STEPS.findIndex((s) => s.key === step) : -1;
  const done = step ? progress.steps.find((s: any) => s.key === step)!.done : false;

  return (
    <div className="space-y-4">
      {/* ── The score. Same on every screen so a guide always knows how far along they are. */}
      <div className="rounded-card border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-display text-xl text-ink">
            {progress.complete
              ? copy.setup.readyTitle
              : copy.setup.percentReady.replace("{percent}", String(progress.percent))}
          </h1>
          <span className="font-mono text-xs text-muted">
            {progress.earned}/{progress.total}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist">
          <div
            className="h-full rounded-full bg-moss transition-[width] duration-slow ease-out-soft"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <Stepper steps={progress.steps} current={step} />
      </div>

      {said?.ok && (
        <p className="rounded-button bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{said.ok}</p>
      )}
      {said?.error && (
        <p className="rounded-button bg-ember/10 px-3 py-2 text-sm text-ember">{said.error}</p>
      )}

      {!current ? (
        <Overview progress={progress} slug={guide?.slug ?? null} />
      ) : (
        <>
          <div className="px-1">
            <p className="text-xs uppercase tracking-wide text-muted">
              {copy.setup.stepOf
                .replace("{n}", String(stepIndex + 1))
                .replace("{total}", String(SETUP_STEPS.length))}
              {" · "}
              {copy.setup.worth.replace("{points}", String(current.points))}
            </p>
            <h2 className="mt-0.5 font-display text-2xl text-ink">{current.label}</h2>
            <p className="mt-1 text-sm text-ink-soft">{current.hint}</p>
          </div>

          <StepBody step={step} d={d} busy={busy} />

          <Preview d={d} />

          <div className="flex items-center justify-between gap-2">
            {before ? (
              <Link
                to={`/g/setup/${before}`}
                className="rounded-button px-3 py-2 text-sm text-ink-soft hover:bg-mist"
              >
                ← {copy.setup.back}
              </Link>
            ) : (
              <Link to="/g/setup" className="rounded-button px-3 py-2 text-sm text-ink-soft hover:bg-mist">
                ← {copy.setup.allSteps}
              </Link>
            )}
            <Link
              to={after ? `/g/setup/${after}` : "/g/setup"}
              className={cn(
                "rounded-button px-4 py-2 text-sm font-medium",
                done ? "bg-pine text-paper hover:bg-moss" : "text-primary hover:bg-mist",
              )}
            >
              {done ? copy.setup.continue : copy.setup.skip} →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/** The six dots. Scrolls sideways on a narrow phone rather than shrinking. */
function Stepper({
  steps,
  current,
}: {
  steps: Array<{ key: string; short: string; points: number; done: boolean }>;
  current: string | null;
}) {
  return (
    <ol className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1">
      {steps.map((s, i) => {
        const active = s.key === current;
        return (
          <li key={s.key} className="min-w-[4.5rem] flex-1">
            <Link
              to={`/g/setup/${s.key}`}
              prefetch="intent"
              className={cn(
                "flex flex-col items-center gap-1 rounded-button py-1 text-center transition-colors",
                active ? "bg-mist" : "hover:bg-mist/60",
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full border text-[11px] font-medium",
                  s.done
                    ? "border-moss bg-moss text-paper"
                    : active
                      ? "border-pine text-pine"
                      : "border-line text-muted",
                )}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className={cn("text-[11px] leading-tight", active ? "font-medium text-ink" : "text-muted")}>
                {s.short}
              </span>
              <span className="font-mono text-[10px] text-muted">+{s.points}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Overview({
  progress,
  slug,
}: {
  progress: { steps: Array<any>; next: string | null; complete: boolean };
  slug: string | null;
}) {
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {progress.steps.map((s: any, i: number) => (
          <li key={s.key}>
            <Link
              to={`/g/setup/${s.key}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-mist/60"
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs",
                  s.done ? "border-moss bg-moss text-paper" : "border-line text-muted",
                )}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", s.done ? "text-muted line-through" : "text-ink")}>
                  {s.label}
                </span>
                {!s.done && <span className="block text-xs text-muted">{s.hint}</span>}
              </span>
              <span className="font-mono text-xs text-muted">+{s.points}</span>
            </Link>
          </li>
        ))}
      </ul>
      {progress.complete ? (
        <div className="space-y-2 rounded-card border border-moss/30 bg-moss/5 p-4 text-sm">
          <p className="font-medium text-ink">{copy.setup.readyBody}</p>
          {slug && (
            <Link to={`/guides/${slug}`} className="block font-medium text-primary hover:underline">
              {copy.setup.seeYourPage} →
            </Link>
          )}
          <Link to="/g" className="block text-ink-soft hover:underline">
            {copy.setup.backHome} →
          </Link>
        </div>
      ) : (
        <Link
          to={`/g/setup/${progress.next}`}
          className="block rounded-button bg-pine px-4 py-3 text-center text-sm font-medium text-paper hover:bg-moss"
        >
          {copy.setup.start} →
        </Link>
      )}
    </div>
  );
}

function StepBody({ step, d, busy }: { step: SetupStepKey; d: any; busy: boolean }) {
  switch (step) {
    case "photo":
      return <GuidePhotos photos={d.photos} busy={busy} compact />;
    case "words":
      return (
        <>
          <PromiseForm guide={d.guide} busy={busy} then="next" />
          <StoryForm guide={d.guide} busy={busy} then="next" />
        </>
      );
    case "where":
      return (
        <>
          <RegionsForm guide={d.guide} busy={busy} then="next" />
          <RoutesEditor walked={d.walked} routes={d.routes} busy={busy} />
        </>
      );
    case "languages":
      return <LanguagesEditor languages={d.languages} busy={busy} />;
    case "rate":
      return <RatePayoutForm guide={d.guide} busy={busy} then="next" />;
    case "trip":
      return (
        <section className="space-y-3 rounded-card border border-border bg-card p-4">
          <p className="text-sm text-ink">
            {d.offeringCount > 0
              ? copy.setup.tripsListed.replace("{n}", String(d.offeringCount))
              : copy.setup.noTripYet}
          </p>
          <p className="text-sm text-ink-soft">{copy.setup.tripHint}</p>
          <Link
            to="/g/experiences/new?next=/g/setup/trip"
            className="inline-block rounded-button bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
          >
            {d.offeringCount > 0 ? copy.setup.listAnother : copy.setup.listFirst} →
          </Link>
        </section>
      );
  }
}

/**
 * What a trekker sees. The same fields the public card reads, so a guide
 * watches their page take shape as they go rather than filling in boxes
 * and hoping.
 */
function Preview({ d }: { d: any }) {
  const g = d.guide;
  const regions: string[] = g?.regions ?? [];
  return (
    <section className="rounded-card border border-dashed border-border bg-paper p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-muted">{copy.setup.previewLabel}</p>
      <div className="flex items-start gap-3">
        {d.avatarUrl ? (
          <img src={d.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span className="grid h-14 w-14 place-items-center rounded-full bg-mist text-lg font-semibold text-muted">
            {(d.name || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{d.name}</p>
          <p className={cn("text-sm", g?.hook_line ? "text-ink-soft" : "text-muted italic")}>
            {g?.hook_line || copy.setup.previewNoHook}
          </p>
          {g?.only_with_me ? (
            <p className="mt-1.5 text-sm text-ink">“{g.only_with_me}”</p>
          ) : (
            <p className="mt-1.5 text-sm italic text-muted">{copy.setup.previewNoPromise}</p>
          )}
          <p className="mt-1.5 text-xs text-muted">
            {[
              regions.length ? regions.slice(0, 3).join(" · ") : null,
              d.walked.length ? `${d.walked.length} route${d.walked.length === 1 ? "" : "s"} walked` : null,
              d.languages.length
                ? d.languages.map((l: any) => l.language).slice(0, 3).join(", ")
                : null,
              g?.day_rate_usd_cents ? `${formatUsd(g.day_rate_usd_cents)}/day` : null,
            ]
              .filter(Boolean)
              .join(" · ") || copy.setup.previewEmpty}
          </p>
        </div>
      </div>
    </section>
  );
}
