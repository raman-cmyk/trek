import { redirect } from "react-router";
import type { Route } from "./+types/g.doc.$docId";
import { signedGuideDocumentUrl } from "~/lib/documents.server";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";

/**
 * A guide opens one of their own papers.
 *
 * Until now only `/ops/doc/:kind/:docId` existed, behind `requireOps`, so a
 * guide could upload nothing and see nothing. Asking somebody to send us a
 * photograph of their bank QR and then never showing it back is how you get a
 * guide who cannot tell whether the wrong one is on file.
 *
 * Two rules, both copied from the ops route on purpose:
 *
 *   - A redirect, never a rendered URL. An action's result is serialised into
 *     the page, which would leave a live link to a private document sitting
 *     in the HTML and in the browser's history (CLAUDE.md rule 9).
 *   - Every view is logged. `signedGuideDocumentUrl` writes the access-log row
 *     itself; the purpose says this was the guide looking at their own file,
 *     which is a different fact from the office reviewing it.
 *
 * And one rule of its own: the document must belong to the guide asking. The
 * id is a uuid in a URL, and the only thing standing between a guessed one and
 * somebody else's passport is this check.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin } = await requireUser(request, env, "guide");

  const { data: doc } = await admin
    .from("guide_documents")
    .select("id, guide_id")
    .eq("id", params.docId!)
    .maybeSingle();

  // Same answer for "no such document" and "not yours", so this cannot be used
  // to discover which ids exist.
  if (!doc || doc.guide_id !== user.id) {
    throw new Response("That document is gone.", { status: 404 });
  }

  const url = await signedGuideDocumentUrl(admin, doc.id, user.id, "guide_self");
  if (!url) throw new Response("That document is gone.", { status: 404 });
  return redirect(url);
}
