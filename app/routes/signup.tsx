import { useEffect, useRef, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";
import type { Route } from "./+types/signup";
import { Button } from "~/components/Button";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { ensureTrekkerProfile, getSessionUser } from "~/lib/auth.server";

export function meta() {
  return [
    { title: "Create your Trek account" },
    { name: "robots", content: "noindex" },
  ];
}

function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/guides";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const { user } = await getSessionUser(request, getEnv(context));
  if (user) throw redirect(next);
  return { next };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const { supabase, headers } = createSupabaseServerClient(request, env);

  if (!/.+@.+\..+/.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Use at least 8 characters." }, { status: 400 });

  const { data: res, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const already = /already|registered|exists/i.test(error.message);
    return Response.json(
      { error: already ? "That email already has an account — sign in instead." : error.message },
      { status: 400 },
    );
  }
  if (res.user) {
    const fullName = `${form.get("first") ?? ""} ${form.get("last") ?? ""}`.trim();
    await ensureTrekkerProfile(env, res.user, fullName || undefined, String(form.get("country") ?? ""));
  }
  // Auto-confirm returns a session on signUp; if not, establish one now.
  if (!res.session) await supabase.auth.signInWithPassword({ email, password });
  return redirect(safeNext(String(form.get("next") ?? "")), { headers });
}

const POPULAR = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["DE", "Germany"],
  ["AU", "Australia"],
  ["CA", "Canada"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["IN", "India"],
] as const;
const MORE = [
  ["IE", "Ireland"], ["ES", "Spain"], ["IT", "Italy"], ["CH", "Switzerland"],
  ["SE", "Sweden"], ["NO", "Norway"], ["DK", "Denmark"], ["BE", "Belgium"],
  ["AT", "Austria"], ["NZ", "New Zealand"], ["JP", "Japan"], ["KR", "South Korea"],
  ["SG", "Singapore"], ["CN", "China"], ["BR", "Brazil"], ["MX", "Mexico"],
  ["ZA", "South Africa"], ["IL", "Israel"], ["AE", "United Arab Emirates"],
  ["PL", "Poland"], ["CZ", "Czechia"], ["PT", "Portugal"], ["NP", "Nepal"],
  ["OT", "Somewhere else"],
] as const;

type Values = { first: string; last: string; country: string; email: string; password: string };

export default function Signup({ loaderData }: Route.ComponentProps) {
  const next = loaderData?.next ?? "/guides";
  const fetcher = useFetcher<{ error?: string }>();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Values>({ first: "", last: "", country: "", email: "", password: "" });
  const [showMore, setShowMore] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const STEPS = ["name", "country", "email", "password"] as const;
  const busy = fetcher.state !== "idle";
  const [stepError, setStepError] = useState<string | null>(null);
  const error = fetcher.data?.error ?? stepError;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [step]);

  const back = () => setStep((s) => Math.max(0, s - 1));

  function submitStep(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setStepError(null);
    if (step === 0) {
      if (!v.first.trim()) return setStepError("Tell us your first name.");
      setStep(1);
    } else if (step === 1) {
      if (!v.country) return setStepError("Pick your country.");
      setStep(2);
    } else if (step === 2) {
      if (!/.+@.+\..+/.test(v.email)) return setStepError("That email doesn't look right.");
      setStep(3);
    } else if (step === 3) {
      if (v.password.length < 8) return setStepError("Password needs at least 8 characters.");
      fetcher.submit(
        {
          email: v.email,
          password: v.password,
          first: v.first,
          last: v.last,
          country: v.country,
          next,
        },
        { method: "post" },
      );
    }
  }

  const pct = ((step + 1) / STEPS.length) * 100;
  const countryName = [...POPULAR, ...MORE].find(([c]) => c === v.country)?.[1] ?? v.country;

  return (
    <main className="relative flex min-h-screen flex-col bg-paper">
      <div className="h-1 w-full bg-mist">
        <div
          className="h-full bg-moss transition-[width] duration-base ease-out-soft"
          style={{ width: `${pct}%` }}
        />
      </div>

      <header className="flex items-center justify-between px-5 py-4">
        <Link to="/" className="font-display text-xl text-ink">
          Trek<span className="text-moss">.</span>
        </Link>
        {step > 0 ? (
          <button onClick={back} className="text-sm text-muted hover:text-ink">
            ← Back
          </button>
        ) : (
          <Link to="/login" className="text-sm text-muted hover:text-ink">
            Have an account? Sign in
          </Link>
        )}
      </header>

      <div className="flex flex-1 items-center justify-center px-5 pb-24">
        <form onSubmit={submitStep} key={step} className="w-full max-w-md animate-fade-rise">
          <p className="label text-moss">
            Step {step + 1} of {STEPS.length}
          </p>

          {step === 0 && (
            <>
              <h1 className="mt-3 font-display text-display-l text-ink">
                First, what should we call you?
              </h1>
              <p className="mt-2 text-body-l text-muted">
                Your guide will greet you by name — no anonymous bookings here.
              </p>
              <div className="mt-8 flex gap-3">
                <input
                  ref={inputRef}
                  value={v.first}
                  onChange={(e) => setV({ ...v, first: e.target.value })}
                  placeholder="First name"
                  autoComplete="given-name"
                  className="w-full rounded-md border border-line bg-card px-4 py-3 text-lg outline-none focus:border-moss focus:ring-3 focus:ring-moss/25"
                />
                <input
                  value={v.last}
                  onChange={(e) => setV({ ...v, last: e.target.value })}
                  placeholder="Last name"
                  autoComplete="family-name"
                  className="w-full rounded-md border border-line bg-card px-4 py-3 text-lg outline-none focus:border-moss focus:ring-3 focus:ring-moss/25"
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="mt-3 font-display text-display-l text-ink">
                Where are you travelling from, {v.first}?
              </h1>
              <p className="mt-2 text-body-l text-muted">
                It helps your guide plan for jet lag, altitude and timing.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {POPULAR.map(([code, name]) => (
                  <button
                    type="button"
                    key={code}
                    onClick={() => {
                      setV({ ...v, country: code });
                      setTimeout(() => setStep(2), 180);
                    }}
                    className={
                      "rounded-full border px-4 py-2 text-sm transition-colors " +
                      (v.country === code
                        ? "border-transparent bg-chartreuse text-pine"
                        : "border-line bg-card text-ink hover:bg-mist")
                    }
                  >
                    {name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowMore((s) => !s)}
                  className="rounded-full border border-line bg-card px-4 py-2 text-sm text-ink hover:bg-mist"
                >
                  Somewhere else…
                </button>
              </div>
              {showMore && (
                <select
                  ref={inputRef as any}
                  value={MORE.some(([c]) => c === v.country) ? v.country : ""}
                  onChange={(e) => setV({ ...v, country: e.target.value })}
                  className="mt-3 w-full rounded-md border border-line bg-card px-4 py-3 text-lg outline-none focus:border-moss"
                >
                  <option value="">Choose your country…</option>
                  {MORE.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="mt-3 font-display text-display-l text-ink">What’s your email?</h1>
              <p className="mt-2 text-body-l text-muted">
                You’ll use this to sign in and to hear from your guide.
              </p>
              <input
                ref={inputRef}
                value={v.email}
                onChange={(e) => setV({ ...v, email: e.target.value })}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                className="mt-8 w-full rounded-md border border-line bg-card px-4 py-3 text-lg outline-none focus:border-moss focus:ring-3 focus:ring-moss/25"
              />
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="mt-3 font-display text-display-l text-ink">
                Set a password.
              </h1>
              <p className="mt-2 text-body-l text-muted">
                At least 8 characters. You’ll use it with{" "}
                <span className="font-medium text-ink">{v.email}</span> to sign in.
              </p>
              <input
                ref={inputRef}
                value={v.password}
                onChange={(e) => setV({ ...v, password: e.target.value })}
                type="password"
                autoComplete="new-password"
                placeholder="Create a password"
                className="mt-8 w-full rounded-md border border-line bg-card px-4 py-3 text-lg outline-none focus:border-moss focus:ring-3 focus:ring-moss/25"
              />
            </>
          )}

          {error && <p className="mt-4 text-sm text-ember">{error}</p>}

          <div className="mt-8 flex items-center gap-4">
            <Button type="submit" size="lg" loading={busy} className="min-w-40">
              {step === 3 ? "Create my account" : "Continue"}
            </Button>
            <span className="text-sm text-muted">
              press <kbd className="font-mono">Enter ↵</kbd>
            </span>
          </div>

          {step === 1 && v.country && (
            <p className="mt-4 text-sm text-muted">Selected: {countryName}</p>
          )}
        </form>
      </div>
    </main>
  );
}
