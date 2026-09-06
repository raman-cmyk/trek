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
    : { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" };
}
