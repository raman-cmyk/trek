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
