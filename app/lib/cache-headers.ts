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
        // 30 minutes at the edge, and a day of serving the old copy while the
        // new one is fetched behind the reader.
        //
        // This was 300s. Every miss is a full render — nine queries and the
        // whole page built again — and Cloudflare has been killing 2-3% of
        // requests with "exceeded resources", which is the worker running out
        // of CPU doing exactly that. Six times fewer renders is the largest
        // lever available without spending money.
        //
        // It is only safe now. Stale HTML outliving a deploy meant a document
        // asking for a bundle that deploy had deleted — the page rendered and
        // then did nothing at all. chunk-recovery.ts catches that and reloads
        // once, so a longer window no longer means a longer outage.
        //
        // stale-if-error matters on its own: if the worker fails, a reader
        // gets yesterday's page rather than Cloudflare's error screen.
        "Cache-Control":
          "public, s-maxage=1800, stale-while-revalidate=86400, stale-if-error=86400, max-age=0, must-revalidate",
      };
}
