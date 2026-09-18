import { useCallback, useEffect, useRef, useState } from "react";
import { useReveal } from "~/components/PasswordField";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/apply";
import { GuideLanguages } from "~/components/GuideLanguages";
import { GuideRegions } from "~/components/GuideRegions";
import { PENDING_CHECKS } from "~/lib/guide-checks";
import { parseLanguages, type LanguageRow } from "~/lib/guide-languages";
import { parseRegions } from "~/lib/guide-regions";
import { parseRoutesWalked } from "~/lib/guide-routes";
import { RoutesWalked } from "~/components/RoutesWalked";
import { HEARD_OPTIONS, cleanDetail, heardProblem } from "~/lib/heard-about";
import { EmergencyFields } from "~/components/EmergencyFields";
import { emergencyPatch, parseEmergency } from "~/lib/emergency";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { earningsFor, formatNpr, rateRange, usdCentsFromNpr } from "~/lib/guide-earnings";
import { pickLang, problemText, t, tf, LANGS, type Lang } from "~/lib/apply-copy";
import { NUMBERED, resumeAt, stepAt, validateStep } from "~/lib/apply-flow";
import { licenceExpiryProblem } from "~/lib/bikram";
import { TrailProgress } from "~/components/apply/TrailProgress";
import { LiveGuideCard } from "~/components/apply/LiveGuideCard";
import { SidePanel, LockMark } from "~/components/apply/SidePanel";
import { BsAdDate } from "~/components/apply/BsAdDate";
import { DistrictPicker } from "~/components/apply/DistrictPicker";
import { DocUpload } from "~/components/apply/DocUpload";
import { SmartImage } from "~/components/SmartImage";
import { cn } from "~/lib/cn";
import { LATE_CANCEL_DAYS, LATE_CANCEL_GUIDE_SHARE, OFFICE, PAYOUT_DAYS, WHATSAPP } from "~/lib/office";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return pageMeta({
    title: "Become a guide on Guides of Nepal",
    description:
      "Apply to lead treks and experiences on Guides of Nepal. Verified guides set their own rate and keep their whole fee — our 10% is added on top and paid by the trekker.",
    canonical: d?.canonical ?? "",
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const admin = createAdminClient(env);
  // The trails they can claim. Live routes only: a pending one is somebody
  // else's proposal and not yet a thing to have walked thirty times.
  const [{ data: routes }, { data: peers }, { data: offers }] = await Promise.all([
    admin.from("routes").select("id, name, region").eq("status", "live").order("name"),
    // Real guides, for the intro quote and the closing face row. An applicant
    // asking "is there a real person behind this" is answered by people, not
    // by a paragraph — and every one of these is somebody they may know.
    admin
      .from("public_guides")
      .select("slug, full_name, avatar_url, home_district, only_with_me, years_experience, day_rate_usd_cents")
      .order("user_id"),
    // A real trek to price the earnings preview against. Ordering by length
    // gave 21-day Kanchenjunga, which is the longest route and one nobody
    // sells — seventeen of the twenty-four have no guide on them. The preview
    // has to quote a trek an applicant will actually be booked for, so it is
    // whichever route the most guides already lead.
    admin.from("public_offerings").select("route_id, days"),
  ]);

  const roster = (peers ?? []) as Array<{
    slug: string;
    full_name: string;
    avatar_url: string | null;
    home_district: string | null;
    only_with_me: string | null;
    years_experience: number | null;
    day_rate_usd_cents: number | null;
  }>;

  // One guide's own words for the intro. Whoever has said something and has
  // a face — not a testimonial we wrote.
  const voice =
    roster.find((g) => g.only_with_me && g.avatar_url && g.years_experience) ??
    roster.find((g) => g.only_with_me && g.avatar_url) ??
    null;

  return {
    canonical: absoluteUrl(env.SITE_URL, "/apply"),
    routes: routes ?? [],
    // What guides here actually charge, so the hint is a fact and not a guess.
    rateRange: rateRange(roster.map((g) => g.day_rate_usd_cents)),
    sampleTrek: (() => {
      const byRoute = new Map<string, { n: number; days: number }>();
      for (const o of (offers ?? []) as Array<{ route_id: string | null; days: number | null }>) {
        if (!o.route_id || !o.days) continue;
        const seen = byRoute.get(o.route_id) ?? { n: 0, days: o.days };
        byRoute.set(o.route_id, { n: seen.n + 1, days: seen.days });
      }
      let best: { id: string; n: number; days: number } | null = null;
      for (const [id, v] of byRoute) if (!best || v.n > best.n) best = { id, ...v };
      const route = best ? (routes ?? []).find((r: any) => r.id === best!.id) : null;
      return route && best ? { name: (route as any).name as string, days: best.days } : null;
    })(),
    voice: voice
      ? {
          name: voice.full_name,
          district: voice.home_district,
          years: voice.years_experience,
          quote: voice.only_with_me,
          avatar: voice.avatar_url,
        }
      : null,
    faces: roster
      .filter((g) => g.avatar_url)
      .slice(0, 12)
      .map((g) => ({ slug: g.slug, name: g.full_name, district: g.home_district, avatar: g.avatar_url })),
    // Nepali if the browser asks for it; the toggle overrides either way.
    lang: pickLang(null, request.headers.get("accept-language")),
    guideCount: roster.length,
  };
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "guide"
  );
}

// Held below the bucket's own 10MB so a guide learns about it here, in a
// sentence they can act on, rather than from a storage error after the account
// already exists.
const MAX_DOC_BYTES = 8 * 1024 * 1024;
const DOC_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const DOC_ACCEPT = DOC_MIME.join(",");

