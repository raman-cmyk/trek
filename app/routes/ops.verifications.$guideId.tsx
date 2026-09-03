import { redirect } from "react-router";
import type { Route } from "./+types/ops.verifications.$guideId";

/**
 * The verification screen moved.
 *
 * There were two pages judging the same guide and they had drifted: this one
 * held Approve/Reject, the person page held the documents, the notes and the
 * access log. Whoever was on shift could pass a licence check on a screen that
 * could not show them the licence.
 *
 * The person page is now the whole file, so this is a redirect — old links,
 * bookmarks and the queue's own rows all still land somewhere useful.
 */
export function loader({ params }: Route.LoaderArgs) {
  return redirect(`/ops/people/${params.guideId}?t=verification`);
}
