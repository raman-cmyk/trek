import { Form, Link, NavLink } from "react-router";
import { cn } from "~/lib/cn";
import { copy } from "~/lib/copy";
import { useMoney } from "~/lib/currency-context";
import { DISPLAY_CURRENCIES, type CurrencyCode } from "~/lib/currency";

export function Header({
  account,
}: {
  account?: { firstName: string; role: string } | null;
}) {
  const { code, setCode } = useMoney();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="font-display text-xl text-ink">
          Trek<span className="text-primary">.</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <select
            aria-label="Display currency"
            value={code}
            onChange={(e) => setCode(e.target.value as CurrencyCode)}
            className="mr-1 rounded-pill border border-line bg-card px-2 py-1 font-mono text-xs text-ink"
          >
            {DISPLAY_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <NavLink
            to="/guides"
            prefetch="intent"
            className={({ isActive }) =>
              cn(
                "rounded-pill px-3 py-1.5",
                isActive ? "bg-primary/10 text-primary" : "text-ink hover:bg-black/5",
              )
            }
          >
            {copy.home.ctaFindGuide}
          </NavLink>
          <NavLink
            to="/experiences"
            prefetch="intent"
            className={({ isActive }) =>
              cn(
                "rounded-pill px-3 py-1.5",
                isActive ? "bg-primary/10 text-primary" : "text-ink hover:bg-black/5",
              )
            }
          >
            {copy.home.ctaBrowse}
          </NavLink>

          {account ? (
            <>
              {(() => {
                const dash =
                  account.role === "guide"
                    ? { to: "/g", label: "Dashboard" }
                    : account.role === "ops"
                      ? { to: "/ops", label: "Ops" }
                      : { to: "/trips", label: "My trips" };
                return (
                  <NavLink
                    to={dash.to}
                    prefetch="intent"
                    className={({ isActive }) =>
                      cn(
                        "rounded-pill px-3 py-1.5",
                        isActive ? "bg-primary/10 text-primary" : "text-ink hover:bg-black/5",
                      )
                    }
                  >
                    {dash.label}
                  </NavLink>
                );
              })()}
              <span className="ml-1 hidden text-muted sm:inline">Hi, {account.firstName}</span>
              <Form method="post" action="/logout">
                <button className="rounded-full border border-line px-3 py-1.5 text-ink hover:bg-mist">
                  Sign out
                </button>
              </Form>
            </>
          ) : (
            <>
              <Link to="/login" prefetch="intent" className="rounded-pill px-3 py-1.5 text-ink hover:bg-black/5">
                Sign in
              </Link>
              <Link
                to="/signup"
                prefetch="intent"
                className="ml-1 rounded-full bg-moss px-4 py-1.5 font-medium text-white hover:bg-pine"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
