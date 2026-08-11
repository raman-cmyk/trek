import { useEffect, useRef, useState } from "react";
import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/apply";
import { Button } from "~/components/Button";
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

const PENDING_CHECKS = [
  "licence",
  "id_match",
  "phone",
  "payout_account",
  "reference_1",
  "first_aid",
] as const;

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const fullName = String(form.get("full_name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const district = String(form.get("home_district") ?? "").trim();
  const licenceNo = String(form.get("licence_no") ?? "").trim();
  const licenceExpiry = String(form.get("licence_expiry") ?? "").trim() || null;
  const years = Number(form.get("years_experience") ?? 0) || null;
  const dayRateUsd = Number(form.get("day_rate_usd") ?? 0);
  const hook = String(form.get("hook_line") ?? "").trim() || null;
  const languages = String(form.get("languages") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!fullName || !phone) {
    return data({ error: "Name and phone are required." }, { status: 400 });
  }
  if (!/.+@.+\..+/.test(email)) {
    return data({ error: "Enter an email you can sign in with." }, { status: 400 });
  }
  if (password.length < 8) {
    return data({ error: "Choose a password of at least 8 characters." }, { status: 400 });
  }

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

  // 2) Profile + guide (applied) + languages + pending verification checklist.
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
    licence_no: licenceNo || null,
    licence_expiry: licenceExpiry,
    home_district: district || null,
    years_experience: years,
    day_rate_usd_cents: Math.round(dayRateUsd * 100) || null,
    hook_line: hook,
  });
  if (guideErr) {
    // Roll back the auth user so the phone can retry.
    await admin.auth.admin.deleteUser(userId);
    return data({ error: "Couldn’t save your application. Please retry." }, { status: 400 });
  }

  if (languages.length) {
    await admin.from("guide_languages").insert(
      languages.map((language) => ({
        guide_id: userId,
        language,
        proficiency: "conversational",
      })),
    );
  }
  await admin.from("guide_verifications").insert(
    PENDING_CHECKS.map((check_type) => ({
      guide_id: userId,
      check_type,
      status: "pending",
    })),
  );

  return data({ ok: true, name: fullName });
}

export default function Apply({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(false);
  const KEY = "guide-application";

  // Autosave to localStorage (docs/04 §Interaction rules: never lose input).
  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    if (raw && formRef.current) {
      try {
        const vals = JSON.parse(raw) as Record<string, string>;
        for (const [k, v] of Object.entries(vals)) {
          const el = formRef.current.elements.namedItem(k) as HTMLInputElement | null;
          if (el) el.value = v;
        }
      } catch {}
    }
  }, []);

  function persist() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const obj: Record<string, string> = {};
    // Never persist the password to localStorage.
    fd.forEach((v, k) => {
      if (k !== "password") obj[k] = String(v);
    });
    localStorage.setItem(KEY, JSON.stringify(obj));
    setSaved(true);
  }

  if (actionData && "ok" in actionData && actionData.ok) {
    if (typeof document !== "undefined") localStorage.removeItem(KEY);
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-ink">Application received</h1>
        <p className="mt-3 text-ink-soft">
          Thanks, {actionData.name}. Our team in Kathmandu will review your
          licence and references. We’ll text you when you’re verified — then
          sign in with the email and password you just set.
        </p>
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
        <Field name="full_name" label="Full name (as on your licence)" required />
        <Field name="phone" label="Phone (with country code, e.g. +9779…)" required />
        <Field name="email" label="Email (you'll sign in with this)" required />
        <Field name="password" label="Choose a password (8+ characters)" type="password" required />
        <Field name="home_district" label="Home district" />
        <div className="grid grid-cols-2 gap-4">
          <Field name="licence_no" label="Trekking licence no." />
          <Field name="licence_expiry" label="Licence expiry" type="date" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field name="years_experience" label="Years guiding" type="number" />
          <Field name="day_rate_usd" label="Your day rate (USD)" type="number" />
        </div>
        <Field name="languages" label="Languages (comma-separated)" />
        <Field name="hook_line" label="One line about you" />

        {actionData && "error" in actionData && actionData.error && (
          <p className="text-sm text-danger">{actionData.error}</p>
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

function Field({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-ink-soft">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-button border border-border px-3 py-2 outline-none focus:border-primary"
      />
    </label>
  );
}
