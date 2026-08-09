import { Link } from "react-router";

export function Footer({
  routes,
}: {
  routes: Array<{ slug: string; name: string }>;
}) {
  return (
    <footer className="mt-16 border-t border-border bg-himalaya text-white/90">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg text-white">Trek.</p>
          <p className="mt-2 text-sm text-white/70">
            Pick your guide, not your agency.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-white">Popular routes</p>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {routes.map((r) => (
              <li key={r.slug}>
                <Link to={`/routes/${r.slug}`} className="hover:text-white">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-white">Company</p>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            <li>
              <Link to="/transparency" className="hover:text-white">
                Transparent pricing
              </Link>
            </li>
            <li>
              <Link to="/safety" className="hover:text-white">
                Trust &amp; safety
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-white">Browse</p>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            <li>
              <Link to="/guides" className="hover:text-white">
                Find your guide
              </Link>
            </li>
            <li>
              <Link to="/experiences" className="hover:text-white">
                Browse experiences
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} Trek. A guide-first marketplace for Nepal.
      </div>
    </footer>
  );
}
