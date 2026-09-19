import type { Route } from "./+types/api.guide-voice";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";

/** What the bucket accepts, mirrored here so a bad file is refused before the
    round trip to storage rather than as an opaque error afterwards. */
const AUDIO = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
]);

const EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

/**
 * A guide's voice introduction.
 *
 * Audio carries none of the location metadata a photograph does, so unlike the
 * photo endpoint there is nothing to strip — the file goes up as recorded. The
 * guide folder is what the storage policy checks.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, profile, admin, headers } = await requireUser(request, env);
  if (profile.role !== "guide" && profile.role !== "ops") {
    return Response.json({ error: "Not allowed." }, { status: 403, headers });
  }

  const form = await request.formData();
  const file = form.get("file");
  const requestedGuideId = String(form.get("guide_id") ?? user.id);
  const guideId = profile.role === "ops" ? requestedGuideId : user.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guideId)) {
    return Response.json({ error: "Unknown guide." }, { status: 400, headers });
  }
  if (profile.role === "ops") {
    const { data: guide } = await admin.from("guides").select("user_id").eq("user_id", guideId).maybeSingle();
    if (!guide) return Response.json({ error: "Unknown guide." }, { status: 404, headers });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "No recording." }, { status: 400, headers });
  }
  if (file.size > 8 * 1024 * 1024) {
    return Response.json(
      { error: "That recording is over 8 MB. Keep it to about a minute." },
      { status: 400, headers },
    );
  }
  const type = file.type || "audio/mpeg";
  if (!AUDIO.has(type)) {
    return Response.json(
      { error: "Sound files only — a voice memo from your phone works." },
      { status: 400, headers },
    );
  }

  const path = `${guideId}/${Date.now()}.${EXT[type] ?? "m4a"}`;
  const { error } = await admin.storage
    .from("guide-audio")
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: type,
      upsert: false,
    });
  if (error) {
    return Response.json({ error: error.message }, { status: 400, headers });
  }

  const { data } = admin.storage.from("guide-audio").getPublicUrl(path);
  return Response.json({ url: data.publicUrl }, { headers });
}
