import { Link } from "react-router";
import { Ridgeline } from "./Ridgeline";

export function Footer({
  routes,
}: {
  routes: Array<{ slug: string; name: string }>;
}) {
  return (
    <>
      {/* Ridgeline cuts up into the previous paper section (§6, placement 3). */}
      <Ridgeline fill="pine" flip className="mt-16" />
      <footer className="bg-pine text-sage">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-lg text-paper">
              Trek<span className="text-moss">.</span>
            </p>
            <p className="mt-2 text-sm text-sage">
              Pick your guide, not your agency.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-paper">Popular routes</p>
            <ul className="mt-2 space-y-1 text-sm">
              {routes.map((r) => (
                <li key={r.slug}>
                  <Link to={`/routes/${r.slug}`} className="hover:text-fern">
                    {r.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/routes" className="font-medium hover:text-fern">
                  All routes →
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-paper">Company</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <Link to="/transparency" className="hover:text-fern">
                  Transparent pricing
                </Link>
              </li>
              <li>
                <Link to="/trust" className="hover:text-fern">
                  How verification works
                </Link>
              </li>
              <li>
                <Link to="/insurance" className="hover:text-fern">
                  Insurance checker
                </Link>
              </li>
              <li>
                <Link to="/fund" className="hover:text-fern">
                  The Fund
                </Link>
              </li>
              <li>
                <Link to="/stories" className="hover:text-fern">
                  Trek stories
                </Link>
              </li>
              <li>
                <Link to="/hosts" className="hover:text-fern">
                  Guide on Trek
                </Link>
              </li>
              <li>
                <Link to="/safety" className="hover:text-fern">
                  Trust &amp; safety
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-paper">Browse</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <Link to="/guides" className="hover:text-fern">
                  Find your guide
                </Link>
              </li>
              <li>
                <Link to="/experiences" className="hover:text-fern">
                  Browse experiences
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-fern/20 py-4 text-center text-xs text-sage/70">
          © {new Date().getFullYear()} Trek. A guide-first marketplace for Nepal.
        </div>
      </footer>
    </>
  );
}
