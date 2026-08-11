import type { Route } from "./+types/api.journal-photo";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { isJpeg, stripGps } from "~/lib/exif";

/**
 * Journal photo upload.
 *
 * A guide uploads straight off their phone, so the file arrives carrying the
 * coordinates of every teahouse and campsite on the trek. We keep the dates —
 * they are how ops checks a journal against the trek it claims to be — and
 * remove the GPS pointer before anything is stored (app/lib/exif.ts).
 *
 * Anything we cannot parse is refused rather than stored: "we could not read
 * it, so we could not clean it" is the only safe answer for a file that is
 * about to be published on a public page.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  // Guides upload their own; ops uploads on their behalf (concierge model).
  let auth: Awaited<ReturnType<typeof requireUser>>;
  try {
    auth = await requireUser(request, env, "guide");
  } catch {
    auth = await requireUser(request, env, "ops");
  }
  const { user, admin, headers } = auth;

  const form = await request.formData();
  const file = form.get("file");
  const guideId = String(form.get("guide_id") ?? user.id);
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
  let body: Uint8Array<ArrayBuffer> = bytes;
  let strippedGps = false;

  if (isJpeg(bytes)) {
    const r = stripGps(bytes);
    if (!r.understood) {
      return Response.json(
        { error: "We couldn't read that photo, so we couldn't clear its location. Try another." },
        { status: 400, headers },
      );
    }
    body = r.bytes;
    strippedGps = r.strippedGps;
  } else if (file.type !== "image/png" && file.type !== "image/webp") {
    return Response.json(
      { error: "Photos only — JPEG, PNG or WebP." },
      { status: 400, headers },
    );
  }

  // Deterministic-ish name without Math.random (workerd-friendly) — the guide
  // folder is what the storage policy checks.
  const ext = isJpeg(bytes) ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = `${guideId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_").slice(-40)}.${ext}`;

  const { error } = await admin.storage
    .from("journal-photos")
    .upload(path, body, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) {
    return Response.json({ error: error.message }, { status: 400, headers });
  }

  const { data } = admin.storage.from("journal-photos").getPublicUrl(path);
  return Response.json({ url: data.publicUrl, strippedGps }, { headers });
}