/** Present, small enough, and a kind we can store. Checked before anything is created. */
function checkFile(v: FormDataEntryValue | null, what: string): { file?: File; error?: string } {
  if (!(v instanceof File) || v.size === 0) {
    return { error: `Add a photo of your ${what}.` };
  }
  if (v.size > MAX_DOC_BYTES) {
    return { error: `That ${what} photo is over 8MB. Take it again at a smaller size.` };
  }
  if (!DOC_MIME.includes(v.type)) {
    return { error: `The ${what} has to be a photo or a PDF.` };
  }
  return { file: v };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const str = (k: string) => String(form.get(k) ?? "").trim();

  const fullName = str("full_name");
  const phone = str("phone");
  const email = str("email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const district = str("home_district");
  const licenceNo = str("licence_no");
  const licenceExpiry = str("licence_expiry") || null;
  const years = Number(form.get("years_experience") ?? 0) || null;
  const dayRateUsd = Number(form.get("day_rate_usd") ?? 0);
  const hook = str("hook_line") || null;
  // Our own guide's next of kin. Asked at application because the day we need
  // it is never a day anybody is filling in forms.
  const emergency = parseEmergency(form);

  // ---- everything is checked before anything is created -------------------
  // A rejected application must not leave an auth user behind, and a guide who
  // picked a 40MB photograph should be told, not half-registered.
  if (!fullName || !phone) {
    return data({ error: "Name and phone are required." }, { status: 400 });
  }
  if (!/.+@.+\..+/.test(email)) {
    return data({ error: "Enter an email you can sign in with." }, { status: 400 });
  }
  if (password.length < 8) {
    return data({ error: "Choose a password of at least 8 characters." }, { status: 400 });
  }
  if (!licenceNo) {
    return data({ error: "Your trekking licence number is needed — it is the first thing we check." }, { status: 400 });
  }
  if (!licenceExpiry) {
    return data({ error: "Add the date your licence expires. It is printed on the card." }, { status: 400 });
  }
  if (!district) {
    return data({ error: "Tell us the district you are from." }, { status: 400 });
  }
  if (!emergency.ok) {
    return data({ error: emergency.error }, { status: 400 });
  }

  const licenceShot = checkFile(form.get("licence_photo"), "licence");
  if (licenceShot.error) return data({ error: licenceShot.error }, { status: 400 });
  const idShot = checkFile(form.get("id_photo"), "NID or citizenship");
  if (idShot.error) return data({ error: idShot.error }, { status: 400 });

  const admin = createAdminClient(env);

  // Abuse guards on an unauthenticated endpoint that creates auth users:
  // a honeypot field (hidden from humans; bots fill it) and a crude global
  // throttle on recent applications.
  if (String(form.get("website") ?? "") !== "") {
    // Pretend success — don't teach the bot.
    return data({ ok: true, name: fullName });
  }
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count: recent } = await admin
    .from("guides")
    .select("user_id", { count: "exact", head: true })
    .eq("status", "applied")
    .gte("created_at", tenMinAgo);
  if ((recent ?? 0) >= 5) {
    return data(
      { error: "We're getting a lot of applications right now — try again in a few minutes." },
      { status: 429 },
    );
  }

  // Languages arrive as JSON from the picker. The parser drops anything it
  // does not recognise rather than let a bad row fail an insert halfway
  // through an application.
  const languages = parseLanguages(form.get("languages"));
  // Checkbox group, so getAll: anything we do not recognise is dropped.
  const regions = parseRegions(form.getAll("regions"));
  // Which trails, and how many times each. The claim is theirs until the
  // office checks it (0049) — the point is that the office can see it while
  // deciding whether to verify them at all.
  const walked = parseRoutesWalked(form.get("routes_walked"));

  // One question, required, because a field half the applicants skip tells
  // nobody anything. Checked on the server as well as in the browser: the
  // `required` attribute is a courtesy, not a rule.
  const heardAbout = String(form.get("heard_about") ?? "");
  const heardProblemText = heardProblem(heardAbout);
  if (heardProblemText) return data({ error: heardProblemText }, { status: 400 });
  const heardDetail = cleanDetail(form.get("heard_about_detail"));

  // 1) Auth user with a credential the guide can actually sign in with
  // (email + password, same as trekkers). Phone is stored for SMS notices.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    phone,
    email_confirm: true,
    phone_confirm: false,
    user_metadata: { full_name: fullName, applied_as: "guide" },
  });
  if (authErr || !created.user) {
    const msg = /already|registered/i.test(authErr?.message ?? "")
      ? "An account with that email or phone already exists."
      : "Couldn’t start your application. Check your details.";
    return data({ error: msg }, { status: 400 });
  }
  const userId = created.user.id;

  // 2) Profile + guide (applied) + languages + checklist.
  await admin.from("users").insert({
    id: userId,
    role: "guide",
    full_name: fullName,
    email,
    phone,
    ...emergencyPatch(emergency.value),
  });

  const slug = `${slugify(fullName)}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const { error: guideErr } = await admin.from("guides").insert({
    user_id: userId,
    slug,
    status: "applied",
    tier: 0,
    licence_no: licenceNo,
    licence_expiry: licenceExpiry,
    home_district: district,
    regions,
    years_experience: years,
    day_rate_usd_cents: Math.round(dayRateUsd * 100) || null,
    hook_line: hook,
    heard_about: heardAbout,
    heard_about_detail: heardDetail,
  });
  if (guideErr) {
    // Roll back the auth user so the phone can retry.
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return data({ error: "Couldn’t save your application. Please retry." }, { status: 400 });
  }

  if (languages.length) {
    await admin.from("guide_languages").insert(
      languages.map((l) => ({
        guide_id: userId,
        language: l.language,
        proficiency: l.proficiency,
      })),
    );
  }
  if (walked.length) {
    // Only routes that exist and are live — a crafted post cannot invent one.
    const { data: real } = await admin
      .from("routes")
      .select("id")
      .eq("status", "live")
      .in("id", walked.map((w) => w.routeId));
    const live = new Set((real ?? []).map((r) => r.id));
    const rows = walked
      .filter((w) => live.has(w.routeId))
      .map((w) => ({ guide_id: userId, route_id: w.routeId, times_walked: w.times }));
    if (rows.length) {
      // Best-effort: an application must not fail over a route claim.
      await admin.from("guide_route_experience").insert(rows).then(
        () => {},
        () => {},
      );
    }
  }

  const { data: checks } = await admin
    .from("guide_verifications")
    .insert(
      PENDING_CHECKS.map((check_type) => ({
        guide_id: userId,
        check_type,
        status: "pending",
      })),
    )
    .select("id, check_type");

  // 3) The two documents, filed against the checks they prove. This is a
  // service-role write after a validated account exists — the form itself
  // never touches storage.
  const checkId = (t: string) =>
    (checks ?? []).find((c: any) => c.check_type === t)?.id ?? null;
  const { uploadGuideDocument } = await import("~/lib/documents.server");
  await uploadGuideDocument(admin, {
    guideId: userId,
    kind: "licence",
    file: licenceShot.file!,
    label: "Sent with the application",
    verificationId: checkId("licence"),
    expiresOn: licenceExpiry,
    uploadedBy: userId,
  });
  await uploadGuideDocument(admin, {
    guideId: userId,
    kind: "id_card",
    file: idShot.file!,
    label: "NID or citizenship, sent with the application",
    verificationId: checkId("id_match"),
    uploadedBy: userId,
  });

  const { notifyGuideWelcome } = await import("~/lib/notifications.server");
  await notifyGuideWelcome(env, { name: fullName, email, phone });

  return data({ ok: true, name: fullName });
}

export default function Apply({ loaderData, actionData }: Route.ComponentProps) {
  const {
    routes,
    rateRange: range,
    sampleTrek,
    voice,
    faces,
    lang: browserLang,
    guideCount,
  } = loaderData as any;

  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);
  const KEY = "guide-application";

  const [lang, setLang] = useState<Lang>(browserLang ?? "en");
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<LanguageRow[]>([
    { language: "Nepali", proficiency: "native" },
  ]);
  // Problems are held back until Next is pressed. Shouting at somebody about
  // a field they have not reached yet is how a form feels hostile.
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sheet, setSheet] = useState(false);
  // The last read of the whole form, including fields this component does not
  // control. Kept in state so validation messages can render from it.
  const [formSnapshot, setFormSnapshot] = useState<Record<string, string>>({});

  const set = useCallback((k: string, v: string) => {
    setValues((old) => (old[k] === v ? old : { ...old, [k]: v }));
  }, []);

  /**
   * Everything the form is holding, not just what this component controls.
   *
   * Several fields belong to components that write straight to the DOM —
   * EmergencyFields, GuideRegions, RoutesWalked, the language picker's hidden
   * input. They were invisible to both the validator and the draft: Next from
   * step four refused forever because `values` had no emergency contact in
   * it, and a guide who filled in their regions and came back found them
   * gone. Reading the form itself is the only version that cannot drift.
   */
  const readForm = useCallback((): Record<string, string> => {
    const el = formRef.current;
    if (!el) return values;
    const out: Record<string, string> = { ...values };
    for (const [k, v] of new FormData(el).entries()) {
      // A File stringifies to "[object File]", which would poison the draft
      // and, on restore, be written into a text field as that literal.
      if (v instanceof File) continue;
      if (k === "password") continue;
      out[k] = String(v);
    }
    return out;
  }, [values]);

  // ── draft: restore, then save on every change ────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, any>;
      const vals: Record<string, string> = {};
      for (const [k, v] of Object.entries(d)) {
        if (k === "languages" || k === "__step" || k === "__lang") continue;
        vals[k] = String(v);
      }
      setValues(vals);
      const drafted = parseLanguages(JSON.stringify(d.languages ?? []));
      if (drafted.length) setLanguages(drafted);
      if (d.__lang === "ne" || d.__lang === "en") setLang(d.__lang);
      // Resume where they stopped — but not past a step that no longer holds
      // up, or they land on ID with the name blank behind them.
      setStep(resumeAt(d.__step, vals));
    } catch {
      /* private mode: a lost draft beats a thrown page */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        KEY,
        // readForm already drops the password and every File.
        JSON.stringify({ ...readForm(), languages, __step: step, __lang: lang }),
      );
      setSaved(true);
    } catch {
      /* private mode: a lost draft beats a thrown page */
    }
  }, [values, languages, step, lang, readForm]);

  const here = stepAt(step);
  // Recomputed on every render so an uncontrolled field's change is picked up
  // the next time anything re-renders, and always on Next.
  const problems = validateStep(here.id, { ...values, ...formSnapshot });
  const problemFor = (field: string) => {
    if (!checked) return null;
    const p = problems.find((x) => x.field === field);
    return p ? problemText(p.code, lang) : null;
  };

  const go = (to: number) => {
    setChecked(false);
    setStep(to);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => {
    // Read the form at the moment of pressing, so a field owned by another
    // component counts.
    const all = readForm();
    setFormSnapshot(all);
    if (validateStep(here.id, all).length > 0) {
      setChecked(true);
      return;
    }
    go(Math.min(step + 1, NUMBERED.length));
  };

  const nprPerDay = Number(values.day_rate_npr) || null;
  const langNames = languages.map((l) => l.language);

  // ── done ─────────────────────────────────────────────────────────────────
  if (actionData && "ok" in actionData && actionData.ok) {
    if (typeof document !== "undefined") localStorage.removeItem(KEY);
    return (
      <Success
        name={(actionData as any).name}
        lang={lang}
        nprPerDay={nprPerDay}
        district={values.home_district ?? ""}
        hook={values.hook_line ?? ""}
        languages={langNames}
      />
    );
  }

  const error = actionData && "error" in actionData ? (actionData as any).error : null;

  return (
    <div className="min-h-screen bg-paper">
      <ApplyHeader lang={lang} onLang={setLang} />

      {/* 0 — the intro. No fields, and every fear answered before the first
          one: the rate is theirs, they are paid in rupees, and a real guide
          says so in their own words. */}
      {step === 0 ? (
        <Intro lang={lang} voice={voice} guideCount={guideCount} onStart={() => go(1)} />
      ) : (
        <main className="mx-auto max-w-[72rem] px-4 pb-32 pt-8 lg:pb-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="min-w-0">
              <TrailProgress current={step} className="mx-auto max-w-[35rem]" />
              <p className="mt-4 text-center font-mono text-caption text-muted">
                {tf("stepCounter", lang, { n: step, total: NUMBERED.length })}
                {saved && <span className="ml-2 text-moss">· {t("saved", lang)}</span>}
              </p>

              {/* On a phone the side panel is a card above the fields rather
                  than dropped — the fear does not shrink with the screen. */}
              <div className="mt-6 lg:hidden">
                <button
                  type="button"
                  onClick={() => setSheet((s) => !s)}
                  className="w-full rounded-pill border border-line bg-card px-4 py-2 text-sm font-medium text-ink"
                  aria-expanded={sheet}
                >
                  {t("previewCard", lang)}
                </button>
                {sheet && (
                  <div className="mt-3 space-y-3">
                    <LiveGuideCard
                      name={values.full_name ?? ""}
                      district={values.home_district ?? ""}
                      hook={values.hook_line ?? ""}
                      languages={langNames}
                      nprPerDay={nprPerDay}
                      pendingLabel={t("pendingBadge", lang)}
                      placeholders={{
                        name: t("cardNamePlaceholder", lang),
                        district: t("cardDistrictPlaceholder", lang),
                        hook: t("cardHookPlaceholder", lang),
                      }}
                    />
                    <SidePanel
                      step={here.id}
                      lang={lang}
                      nprPerDay={nprPerDay}
                      range={range}
                      sampleTrek={sampleTrek}
                      verifyDays={null}
                    />
                  </div>
                )}
              </div>

              <Form
                method="post"
                encType="multipart/form-data"
                ref={formRef}
                // Any field changing — including one owned by a child that
                // writes straight to the DOM — puts the whole form in state,
                // which saves the draft and refreshes validation.
                onChange={() => setFormSnapshot(readForm())}
                className="mx-auto mt-8 max-w-[35rem]"
              >
                {/* Honeypot — humans never see it, bots fill it. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                />

                {/* Every step stays mounted and hidden, so one submit at the
                    end carries the whole form — a file input that unmounts
                    loses its photograph, and a five-request wizard on a 3G
                    connection loses the applicant. */}
                <StepPane on={here.id === "you"} n={1} head={t("step1Head", lang)}>
                  <TextField
                    name="full_name" label={t("fullName", lang)} hint={t("fullNameHint", lang)}
                    placeholder="Pemba Sherpa" value={values.full_name ?? ""} onChange={set}
                    problem={problemFor("full_name")} autoComplete="name"
                  />
                  <TextField
                    name="phone" label={t("phone", lang)} hint={t("phoneHint", lang)}
                    placeholder="98XXXXXXXX" value={values.phone ?? ""} onChange={set}
                    problem={problemFor("phone")} type="tel" autoComplete="tel"
                  />
                  <TextField
                    name="email" label={t("email", lang)} hint={t("emailHint", lang)}
                    placeholder="you@example.com" value={values.email ?? ""} onChange={set}
                    problem={problemFor("email")} type="email" autoComplete="email"
                  />
                  <TextField
                    name="password" label={t("password", lang)} hint={t("passwordHint", lang)}
                    value={values.password ?? ""} onChange={set}
                    problem={problemFor("password")} type="password" autoComplete="new-password"
                  />
                </StepPane>

                <StepPane on={here.id === "work"} n={2} head={t("step2Head", lang)}>
                  <TextField
                    name="years_experience" label={t("years", lang)} placeholder="14"
                    value={values.years_experience ?? ""} onChange={set}
                    problem={problemFor("years_experience")} type="number"
                  />
                  <NprField
                    label={t("dayRate", lang)}
                    hint={
                      range
                        ? tf("rateHint", lang, {
                            low: range.low.toLocaleString("en-US"),
                            high: range.high.toLocaleString("en-US"),
                          })
                        : t("dayRateHint", lang)
                    }
                    value={values.day_rate_npr ?? ""}
                    onChange={(v) => set("day_rate_npr", v)}
                    problem={problemFor("day_rate_npr")}
                    earnings={nprPerDay && sampleTrek ? earningsFor(nprPerDay, sampleTrek.days) : null}
                    trekName={sampleTrek?.name ?? null}
                    lang={lang}
                  />
                  <div>
                    <p className="text-ink">{t("languagesLabel", lang)}</p>
                    <div className="mt-2">
                      <GuideLanguages value={languages} onChange={setLanguages} />
                    </div>
                  </div>
                  <div>
                    <p className="text-ink">{t("regionsLabel", lang)}</p>
                    <div className="mt-2">
                      <GuideRegions />
                    </div>
                  </div>
                  <div>
                    <p className="text-ink">{t("routesLabel", lang)}</p>
                    <p className="mt-1 text-sm text-muted">{t("routesHint", lang)}</p>
                    <div className="mt-2">
                      <RoutesWalked routes={routes} />
                    </div>
                  </div>
                  <TextField
                    name="hook_line" label={t("hookLabel", lang)} hint={t("hookHint", lang)}
                    placeholder="I know which teahouse at Lobuche has hot water."
                    value={values.hook_line ?? ""} onChange={set} problem={null}
                  />
                </StepPane>

                <StepPane on={here.id === "licence"} n={3} head={t("step3Head", lang)}>
                  <TextField
                    name="licence_no" label={t("licenceNo", lang)} placeholder="TG-12345"
                    value={values.licence_no ?? ""} onChange={set}
                    problem={problemFor("licence_no")}
                  />
                  <BsAdDate
                    name="licence_expiry"
                    value={values.licence_expiry ?? ""}
                    onChange={(iso) => set("licence_expiry", iso)}
                    label={t("licenceExpiry", lang)}
                    problem={
                      problemFor("licence_expiry") ??
                      (values.licence_expiry ? licenceExpiryProblem(values.licence_expiry) : null)
                    }
                  />
                  <DistrictPicker
                    value={values.home_district ?? ""}
                    onChange={(v) => set("home_district", v)}
                    label={t("district", lang)}
                    hint={t("districtHint", lang)}
                    problem={problemFor("home_district")}
                  />
                  <DocUpload
                    name="licence_photo" label={t("licencePhoto", lang)} glyph="licence"
                    cta={t("uploadCta", lang)} receivedLabel={t("uploadReceived", lang)}
                    retryLabel={t("uploadRetry", lang)}
                  />
                </StepPane>

                <StepPane on={here.id === "id"} n={4} head={t("step4Head", lang)}>
                  {/* The promise sits directly above the upload, because that
                      is the moment it is needed — not on a policy page. */}
                  <p className="flex gap-2.5 rounded-xl border border-sage/60 bg-mist px-4 py-3 text-sm text-ink">
                    <LockMark className="mt-1" />
                    <span>{t("privacyPromise", lang)}</span>
                  </p>
                  <DocUpload
                    name="id_photo" label={t("idPhoto", lang)} glyph="id"
                    cta={t("uploadCta", lang)} receivedLabel={t("uploadReceived", lang)}
                    retryLabel={t("uploadRetry", lang)}
                  />
                  <div>
                    <p className="text-ink">{t("emergencyHead", lang)}</p>
                    <div className="mt-2">
                      <EmergencyFields />
                    </div>
                    {problemFor("emergency_contact_name") && (
                      <p className="mt-1.5 text-sm text-ember">{problemFor("emergency_contact_name")}</p>
                    )}
                    {problemFor("emergency_contact_phone") && (
                      <p className="mt-1.5 text-sm text-ember">{problemFor("emergency_contact_phone")}</p>
                    )}
                  </div>
                </StepPane>

                <StepPane on={here.id === "review"} n={5} head={t("step5Head", lang)}>
                  <Review values={values} languages={langNames} lang={lang} onEdit={go} />
                  <HeardAbout
                    value={values.heard_about ?? ""}
                    detail={values.heard_about_detail ?? ""}
                    onChange={set}
                    lang={lang}
                    problem={problemFor("heard_about")}
                  />
                </StepPane>

                {/* The rate the action reads. It asks for USD; a guide thinks
                    in rupees, so the conversion happens here rather than in
                    their head. */}
                <input
                  type="hidden"
                  name="day_rate_usd"
                  value={nprPerDay ? (usdCentsFromNpr(nprPerDay) / 100).toFixed(2) : ""}
                />

                {error && (
                  <p className="mt-6 rounded-md border border-ember/40 bg-ember/5 px-4 py-3 text-sm text-ink">
                    {error}
                  </p>
                )}

                {checked && problems.length > 0 && (
                  <p className="mt-6 rounded-md border border-ember/40 bg-ember/5 px-4 py-3 text-sm text-ink">
                    {problemText(problems[0].code, lang)}
                  </p>
                )}

                {/* Sticky on a phone, in flow on a laptop. */}
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:static lg:mt-10 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
                  <div className="mx-auto flex max-w-[35rem] items-center gap-3">
                    {step > 1 && (
                      <button
                        type="button"
                        onClick={() => go(step - 1)}
                        className="h-[52px] shrink-0 rounded-xl border border-line px-5 text-sm font-medium text-ink hover:border-sage"
                      >
                        {t("back", lang)}
                      </button>
                    )}
                    {here.id === "review" ? (
                      <button
                        type="submit"
                        disabled={busy}
                        className="h-[52px] flex-1 rounded-xl bg-pine px-5 font-medium text-paper transition-colors duration-instant hover:bg-moss disabled:opacity-60"
                      >
                        {busy ? t("sending", lang) : t("submit", lang)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={next}
                        className="h-[52px] flex-1 rounded-xl bg-pine px-5 font-medium text-paper transition-colors duration-instant hover:bg-moss"
                      >
                        {t("next", lang)}
                      </button>
                    )}
                  </div>
                </div>
              </Form>
            </div>

            {/* The card they are building, and the answer to this step's fear. */}
            <aside className="hidden lg:block">
              <div className="sticky top-8 space-y-4">
                <LiveGuideCard
                  name={values.full_name ?? ""}
                  district={values.home_district ?? ""}
                  hook={values.hook_line ?? ""}
                  languages={langNames}
                  nprPerDay={nprPerDay}
                  pendingLabel={t("pendingBadge", lang)}
                  placeholders={{
                    name: t("cardNamePlaceholder", lang),
                    district: t("cardDistrictPlaceholder", lang),
                    hook: t("cardHookPlaceholder", lang),
                  }}
                />
                <p className="text-center font-mono text-caption text-muted">
                  {t("cardCaption", lang)}
                </p>
                <SidePanel
                  step={here.id}
                  lang={lang}
                  nprPerDay={nprPerDay}
                  range={range}
                  sampleTrek={sampleTrek}
                  verifyDays={null}
                />
              </div>
            </aside>
          </div>
        </main>
      )}

      <GuideFooter faces={faces} lang={lang} guideCount={guideCount} />
    </div>
  );
}

/**
 * The header on this page only.
 *
 * The site header offers Guides, Experiences, Routes, Plan an Event, Stories
 * and Sign up — six ways to leave a form halfway through. An applicant who
 * wanders into the trekker side of the site does not come back to finish.
 * So: the wordmark, a way to ask a person a question, and the language.
 */
function ApplyHeader({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  return (
    <header className="border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-[72rem] items-center gap-3 px-4 py-3">
        <Link to="/" className="font-display text-lg text-ink">
          Guides of Nepal<span className="text-moss">.</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {WHATSAPP ? (
            <a
              href={`https://wa.me/${WHATSAPP}`}
              target="_blank"
              rel="noreferrer noopener"
              className="hidden rounded-pill border border-line px-3 py-1.5 text-sm text-ink hover:border-sage sm:inline-block"
            >
              {t("whatsapp", lang)}
            </a>
          ) : null}
          {/* Two buttons, not a select: one tap, and both labels legible in
              their own script. */}
          <div className="flex overflow-hidden rounded-pill border border-line text-caption">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onLang(l.code)}
                aria-pressed={lang === l.code}
                className={cn(
                  "px-3 py-1.5 transition-colors duration-instant",
                  lang === l.code ? "bg-pine text-paper" : "text-muted hover:text-ink",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Step zero: no fields, four fears answered.
 *
 * "Is this another agency taking my cut" is answered by a number. "Is there a
 * real person behind this" is answered by a real guide's face and their own
 * sentence — not a testimonial we wrote about ourselves.
 */
function Intro({
  lang,
  voice,
  guideCount,
  onStart,
}: {
  lang: Lang;
  voice: { name: string; district: string | null; years: number | null; quote: string | null; avatar: string | null } | null;
  guideCount: number;
  onStart: () => void;
}) {
  return (
    <main className="mx-auto grid max-w-[72rem] gap-8 px-4 py-8 lg:grid-cols-2 lg:items-center lg:gap-14 lg:py-16">
      {voice?.avatar ? (
        <div className="order-1 lg:order-none">
          <div className="relative overflow-hidden rounded-photo">
            <SmartImage
              src={voice.avatar}
              alt={voice.name}
              width={720}
              height={900}
              cover
              eager
              className="aspect-[4/5] w-full object-cover"
            />
          </div>
          <p className="mt-2 font-mono text-caption uppercase tracking-[0.08em] text-muted">
            {[voice.name, voice.district, voice.years ? `${voice.years} years guiding` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      <div>
        <h1 className="font-display text-3xl leading-[1.05] text-ink sm:text-5xl">
          <span className="wt-light">Your name on the</span>{" "}
          <span className="wt-heavy">work.</span>
        </h1>

        <ul className="mt-7 space-y-2.5">
          {(["proofRate", "proofPaid", "proofNoAgency"] as const).map((k) => (
            <li key={k} className="flex items-start gap-3 rounded-md bg-mist px-4 py-3">
              <span aria-hidden="true" className="mt-0.5 text-moss">
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8.5 6.5 12 13 4.5" />
                </svg>
              </span>
              <span className="text-ink">{t(k, lang)}</span>
            </li>
          ))}
        </ul>

        {voice?.quote ? (
          <blockquote className="mt-7 border-l-[3px] border-chartreuse pl-5">
            <p className="font-display text-lg leading-relaxed text-ink">“{voice.quote}”</p>
            <footer className="mt-2 text-caption text-muted">
              — {voice.name}
              {voice.district ? `, ${voice.district}` : ""} · one of {guideCount} guides here
            </footer>
          </blockquote>
        ) : null}

        <button
          type="button"
          onClick={onStart}
          className="mt-8 h-[52px] w-full rounded-xl bg-chartreuse px-6 font-medium text-pine transition-colors duration-instant hover:bg-white sm:w-auto"
        >
          {t("introStart", lang)} →
        </button>
        <p className="mt-3 text-sm text-muted">{t("introTime", lang)}</p>
      </div>
    </main>
  );
}

/**
 * One step's fields.
 *
 * Hidden rather than unmounted, deliberately: a file input that unmounts
 * loses the photograph it was holding, and one submit at the end means the
 * action stays the single place that validates and creates anything. Hidden
 * fields still post.
 */
function StepPane({
  on,
  n,
  head,
  children,
}: {
  on: boolean;
  n: number;
  head: string;
  children: React.ReactNode;
}) {
  return (
    <div hidden={!on} aria-hidden={!on} className={on ? "step-in" : undefined}>
      <p className="font-mono text-2xl text-sage">{String(n).padStart(2, "0")}</p>
      <h2 className="mt-1 font-display text-2xl leading-tight text-ink sm:text-[1.75rem]">
        {head}
      </h2>
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

/** A labelled field, 52px, with the hint above the error and neither shouting. */
function TextField({
  name,
  label,
  hint,
  placeholder,
  value,
  onChange,
  problem,
  type = "text",
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (k: string, v: string) => void;
  problem: string | null;
  type?: string;
  autoComplete?: string;
}) {
  // A password you cannot see is hard to type on a phone keyboard in your
  // second language, and harder when somebody just read it to you.
  const reveal = useReveal();
  const isPassword = type === "password";
  return (
    <div>
      <label htmlFor={name} className="text-ink">{label}</label>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="relative">
        <input
          id={name}
          name={name}
          type={isPassword ? reveal.type : type}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(name, e.target.value)}
          // Lighter than the value, so a placeholder never reads as something
          // already filled in — "pemba@example.com" looked typed.
          placeholder={placeholder}
          className={cn(
            "mt-2 h-[52px] w-full rounded-xl border bg-card px-3 text-ink placeholder:text-muted/50",
            "focus:outline-none focus:ring-2 focus:ring-moss/30",
            isPassword && "pr-11",
            problem ? "border-ember" : "border-line focus:border-moss",
          )}
        />
        {isPassword && reveal.button}
      </div>
      {problem && <p className="mt-1.5 text-sm text-ember">{problem}</p>}
    </div>
  );
}

/**
 * The day rate, in rupees, with what it means beside it.
 *
 * The old field said "in US dollars" — a currency a Nepali guide is never
 * paid in. And a number in a box means nothing until it is multiplied by a
 * real trek.
 */
function NprField({
  label,
  hint,
  value,
  onChange,
  problem,
  earnings,
  trekName,
  lang,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  problem: string | null;
  earnings: { perDay: number; days: number; total: number } | null;
  trekName: string | null;
  lang: Lang;
}) {
  return (
    <div>
      <label htmlFor="day_rate_npr" className="text-ink">{label}</label>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-sm text-muted">NPR</span>
        <input
          id="day_rate_npr"
          name="day_rate_npr"
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="4500"
          className={cn(
            "h-[52px] w-full rounded-xl border bg-card px-3 font-mono text-ink placeholder:text-muted/50",
            "focus:outline-none focus:ring-2 focus:ring-moss/30",
            problem ? "border-ember" : "border-line focus:border-moss",
          )}
        />
        <span className="shrink-0 text-sm text-muted">/day</span>
      </div>
      {problem && <p className="mt-1.5 text-sm text-ember">{problem}</p>}
      {earnings && trekName && (
        <p className="mt-2.5 rounded-md bg-mist px-4 py-3 text-sm text-ink">
          {tf("earningsLine", lang, {
            rate: formatNpr(earnings.perDay),
            days: String(earnings.days),
            trek: trekName,
          })}{" "}
          <span className="font-mono font-medium">{formatNpr(earnings.total)}</span>
        </p>
      )}
    </div>
  );
}

/** Everything they typed, with a way back to each screen. */
function Review({
  values,
  languages,
  lang,
  onEdit,
}: {
  values: Record<string, string>;
  languages: string[];
  lang: Lang;
  onEdit: (step: number) => void;
}) {
  const rows: { step: number; label: string; value: string }[] = [
    { step: 1, label: t("fullName", lang), value: values.full_name ?? "" },
    { step: 1, label: t("phone", lang), value: values.phone ?? "" },
    { step: 1, label: t("email", lang), value: values.email ?? "" },
    {
      step: 2,
      label: t("dayRate", lang),
      value: values.day_rate_npr ? formatNpr(Number(values.day_rate_npr)) : "",
    },
    { step: 2, label: t("years", lang), value: values.years_experience ?? "" },
    { step: 2, label: t("languagesLabel", lang), value: languages.join(", ") },
    { step: 3, label: t("licenceNo", lang), value: values.licence_no ?? "" },
    { step: 3, label: t("licenceExpiry", lang), value: values.licence_expiry ?? "" },
    { step: 3, label: t("district", lang), value: values.home_district ?? "" },
    { step: 4, label: t("emergencyHead", lang), value: values.emergency_contact_name ?? "" },
  ];
  return (
    <dl className="divide-y divide-line rounded-md border border-line bg-card">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline gap-3 px-4 py-3">
          <dt className="w-[38%] shrink-0 text-sm text-muted">{r.label}</dt>
          <dd className={cn("min-w-0 flex-1 truncate text-sm", r.value ? "text-ink" : "text-muted/60")}>
            {r.value || "—"}
          </dd>
          <button
            type="button"
            onClick={() => onEdit(r.step)}
            className="shrink-0 text-caption text-moss underline underline-offset-4"
          >
            {t("edit", lang)}
          </button>
        </div>
      ))}
    </dl>
  );
}

/**
 * One question instead of two.
 *
 * It used to be "how did you hear about us" and a separate "who told you",
 * and the second box sat there empty for everybody who picked Google. The
 * name box only appears when the answer is a person.
 */
function HeardAbout({
  value,
  detail,
  onChange,
  lang,
  problem,
}: {
  value: string;
  detail: string;
  onChange: (k: string, v: string) => void;
  lang: Lang;
  problem: string | null;
}) {
  const wantsName = value === "guide" || value === "trekker";
  return (
    <div>
      <label htmlFor="heard_about" className="text-ink">{t("heardLabel", lang)}</label>
      <select
        id="heard_about"
        name="heard_about"
        value={value}
        onChange={(e) => onChange("heard_about", e.target.value)}
        className={cn(
          "mt-2 h-[52px] w-full rounded-xl border bg-card px-3 text-ink",
          "focus:outline-none focus:ring-2 focus:ring-moss/30",
          problem ? "border-ember" : "border-line focus:border-moss",
        )}
      >
        <option value="">—</option>
        {HEARD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {problem && <p className="mt-1.5 text-sm text-ember">{problem}</p>}
      {wantsName && (
        <div className="mt-4">
          <label htmlFor="heard_about_detail" className="text-ink">{t("heardWho", lang)}</label>
          <input
            id="heard_about_detail"
            name="heard_about_detail"
            value={detail}
            onChange={(e) => onChange("heard_about_detail", e.target.value)}
            className="mt-2 h-[52px] w-full rounded-xl border border-line bg-card px-3 text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/30"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Sent.
 *
 * Their finished card, still marked pending, on the dark green the rest of
 * the site ends on. No confetti: they have just handed over a citizenship
 * card, and the right note is calm.
 */
function Success({
  name,
  lang,
  nprPerDay,
  district,
  hook,
  languages,
}: {
  name: string;
  lang: Lang;
  nprPerDay: number | null;
  district: string;
  hook: string;
  languages: string[];
}) {
  const first = String(name ?? "").trim().split(/\s+/)[0] || "";
  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return (
    <main className="min-h-screen bg-pine px-4 py-16 text-paper">
      <div className="mx-auto max-w-sm">
        <div className="animate-[rise_600ms_ease-out]">
          <LiveGuideCard
            name={name}
            district={district}
            hook={hook}
            languages={languages}
            nprPerDay={nprPerDay}
            pendingLabel={t("pendingBadge", lang)}
            placeholders={{
              name: t("cardNamePlaceholder", lang),
              district: t("cardDistrictPlaceholder", lang),
              hook: t("cardHookPlaceholder", lang),
            }}
          />
        </div>

        <h1 className="mt-8 text-center font-display text-3xl">
          {t("successHead", lang)}
          {first ? `, ${first}.` : "."}
        </h1>
        <p className="mt-2 text-center font-mono text-caption uppercase tracking-[0.08em] text-sage">
          {t("successReceived", lang)} · {today}
        </p>

        <ol className="mt-8 space-y-3">
          {(["nextRead", "nextCall", "nextLive"] as const).map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="font-mono text-caption text-sage">{i + 1}</span>
              <span className="text-sm text-paper/90">{t(k, lang)}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 space-y-3">
          {WHATSAPP ? (
            <a
              href={`https://wa.me/${WHATSAPP}`}
              target="_blank"
              rel="noreferrer noopener"
              className="block rounded-xl bg-chartreuse px-5 py-3.5 text-center font-medium text-pine hover:bg-white"
            >
              {t("talkToOffice", lang)}
            </a>
          ) : null}
          <Link
            to="/g/login"
            className="block rounded-xl border border-paper/40 px-5 py-3.5 text-center font-medium text-paper hover:bg-paper/10"
          >
            Sign in and set up your profile
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * The closing band, for a guide rather than a trekker.
 *
 * The shared footer ends on "49 people. Pick one." — an instruction to a
 * customer, shown to somebody applying to be one of the 49. This is the
 * people they would be joining, and the three questions every applicant
 * actually asks, answered from the real policy.
 */
function GuideFooter({
  faces,
  lang,
  guideCount,
}: {
  faces: Array<{ slug: string; name: string; district: string | null; avatar: string | null }>;
  lang: Lang;
  guideCount: number;
}) {
  const faqs = [
    {
      q: "When do I get paid?",
      a: PAYOUT_DAYS
        ? `Within ${PAYOUT_DAYS} days of the trek finishing, in rupees, to the account you give us. Not when the trekker pays — when you finish the work.`
        : "After the trek finishes, in rupees, to the account you give us — not when the trekker pays, but when you finish the work.",
    },
    {
      q: "Can I still work with my agency?",
      a: "Yes. Nothing here is exclusive. You set which dates you are free, and an agency booking is a date you are not.",
    },
    {
      q: "What if a trekker cancels?",
      a: `You are paid for the time you held. Inside ${LATE_CANCEL_DAYS} days of departure you keep ${LATE_CANCEL_GUIDE_SHARE} your fee even though the trek does not happen — the full bands are on the cancellations page.`,
    },
  ];

  return (
    <footer className="mt-16 bg-pine text-sage">
      <div className="mx-auto max-w-[72rem] px-4 py-14">
        <h2 className="font-display text-2xl text-paper sm:text-3xl">
          Guides already walking with us
        </h2>
        <ul className="mt-6 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-12">
          {faces.map((g) => (
            <li key={g.slug}>
              <Link to={`/guides/${g.slug}`} className="block">
                {g.avatar ? (
                  <SmartImage
                    src={g.avatar}
                    alt={g.name}
                    width={128}
                    height={128}
                    cover
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ) : null}
                <span className="mt-1.5 block truncate font-mono text-[10px] uppercase tracking-[0.04em] text-sage">
                  {g.name}
                </span>
                {g.district && (
                  <span className="block truncate font-mono text-[10px] text-sage/70">
                    {g.district}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-12 divide-y divide-fern/25 border-y border-fern/25">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium text-paper marker:hidden">
                {f.q}
                <span aria-hidden="true" className="float-right text-sage group-open:rotate-45 transition-transform duration-quick">+</span>
              </summary>
              <p className="mt-2 max-w-[60ch] text-sm text-sage">{f.a}</p>
            </details>
          ))}
        </div>

        {/* A real place and a real person, or nothing. An invented address is
            worse than an absent one on the page where trust is the product. */}
        {OFFICE.address || OFFICE.hours || WHATSAPP ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="label text-sage/70">Our office</p>
              {OFFICE.address && <p className="mt-2 text-sm text-paper">{OFFICE.address}</p>}
              {OFFICE.hours && <p className="mt-1 text-sm text-sage">{OFFICE.hours}</p>}
              {WHATSAPP && (
                <a
                  href={`https://wa.me/${WHATSAPP}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-block rounded-pill bg-chartreuse px-4 py-2 text-sm font-medium text-pine hover:bg-white"
                >
                  {t("talkToOffice", lang)}
                </a>
              )}
            </div>
            {OFFICE.verifierName ? (
              <div className="flex items-start gap-3">
                {OFFICE.verifierPhoto ? (
                  <SmartImage
                    src={OFFICE.verifierPhoto}
                    alt={OFFICE.verifierName}
                    width={96}
                    height={96}
                    cover
                    className="h-16 w-16 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                <div>
                  <p className="label text-sage/70">Who calls you</p>
                  <p className="mt-2 text-sm text-paper">{OFFICE.verifierName}</p>
                  <p className="mt-1 text-sm text-sage">
                    They make the verification calls, and they sign your file.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-fern/25 pt-6 text-sm">
          {[
            ["/trust", "How verification works"],
            ["/transparency", "Transparent pricing"],
            ["/fund", "The Fund"],
            ["/safety", "Trust & safety"],
            ["/cancellation", "Cancellations"],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="hover:text-fern">
              {label}
            </Link>
          ))}
        </div>
        <p className="mt-6 text-caption text-sage/60">
          © {new Date().getFullYear()} Guides of Nepal · {guideCount} verified guides
        </p>
      </div>
    </footer>
  );
}
