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
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "./app.css";

export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
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
  return <Outlet />;
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
