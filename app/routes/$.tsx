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
  throw new Response("Not found", { status: 404 });
}

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-4xl text-ink">Not found</h1>
      <p className="mt-3 text-ink-soft">
        We couldn’t find that page. Try finding your guide instead.
      </p>
      <Link
        to="/guides"
        className="mt-6 inline-block rounded-button bg-primary px-5 py-3 font-medium text-white"
      >
        Find your guide
      </Link>
    </main>
  );
}
