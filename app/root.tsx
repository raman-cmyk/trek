import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import type { Route } from "./+types/root";

// Self-hosted variable fonts (no runtime CDN — CSP/Cloudflare friendly).
// Bricolage Grotesque = display, JetBrains Mono = figures. Body and UI are
// Helvetica, which is a system stack and so has nothing to import — that is
// one fewer webfont on every page, not an oversight. (The old comment here
// still named Fraunces, which this project has not used for a long time.)
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import "./app.css";
import { CurrencyProvider } from "~/lib/currency-context";
import { CHUNK_RECOVERY_SCRIPT } from "~/lib/chunk-recovery";

export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* The site had no icon of any kind. Browsers ask for /favicon.ico
            without being told to, so that was a 404 in the console on every
            page of the site, and every tab, bookmark and phone home screen
            showed a blank sheet for a company whose entire argument is that
            you can trust it. The .ico is there for that automatic request;
            the SVG is what a modern browser actually draws. */}
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#1b3b2a" />
        <Meta />
        <Links />
        {/* Must be inline and before the bundles: a module that 404s never
            runs, so only a classic script already executing can notice that
            the page's JavaScript is missing. See chunk-recovery.ts. */}
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_SCRIPT }} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <CurrencyProvider>
      <Outlet />
    </CurrencyProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  let message = "Something went wrong";
  let details =
    "An unexpected error tripped us up. Our team has been notified — please try again in a moment.";

  if (isRouteErrorResponse(error)) {
    message = is404 ? "Trail not found" : "Something went wrong";
    details = is404
      ? "We couldn't find that page. Try finding your guide instead."
      : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    // Full stack in dev only — never leak internals to trekkers in production.
    details = error.message;
  }

  // Log unexpected (non-HTTP, i.e. 5xx) errors server-side so they're
  // observable in Cloudflare logs. Route responses (404/redirects) are expected.
  if (typeof document === "undefined" && !isRouteErrorResponse(error)) {
    console.error("[root ErrorBoundary]", error);
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-display text-6xl text-primary">{is404 ? "404" : "500"}</p>
      <h1 className="mt-4 font-display text-3xl text-ink">{message}</h1>
      <p className="mt-3 text-ink-soft">{details}</p>
      <Link
        to={is404 ? "/guides" : "/"}
        className="mt-8 inline-block rounded-button bg-primary px-5 py-3 font-medium text-white hover:bg-primary-hover"
      >
        {is404 ? "Find your guide" : "Back to home"}
      </Link>
    </main>
  );
}
