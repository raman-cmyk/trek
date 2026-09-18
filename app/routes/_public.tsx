import { Outlet, data } from "react-router";
import { organizationLd } from "~/lib/seo";
import type { Route } from "./+types/_public";
import { Header } from "~/components/public/Header";
import { Footer } from "~/components/public/Footer";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getProfile, getSessionUser } from "~/lib/auth.server";
import { TripIntentDialog } from "~/components/public/TripIntentDialog";
import { ReviewPrompt } from "~/components/public/ReviewPrompt";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const [{ data: routes }, { data: faces }, { count: journalCount }, { data: led }, { user }] =
    await Promise.all([
      // region + altitude group the footer's route list; day_stops draws the
      // profile the footer's top edge is cut from.
      client
        .from("routes")
        .select("id, slug, name, region, max_altitude_m, typical_days, day_stops")
        .order("name"),
      // The face wall. Ordered by user_id rather than at random so the strip
      // is stable across a session — a footer that reshuffles on every
      // navigation reads as a glitch, not as life.
      client
        .from("public_guides")
        .select("user_id, slug, full_name, avatar_url")
        .order("user_id"),
      client
        .from("public_journals")
        .select("id", { count: "exact", head: true }),
      // Which routes anyone actually leads. The footer listed all 24, and
      // Api Base Camp and Rara Lake have no guide on them — a link into a
      // page with nothing to book, in the one place on the site that exists
      // to send people somewhere useful.
      client.from("public_offerings").select("route_id"),
      getSessionUser(request, env),
    ]);
  // Reflect the signed-in customer in the header (trips + sign out + unread).
  let account: { firstName: string; role: string; unread: number; news: number } | null = null;
  if (user) {
    const profile = await getProfile(env, user.id);
    if (profile) {
      const { createAdminClient } = await import("~/lib/supabase.server");
      const { countUnread } = await import("~/lib/unread.server");
      const admin = createAdminClient(env);
      const [{ unreadTotal }, { count: news }] = await Promise.all([
        countUnread(admin, user.id),
        // The bell's number. A count, not the rows — this runs on every page
        // load for every signed-in person, and there is a partial index on
        // exactly this predicate.
        admin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null),
      ]);
      account = {
        firstName: (profile.full_name ?? "").split(" ")[0] || "You",
        role: profile.role,
        unread: unreadTotal,
        news: news ?? 0,
      };
    }
  }
  // Whether this document is personalised. Every public page renders inside
  // this layout, and the header shows the signed-in customer's name, trips
  // and unread count — so a page cached as `public` would hand one person's
  // header to the next visitor. Leaf routes read this to decide whether they
  // may be shared-cached at all.
  return data(
    {
      origin: new URL(request.url).origin,
      // Routes a guide actually leads come first in their region group; the
      // rest keep their link.
      //
      // Pratik's note was that the footer sends people to Api Base Camp and
      // Rara Lake, which nobody leads — a link with nothing to book at the
      // end of it. True, and worse than he could see: SEVENTEEN of the
      // twenty-four have no offering, Annapurna Base Camp and Ghorepani Poon
      // Hill among them. Hiding them would have cut the footer to seven
      // links, and this footer is a real part of how route pages get found
      // on a site whose primary demand channel is search. That is a supply
      // problem to fix in the roster, not a rendering problem to hide: those
      // pages still carry the day-by-day, the permits and the altitude, and
      // they can rank. So the ones you can book lead, and the rest follow.
      routes: (() => {
        const withGuide = new Set((led ?? []).map((o: any) => o.route_id));
        const all = (routes ?? []) as any[];
        return [
          ...all.filter((r) => withGuide.has(r.id)),
          ...all.filter((r) => !withGuide.has(r.id)),
        ];
      })(),
      footer: {
        faces: (faces ?? []).map((g) => ({
          slug: g.slug,
          name: g.full_name,
          avatar_url: g.avatar_url,
        })),
        guideCount: (faces ?? []).length,
        journalCount: journalCount ?? 0,
        routeCount: (routes ?? []).length,
        // Whether the footer may claim a card is accepted. Read from the
        // worker's own config rather than a constant, so the claim appears
        // the day payment works and not a day before.
        paymentsLive: Boolean(env.STRIPE_PUBLISHABLE_KEY),
      },
      account,
    },
    { headers: { "x-personalised": account ? "1" : "0" } },
  );
}


/**
 * Pass the personalised flag down. A child route's `parentHeaders` is the
 * parent's `headers()` return value — not its loader headers — so without
 * this the flag never reached the pages that depend on it and a signed-in
 * document was being labelled `public`.
 */
export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return { "x-personalised": loaderHeaders.get("x-personalised") ?? "0" };
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* The publisher node, once for the whole public site — an agent
          resolving "who is Trek" follows the @id from any page.

          Rendered here rather than from this layout's `meta` export: a child
          route's meta replaces its parent's wholesale, so every page that
          exports its own meta (which is all of them) silently dropped it. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // Escaped, like every other JSON-LD block on the site. Everything
          // else goes through React Router's meta, which runs escapeHtml over
          // the serialised graph; this one is hand-rolled and did not. A URL
          // origin cannot actually carry "</script>", so this was not
          // exploitable — but it is the one script on the page whose safety
          // rests on that argument rather than on escaping, and the next
          // person to add a field here would not know.
          __html: JSON.stringify(organizationLd(loaderData.origin)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <Header account={loaderData.account} />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer routes={loaderData.routes} data={loaderData.footer} />

      {/* "When are you coming to Nepal?", three seconds in, once per browser,
          and never to somebody who already has an account with us. Mounted
          here rather than on the homepage because most first visits arrive
          from search on a guide or a route, not on the front door. */}
      <TripIntentDialog signedIn={Boolean(loaderData.account)} />

      {/* And its opposite number: for people who DO have an account, asking
          about the walk they have just finished. Mounted here for the same
          reason — signing in lands you on the homepage, not on My trips. It
          asks the server nothing until it has waited, checked the page is a
          decent one to interrupt, and found it has not already asked. */}
      <ReviewPrompt signedIn={Boolean(loaderData.account)} />
    </div>
  );
}
