# Decisions log

Judgment calls made without blocking the founder (per CLAUDE.md working
agreement). Newest first.

---

## 2026-08-09

- **React Router v8, not v7.** The docs specify "React Router v7, framework
  mode." `react-router@latest` is now **8.x** — the direct continuation of the
  v7 framework-mode line, and the version all current tooling/templates target.
  Pinning the superseded v7 would fight the ecosystem. Adopted v8; the stack
  intent (Vite-based, SSR, Cloudflare) is unchanged. Notable v8 API shift wired
  in: the load context is a typed `RouterContextProvider` (see `app/context.ts`)
  instead of the v7 `AppLoadContext` module augmentation.

- **Package manager: npm.** Matches the React Router Cloudflare template default
  and keeps CI simple. (pnpm is available but not adopted.)

- **Test runner: Vitest**, with a dedicated `vitest.config.ts` that omits the
  React Router / Cloudflare Vite plugins so pure `app/lib` unit tests
  (pricing, policy, mask) run without the framework loading.

- **Fonts self-hosted** via `@fontsource-variable/*` rather than Google Fonts
  CDN — avoids a runtime external request (CSP/Cloudflare-friendly, faster LCP).

- **`worker-configuration.d.ts` is gitignored and regenerated.** It's a 549KB
  generated file that tracks the wrangler/compat-date. `npm run typecheck` runs
  `wrangler types` first so local and CI always have fresh Cloudflare types.

- **Tailwind v4 duration utilities.** Named durations are registered under the
  `--transition-duration-*` theme namespace (aliasing the canonical
  `--duration-*` tokens) so `duration-quick` / `duration-base` utilities resolve;
  v4 has no `--duration-*` → `duration-*` mapping.

- **Scope of this session: M0 + M1 only.** Both are pure-code and need no
  founder browser tasks. M2+ begins to require live Supabase/Stripe/Cloudflare
  credentials, so stopping at a green, demoable M0+M1 is the correct first slice.

## 2026-08-09 (M2)

- **Ops auth = Supabase email+password** (not magic-link/OTP). M2 only needs a
  role gate; full trekker/guide auth is M4. Email+password is the simplest thing
  that's verifiable headlessly. `@supabase/ssr` handles cookie sessions; a
  service-role admin client does the privileged ops reads/writes.

- **Adopted Supabase's grant model (`0010_grants.sql`).** Roles hold broad table
  privileges and RLS is the only gate — matching how Supabase cloud is
  configured — so `service_role` (and `authenticated`/`anon`) behave locally
  exactly as in production. Our tables are RLS-enabled default-deny, so this
  doesn't widen exposure.

- **Guard triggers allow `service_role`/`postgres`.** The column-guard and
  publish-guard triggers key off `is_ops()` (which needs `auth.uid()`); the ops
  console writes as the service role, so the guards now also pass privileged DB
  roles. End-user (authenticated) guides are still fully guarded.

- **Local verification stack is partial by necessity.** The sandbox can't run
  the full `supabase start` (an rlimit restriction kills analytics/edge-runtime),
  so we run db+kong+rest+auth via `supabase start -x …`. That covers everything
  M2 needs. The `@supabase/pg-delta` TLS warning during `db reset` is non-fatal
  (migration-catalog caching only) — migrations and seed apply fine.

## 2026-08-09 (M4)

- **Email OTP (6-digit code), not magic-link redirect, for trekkers.** Same
  friction class, but stateless to verify (no PKCE code-exchange callback),
  Workers-friendly, and testable headlessly. The spec said "magic link"; OTP is
  the simpler equivalent and can switch later. Guides use phone OTP (spec).
- **The guide application creates the auth user up front** (phone-keyed, via the
  admin API) so the applicant has an identity to sign in with later and ops has a
  real row to verify. The guides insert is rolled back (auth user deleted) on
  failure so a phone can retry.
- **Guide photos/bio stay ops-authored** (per docs/01) — the application collects
  facts (licence, rate, languages, hook line), not media; ops adds photos/bio to
  keep the quality bar. Photo upload is therefore not in the application form.
