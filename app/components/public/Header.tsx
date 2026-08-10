import { Link, NavLink } from "react-router";
import { cn } from "~/lib/cn";
import { copy } from "~/lib/copy";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="font-display text-xl text-ink">
          Trek<span className="text-primary">.</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
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
          <Link
            to="/signup"
            prefetch="intent"
            className="ml-1 rounded-full bg-moss px-4 py-1.5 font-medium text-white hover:bg-pine"
          >
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}
