import { redirect } from "react-router";
import type { Route } from "./+types/ops.doc.$kind.$docId";
import { signedDocumentUrl, signedGuideDocumentUrl } from "~/lib/documents.server";
import { getEnv, requireOps } from "~/lib/supabase.server";

/**
 * Open one document. The office follows a plain link; the server mints a
 * ten-minute signed URL, writes a line to the access log, and redirects.
 *
 * A redirect rather than an action returning the URL: an action's result is
 * serialised into the page, which would leave a live link to somebody's
 * passport sitting in the HTML and in the browser's history. This way the URL
 * exists only in the redirect and is never rendered, stored or logged
 * (CLAUDE.md rule 9).
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin } = await requireOps(request, env);

  const url =
    params.kind === "guide"
      ? await signedGuideDocumentUrl(admin, params.docId!, user.id, "ops_review")
      : params.kind === "booking"
        ? await signedDocumentUrl(admin, params.docId!, user.id)
        : null;

  if (!url) throw new Response("That document is gone.", { status: 404 });
  return redirect(url);
}
