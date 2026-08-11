import { useEffect, useState } from "react";
import { Form, Link, NavLink, useLocation } from "react-router";
import { cn } from "~/lib/cn";
import { useMoney } from "~/lib/currency-context";
import { DISPLAY_CURRENCIES, type CurrencyCode } from "~/lib/currency";

/**
 * The masthead.
 *
 * The old one was a single flat row of seven identical pills plus a raw
 * <select> for currency — no hierarchy, so nothing read as primary, and on a
 * phone the whole thing wrapped onto two lines. Three zones now, and they mean
 * different things:
 *
 *   left    the wordmark, and nothing competing with it
 *   centre  where to go — the four browse destinations, as plain text with a
 *           rule under the current one. Pills on navigation make every link
 *           look like a button.
 *   right   who you are, and the one action. Exactly one filled control.
 *
 * Under `lg` the centre collapses into a sheet rather than wrapping, because a
 * two-line header on a 360px phone eats a fifth of the screen before any
 * content appears.
 */

const BROWSE = [
  { to: "/guides", label: "Guides" },
  { to: "/experiences", label: "Experiences" },
  { to: "/routes", label: "Routes" },
  { to: "/journals", label: "Stories" },
];

export function Header({
  account,
}: {
  account?: { firstName: string; role: string; unread?: number } | null;
}) {
  const { code, setCode } = useMoney();
  const [menu, setMenu] = useState(false);
  const location = useLocation();

  // Any navigation closes the sheet — including a back button, which is the
  // one an onClick handler on each link would miss.
  useEffect(() => setMenu(false), [location.key]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = menu ? "hidden" : prev;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menu]);

  const dash =
    account?.role === "guide"
      ? { to: "/g", label: "Dashboard" }
      : account?.role === "ops"
        ? { to: "/ops", label: "Ops" }
        : { to: "/trips", label: "My trips" };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16">
        <Link
          to="/"
          className="shrink-0 font-display text-[22px] leading-none tracking-[-0.03em] text-ink sm:text-2xl"
        >
          Trek<span className="text-moss">.</span>
        </Link>

        {/* ── Centre: where to go ─────────────────────────────────────────── */}
        <nav className="ml-4 hidden items-center gap-6 lg:flex">
          {BROWSE.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              prefetch="intent"
              className={({ isActive }) =>
                cn(
                  "relative py-1 text-[15px] transition-colors",
                  // A 2px rule under the current section, not a filled pill.
                  "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-[2px] after:origin-left after:scale-x-0 after:bg-moss after:transition-transform after:duration-quick",
                  isActive
                    ? "font-medium text-ink after:scale-x-100"
                    : "text-ink-soft hover:text-ink",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Currency: a quiet control, not a browser form widget. The native
              select is kept underneath for keyboard and mobile pickers — it is
              simply made invisible over the label it drives. */}
          <label className="relative hidden items-center sm:inline-flex">
            <span className="pointer-events-none rounded-pill px-2.5 py-1.5 font-mono text-xs text-ink-soft transition-colors hover:text-ink">
              {code}
            </span>
            <select
              aria-label="Display currency"
              value={code}
              onChange={(e) => setCode(e.target.value as CurrencyCode)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {DISPLAY_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {account ? (
            <>
              <NavLink
                to="/messages"
                prefetch="intent"
                aria-label={
                  account.unread ? `Messages, ${account.unread} unread` : "Messages"
                }
                className={({ isActive }) =>
                  cn(
                    "relative rounded-full p-2 transition-colors",
                    isActive ? "bg-mist text-moss" : "text-ink-soft hover:bg-mist hover:text-ink",
                  )
                }
              >
                <MailGlyph />
                {!!account.unread && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ember ring-2 ring-paper" />
                )}
              </NavLink>

              {account.role !== "guide" && account.role !== "ops" && (
                <NavLink
                  to="/groups"
                  prefetch="intent"
                  className={({ isActive }) =>
                    cn(
                      "hidden rounded-pill px-3 py-1.5 text-[15px] transition-colors lg:inline-block",
                      isActive ? "text-ink" : "text-ink-soft hover:text-ink",
                    )
                  }
                >
                  Groups
                </NavLink>
              )}

              <NavLink
                to={dash.to}
                prefetch="intent"
                className="hidden rounded-pill border border-line px-3.5 py-1.5 text-[15px] font-medium text-ink transition-colors hover:border-sage sm:inline-block"
              >
                {dash.label}
              </NavLink>

              <Form method="post" action="/logout" className="hidden lg:block">
                <button
                  className="rounded-pill px-2.5 py-1.5 text-[15px] text-ink-soft transition-colors hover:text-ink"
                  title={`Signed in as ${account.firstName}`}
                >
                  Sign out
                </button>
              </Form>
            </>
          ) : (
            <>
              {/* The guide side of the marketplace, in the masthead where a
                  guide can actually find it. Hidden on phones — a trekker on
                  a 360px screen does not need it, and a guide will scroll. */}
              <Link
                to="/apply"
                prefetch="intent"
                className="hidden rounded-pill px-3 py-1.5 text-[15px] text-ink-soft transition-colors hover:text-ink lg:inline-block"
              >
                Guide with us
              </Link>
              <Link
                to="/login"
                prefetch="intent"
                className="hidden rounded-pill px-3 py-1.5 text-[15px] text-ink transition-colors hover:bg-mist sm:inline-block"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                prefetch="intent"
                className="rounded-pill bg-pine px-4 py-2 text-[15px] font-medium text-paper transition-colors hover:bg-moss"
              >
                Sign up
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-expanded={menu}
            aria-label={menu ? "Close menu" : "Open menu"}
            className="-mr-1 rounded-full p-2 text-ink transition-colors hover:bg-mist lg:hidden"
          >
            {menu ? <CloseGlyph /> : <MenuGlyph />}
          </button>
        </div>
      </div>

      </header>

      {/* ── The sheet ─────────────────────────────────────────────────────
          A sibling of the header, not a child. `backdrop-blur` on the header
          creates a containing block, so a `fixed` element inside it is
          positioned against the header rather than the viewport — the sheet
          rendered as a 56px-tall sliver and the page showed straight through
          it. Nothing about the CSS looks wrong until you know that rule. */}
      {menu && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto bg-paper lg:hidden">
          <nav className="mx-auto max-w-6xl px-4 py-6">
            <ul className="divide-y divide-line border-y border-line">
              {BROWSE.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className="flex items-center justify-between py-4 font-display text-2xl tracking-[-0.02em] text-ink"
                  >
                    {item.label}
                    <span aria-hidden className="text-sage">
                      →
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {account ? (
                <>
                  <Link
                    to={dash.to}
                    className="rounded-pill border border-line px-4 py-2 text-[15px] font-medium text-ink"
                  >
                    {dash.label}
                  </Link>
                  {account.role !== "guide" && account.role !== "ops" && (
                    <Link
                      to="/groups"
                      className="rounded-pill border border-line px-4 py-2 text-[15px] text-ink"
                    >
                      Groups
                    </Link>
                  )}
                  <Form method="post" action="/logout">
                    <button className="rounded-pill px-3 py-2 text-[15px] text-ink-soft">
                      Sign out
                    </button>
                  </Form>
                </>
              ) : (
                <>
                  <Link
                    to="/signup"
                    className="rounded-pill bg-pine px-4 py-2 text-[15px] font-medium text-paper"
                  >
                    Sign up
                  </Link>
                  <Link
                    to="/login"
                    className="rounded-pill border border-line px-4 py-2 text-[15px] text-ink"
                  >
                    Sign in
                  </Link>
                </>
              )}
              <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted">
                Currency
                <select
                  aria-label="Display currency"
                  value={code}
                  onChange={(e) => setCode(e.target.value as CurrencyCode)}
                  className="rounded-pill border border-line bg-card px-2.5 py-1 font-mono text-xs text-ink"
                >
                  {DISPLAY_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!account && (
              <Link
                to="/apply"
                className="mt-6 block rounded-md border border-line bg-card p-4"
              >
                <span className="block font-medium text-ink">Are you a guide?</span>
                <span className="mt-0.5 block text-sm text-muted">
                  Licensed guides keep their own rate. Apply in ten minutes.
                </span>
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}

function MailGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 6l7 4.5L17 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MenuGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M3 7h16M3 15h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M5.5 5.5l11 11M16.5 5.5l-11 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
