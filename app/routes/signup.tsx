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
  const intent = String(form.get("intent"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const { supabase, headers } = createSupabaseServerClient(request, env);

  if (intent === "send_code") {
    if (!email) return { error: "Enter your email." };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ sent: true }, { headers });
  }

  // verify — creates the session + the trekker profile, then continues.
  const token = String(form.get("token") ?? "").trim();
  const { data: res, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error || !res.user) {
    return Response.json(
      { error: "That code didn’t work — check it and try again." },
      { status: 400 },
    );
  }
  const fullName = `${form.get("first") ?? ""} ${form.get("last") ?? ""}`.trim();
  await ensureTrekkerProfile(env, res.user, fullName || undefined, String(form.get("country") ?? ""));
  return redirect(safeNext(String(form.get("next") ?? "")), { headers });
}

// Common trekker-origin countries; "Somewhere else" reveals the full select.
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

type Values = { first: string; last: string; country: string; email: string };

export default function Signup({ loaderData }: Route.ComponentProps) {
  const next = loaderData?.next ?? "/guides";
  const fetcher = useFetcher<{ sent?: boolean; error?: string }>();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Values>({ first: "", last: "", country: "", email: "" });
  const [token, setToken] = useState("");
  const [showMore, setShowMore] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const STEPS = ["name", "country", "email", "code"] as const;
  const busy = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  // Focus the primary field on each step for a keyboard-first flow.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [step]);

  // When the code has been sent, advance to the code step.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.sent && step === 2) setStep(3);
  }, [fetcher.state, fetcher.data, step]);

  const back = () => setStep((s) => Math.max(0, s - 1));

  function submitStep(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step === 0) {
      if (!v.first.trim()) return;
      setStep(1);
    } else if (step === 1) {
      if (!v.country) return;
      setStep(2);
    } else if (step === 2) {
      if (!/.+@.+\..+/.test(v.email)) return;
      fetcher.submit({ intent: "send_code", email: v.email }, { method: "post" });
    } else if (step === 3) {
      if (token.trim().length < 6) return;
      fetcher.submit(
        {
          intent: "verify",
          email: v.email,
          token: token.trim(),
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
  const countryName =
    [...POPULAR, ...MORE].find(([c]) => c === v.country)?.[1] ?? v.country;

  return (
    <main className="relative flex min-h-screen flex-col bg-paper">
      {/* Progress */}
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
        <form
          onSubmit={submitStep}
          key={step}
          className="w-full max-w-md animate-fade-rise"
        >
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
              <h1 className="mt-3 font-display text-display-l text-ink">
                What’s your email?
              </h1>
              <p className="mt-2 text-body-l text-muted">
                We’ll send a 6-digit code — no password to remember, ever.
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
                Check your inbox.
              </h1>
              <p className="mt-2 text-body-l text-muted">
                We emailed a 6-digit code to{" "}
                <span className="font-medium text-ink">{v.email}</span>.
              </p>
              <input
                ref={inputRef}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                className="mt-8 w-full rounded-md border border-line bg-card px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-moss focus:ring-3 focus:ring-moss/25"
              />
              <button
                type="button"
                onClick={() =>
                  fetcher.submit({ intent: "send_code", email: v.email }, { method: "post" })
                }
                className="mt-3 text-sm text-moss hover:underline"
              >
                Didn’t get it? Resend the code
              </button>
            </>
          )}

          {error && <p className="mt-4 text-sm text-ember">{error}</p>}

          <div className="mt-8 flex items-center gap-4">
            <Button type="submit" size="lg" loading={busy} className="min-w-40">
              {step === 3 ? "Create my account" : "Continue"}
            </Button>
            {step < 3 && (
              <span className="text-sm text-muted">
                press <kbd className="font-mono">Enter ↵</kbd>
              </span>
            )}
          </div>

          {step === 1 && v.country && (
            <p className="mt-4 text-sm text-muted">Selected: {countryName}</p>
          )}
        </form>
      </div>
    </main>
  );
}
