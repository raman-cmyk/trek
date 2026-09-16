/**
 * Recover a page whose JavaScript was deleted out from under it.
 *
 * Public HTML is cached at the edge for 300s (cache-headers.ts). Client
 * bundles are content-hashed, and a deploy REPLACES them — the old filenames
 * stop existing. So for up to five minutes after every deploy, a visitor can
 * be handed cached HTML that asks for `/assets/root-DletlmBN.js` when the
 * worker now only has `root-ex2jCeV9.js`. Measured on production, not
 * theorised: that exact pair.
 *
 * What the visitor gets is the server-rendered page with no JavaScript at all
 * — no map, no calendar, no filters, no booking widget, nothing that needs
 * hydration — and no error they can see. The site simply feels broken, which
 * is how it has been reported.
 *
 * This has to be an inline script in the document. A module that 404s never
 * runs, so nothing loaded as a module can catch its own absence; only a
 * classic inline script is still executing when the script tag fails.
 *
 * The reload carries a cache-buster, because a plain reload revalidates
 * against the same edge cache that served the stale document and would hand
 * back the same broken page. The parameter is removed from the URL once the
 * fresh page is up, so nobody sees it or shares it. One attempt per tab,
 * guarded in sessionStorage, so a genuinely missing asset cannot put the
 * browser in a loop.
 */
export const CHUNK_RECOVERY_KEY = "gon:chunk-retry";
export const CHUNK_RECOVERY_PARAM = "_fresh";

export const CHUNK_RECOVERY_SCRIPT = `(function(){
  var K=${JSON.stringify(CHUNK_RECOVERY_KEY)},P=${JSON.stringify(CHUNK_RECOVERY_PARAM)};
  function ss(){try{return sessionStorage}catch(e){return null}}
  var s=ss();
  try{
    var u=new URL(location.href);
    if(u.searchParams.has(P)){
      u.searchParams.delete(P);
      history.replaceState(history.state,"",u.pathname+(u.search||"")+u.hash);
    }
  }catch(e){}
  addEventListener("error",function(e){
    var t=e&&e.target;
    if(!t||t.tagName!=="SCRIPT"||!t.src)return;
    if(t.src.indexOf("/assets/")===-1)return;
    if(s&&s.getItem(K))return;
    try{if(s)s.setItem(K,"1")}catch(err){}
    try{
      var u2=new URL(location.href);
      u2.searchParams.set(P,String(Date.now()));
      location.replace(u2.toString());
    }catch(err){location.reload()}
  },true);
  addEventListener("load",function(){try{if(s)s.removeItem(K)}catch(e){}});
})();`;
