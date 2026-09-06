/**
 * The cache policy for public pages.
 *
 * Every public page renders inside the _public layout, whose header carries
 * the signed-in customer's name, their trips link and their unread count. So
 * a page marked `public` is a page whose next visitor may be handed somebody
 * else's header — which is what several routes were already doing.
 *
 * The layout stamps `x-personalised` on its loader response. Anonymous
 * visitors — nearly all traffic, and every crawler — get a real shared cache;
 * anyone signed in gets nothing shared at all.
 */
export function publicCacheHeaders({ parentHeaders }: { parentHeaders: Headers }) {
  return parentHeaders.get("x-personalised") === "1"
    ? { "Cache-Control": "private, no-store" }
    : {
        // s-maxage, not max-age. `max-age` applies to the visitor's own
        // browser, so after signing in or out they were shown the page from
        // the other side of that change for the next five minutes — which
        // reads exactly like "I signed out and it signed me back in".
        // Shared caches (the Worker's own) still hold it for 300s; the
        // browser always checks in first.
        "Cache-Control": "public, s-maxage=300, max-age=0, must-revalidate",
      };
}
