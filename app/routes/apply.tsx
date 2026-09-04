import { useCallback, useEffect, useRef, useState } from "react";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/apply";
import { Button } from "~/components/Button";
import { GuideLanguages } from "~/components/GuideLanguages";
import { PENDING_CHECKS } from "~/lib/guide-checks";
import { parseLanguages, type LanguageRow } from "~/lib/guide-languages";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createAdminClient, getEnv } from "~/lib/supabase.server";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return pageMeta({
    title: "Become a guide on Trek",
    description:
      "Apply to lead treks and experiences on Trek. Verified guides set their own rate and keep their whole fee — Trek's 10% is added on top and paid by the trekker.",
    canonical: d?.canonical ?? "",
  });
}

export function loader({ context }: Route.LoaderArgs) {
  return { canonical: absoluteUrl(getEnv(context).SITE_URL, "/apply") };
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
    years_experience: years,
    day_rate_usd_cents: Math.round(dayRateUsd * 100) || null,
    hook_line: hook,
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

export default function Apply({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(false);
  const KEY = "guide-application";

  // The page owns the language rows so the picker can be controlled, which is
  // what lets it render complete on the server. It used to hold its own state
  // and read `initial` at mount, which forced this page to delay mounting it
  // until the saved draft had been read — and a guide on a slow phone saw a
  // heading with an empty box under it until React caught up.
  const [languages, setLanguages] = useState<LanguageRow[]>([
    { language: "Nepali", proficiency: "native" },
  ]);

  // Autosave to localStorage (docs/04 §Interaction rules: never lose input).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw || !formRef.current) return;
      const vals = JSON.parse(raw) as Record<string, any>;
      for (const [k, v] of Object.entries(vals)) {
        if (k === "languages") continue;
        const el = formRef.current.elements.namedItem(k) as HTMLInputElement | null;
        if (el && el.type !== "file") el.value = String(v);
      }
      const drafted = parseLanguages(JSON.stringify(vals.languages ?? []));
      if (drafted.length) setLanguages(drafted);
    } catch {}
  }, []);

  const persist = useCallback(() => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const obj: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      // Never the password. Never a File — String(file) is "[object File]",
      // which would silently poison the draft and, on restore, be written into
      // a text field as that literal.
      if (k === "password" || v instanceof File) return;
      // Kept as a real array below rather than the stringified hidden field.
      if (k === "languages") return;
      obj[k] = String(v);
    });
    obj.languages = languages;
    try {
      localStorage.setItem(KEY, JSON.stringify(obj));
      setSaved(true);
    } catch {
      /* private mode or full quota — losing the draft beats throwing here */
    }
  }, [languages]);

  // The picker changes without firing the form's onChange, so save on its
  // updates too.
  useEffect(() => {
    persist();
    // Only when the rows move — persist itself changes identity with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages]);

  if (actionData && "ok" in actionData && actionData.ok) {
    if (typeof document !== "undefined") localStorage.removeItem(KEY);
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-ink">Application received</h1>
        <p className="mt-3 text-ink-soft">
          Thanks, {actionData.name}. Your account is already open — you don’t
          have to wait for us to start. We’ve emailed you what to do first.
        </p>
        <p className="mt-3 text-ink-soft">
          Our team in Kathmandu will check your licence and your ID against
          the photos you sent. We’ll message you the day you’re verified.
        </p>
        <div className="mt-6">
          <Link to="/g/login">
            <Button>Sign in and set up your profile</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="font-display text-3xl text-ink">Become a guide</h1>
      <p className="mt-1 text-ink-soft">
        Lead your own treks and experiences. You set your rate and keep it in
        full — our 10% is added on top and paid by the trekker. We verify every
        guide before they go live.
      </p>

      <Form
        method="post"
        encType="multipart/form-data"
        ref={formRef}
        onChange={persist}
        className="mt-6 space-y-4"
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
        {/* Three short groups instead of fifteen fields in a column. The form
            is the same length; knowing which part you are in is what makes it
            feel answerable on a phone. */}
        <Group n={1} title="How we reach you" note="All four needed.">
          <Field name="full_name" label="Full name" hint="As written on your licence" required />
          <Field
            name="phone"
            label="Phone / WhatsApp"
            hint="With country code, like +977 98… — this is where we message you."
            required
          />
          <Field name="email" label="Email" hint="You sign in with this" type="email" required />
          <Field
            name="password"
            label="Choose a password"
            hint="8 letters or more"
            type="password"
            required
          />
        </Group>

        <Group
          n={2}
          title="Your licence and ID"
          note="All of this is needed — it is what we verify you against."
        >
          <Field name="licence_no" label="Trekking licence number" required />
          <Field name="licence_expiry" label="Licence expires" type="date" required />
          <Field name="home_district" label="Home district" hint="Where you are from" required />
          <FileField
            name="licence_photo"
            label="Photo of your licence"
            hint="Both sides if the number is on the back. A phone photo is fine."
          />
          <FileField
            name="id_photo"
            label="NID or citizenship"
            hint="Your citizenship certificate or national ID card."
          />
          <p className="text-xs text-ink-soft">
            Only our office in Kathmandu sees these. They are never shown on
            your profile, never sent to trekkers, and deleted if you leave.
          </p>
        </Group>

        <Group n={3} title="Your work" note="You can change all of this later.">
          <div className="grid grid-cols-2 gap-4">
            <Field name="years_experience" label="Years guiding" type="number" />
            <Field
              name="day_rate_usd"
              label="Your day rate"
              hint="US dollars. Most guides: 30–60"
              type="number"
            />
          </div>

          <div>
            <span className="text-sm text-ink">Languages you speak</span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              And how well — trekkers search on this.
            </span>
            <div className="mt-1">
              <GuideLanguages value={languages} onChange={setLanguages} />
            </div>
          </div>

          <Field
            name="hook_line"
            label="One line about you"
            hint="The real thing you do. “I know every teahouse from Lukla to Gorak Shep.”"
          />
        </Group>

        <div className="rounded-card border border-border bg-card p-4 text-sm text-ink-soft">
          <p className="font-medium text-ink">What happens next</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
            <li>You can sign in straight away and finish your profile.</li>
            <li>We check your licence and your ID against the photos you sent.</li>
            <li>Once checked, your profile goes live and trekkers can book you.</li>
          </ol>
          <p className="mt-2">Adding your photo and your story is what gets you booked — you do that yourself after signing in.</p>
        </div>

        {actionData && "error" in actionData && actionData.error && (
          <p role="alert" className="text-sm text-danger">
            {actionData.error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" loading={busy}>
            Submit application
          </Button>
          {saved && <span className="text-xs text-ink-soft">Saved</span>}
        </div>
      </Form>
    </main>
  );
}

/**
 * A numbered step. Still one page rather than a wizard, and it renders whole
 * on the server — adding a second language needs JavaScript, but the first
 * one is there in the HTML, so the form submits either way.
 */
function Group({
  n,
  title,
  note,
  children,
}: {
  n: number;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-card border border-border bg-card p-4">
      <div className="flex items-baseline gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-mist font-mono text-xs text-ink">
          {n}
        </span>
        <div>
          <p className="font-medium text-ink">{title}</p>
          {note && <p className="text-sm text-ink-soft">{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  name,
  label,
  hint,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  /** Said under the label, because a guide reading this in their third
      language should never have to guess what a field wants. */
  hint?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-ink">
        {label}
        {!required && <span className="ml-1.5 text-xs text-ink-soft">optional</span>}
      </span>
      {hint && <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>}
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base outline-none focus:border-primary"
      />
    </label>
  );
}

/**
 * A document. `capture` is deliberately absent: a guide who already has a
 * scan in their gallery should not be forced into the camera.
 */
function FileField({ name, label, hint }: { name: string; label: string; hint?: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <label className="block">
      <span className="text-sm text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>}
      <input
        name={name}
        type="file"
        accept={DOC_ACCEPT}
        required
        onChange={(e) => setPicked(e.target.files?.[0]?.name ?? null)}
        className="mt-1 w-full rounded-button border border-border px-3 py-2 text-sm text-ink-soft file:mr-3 file:rounded file:border-0 file:bg-mist file:px-3 file:py-1.5 file:text-sm file:text-ink"
      />
      {picked && <span className="mt-1 block text-xs text-ink-soft">{picked}</span>}
    </label>
  );
}
