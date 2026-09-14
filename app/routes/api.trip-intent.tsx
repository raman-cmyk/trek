import type { Route } from "./+types/api.trip-intent";
import { getEnv } from "~/lib/supabase.server";
import { recordTripIntent } from "~/lib/trip-intent.server";
import { isIntentMode } from "~/lib/trip-intent";

/**
 * Where the "when are you coming to Nepal?" popup posts.
 *
 * A resource route rather than an action on the homepage, because the popup
 * is mounted on every public page and the answer must not depend on which one
 * a person happened to land on.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Use POST." }, { status: 405 });
  }

  const form = await request.formData();
  const mode = String(form.get("mode") ?? "");
  const result = await recordTripIntent(
    getEnv(context),
    {
      mode: isIntentMode(mode) ? mode : ("unsure" as const),
      start: str(form.get("start")),
      end: str(form.get("end")),
      season: str(form.get("season")),
      email: String(form.get("email") ?? ""),
      partySize: str(form.get("partySize")),
    },
    {
      sourcePath: str(form.get("sourcePath")),
      // Where they came from, from the header rather than the form: a value
      // the page could set is a value anybody can set.
      referrer: request.headers.get("referer"),
    },
  );

  return Response.json(result, { status: result.ok ? 200 : 400 });
}

/**
 * Nothing to GET here. Without this a crawler that finds the URL gets a
 * framework error page instead of an answer.
 */
export async function loader() {
  return Response.json({ ok: false, error: "Nothing to see here." }, { status: 405 });
}

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
