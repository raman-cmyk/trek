import type { Route } from "./+types/api.journal-photo";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { sanitizeImage } from "~/lib/exif";

/**
 * Journal photo upload.
 *
 * A guide uploads straight off their phone, so the file arrives carrying the
 * coordinates of every teahouse and campsite on the trek. We rebuild accepted
 * image containers from an allowlist before anything is stored.
 *
 * Anything we cannot parse is refused rather than stored: "we could not read
 * it, so we could not clean it" is the only safe answer for a file that is
 * about to be published on a public page.
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
    return Response.json({ error: "No file." }, { status: 400, headers });
  }
  if (file.size > 10 * 1024 * 1024) {
    return Response.json(
      { error: "That photo is over 10 MB. Send a smaller one." },
      { status: 400, headers },
    );
  }

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf as ArrayBuffer);
  const cleaned = sanitizeImage(bytes);
  if (!cleaned.understood || !cleaned.contentType || !cleaned.extension) {
    return Response.json(
      { error: "We couldn't safely remove location data from that photo. Try another JPEG, PNG or WebP." },
      { status: 400, headers },
    );
  }

  // Deterministic-ish name without Math.random (workerd-friendly) — the guide
  // folder is what the storage policy checks.
  const ext = cleaned.extension;
  const path = `${guideId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_").slice(-40)}.${ext}`;

  const { error } = await admin.storage
    .from("journal-photos")
    .upload(path, cleaned.bytes, { contentType: cleaned.contentType, upsert: false });
  if (error) {
    return Response.json({ error: error.message }, { status: 400, headers });
  }

  const { data } = admin.storage.from("journal-photos").getPublicUrl(path);
  return Response.json({ url: data.publicUrl, strippedGps: cleaned.strippedGps }, { headers });
}
