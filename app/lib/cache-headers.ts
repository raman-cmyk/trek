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
        // Shared caches hold it; the browser always checks in first.
        //
        // Thirty minutes, not five, and stale-while-revalidate for a day.
        // These pages are a catalogue that changes when a guide edits a trip,
        // not a feed. At five minutes the edge was re-rendering the homepage
        // twelve times an hour, and a cold render of this page costs enough
        // CPU that 6% of them were dying with "Worker exceeded resource
        // limits" — the error a visitor sees as a blank page.
        //
        // stale-while-revalidate is the half that matters: once a page is in
        // the cache, a visitor is handed it instantly and the refresh happens
        // behind them. A slow render, or a failed one, stops being something
        // anybody waits for.
        "Cache-Control":
          "public, s-maxage=1800, stale-while-revalidate=86400, stale-if-error=86400, max-age=0, must-revalidate",
      };
}
