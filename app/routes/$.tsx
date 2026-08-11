import type { Route } from "./+types/$";
import { Link } from "react-router";
import { redirect } from "react-router";
import { createPublicClient, getEnv } from "~/lib/supabase.server";

// Catch-all: resolve the redirects table (301) first, else 404 (docs/02 §SEO).
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const path = new URL(request.url).pathname;
  const { data } = await client
    .from("redirects")
    .select("to_path")
    .eq("from_path", path)
    .maybeSingle();
  if (data?.to_path) throw redirect(data.to_path, 301);
  // Return (not throw) so the page renders INSIDE the public layout with
  // header/footer — a thrown 404 falls to the root error boundary, chrome-less.
  return new Response(null, { status: 404 });
}

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="label text-muted">404</p>
      <h1 className="mt-2 font-display text-4xl text-ink">
        This trail doesn't exist.
      </h1>
      <p className="mt-3 text-ink-soft">
        The page you're after isn't here. The mountains are, though.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          to="/match"
          className="inline-block bg-moss px-5 py-3 font-medium text-white hover:bg-pine"
        >
          Match me with a guide
        </Link>
        <Link
          to="/routes"
          className="inline-block border border-line px-5 py-3 font-medium text-ink hover:bg-mist"
        >
          Browse routes
        </Link>
      </div>
    </main>
  );
}
