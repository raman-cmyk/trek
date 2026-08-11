import type { Route } from "./+types/api.message-photo";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { isJpeg, stripGps } from "~/lib/exif";

/**
 * Photos shared in a thread — gear shots, boot sizes, and passport pages.
 *
 * Same GPS-stripping rule as journal photos: a phone photo carries the exact
 * coordinates of wherever it was taken, and a passport page photographed at
 * home is the worst possible thing to store with a home address attached.
 * Anything we cannot parse is refused rather than stored.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401, headers });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file." }, { status: 400, headers });
  }
  if (file.size > 10 * 1024 * 1024) {
    return Response.json(
      { error: "That photo is over 10 MB. Send a smaller one." },
      { status: 400, headers },
    );
  }

  const bytes = new Uint8Array((await file.arrayBuffer()) as ArrayBuffer);
  let body: Uint8Array<ArrayBuffer> = bytes;
  if (isJpeg(bytes)) {
    const r = stripGps(bytes);
    if (!r.understood) {
      return Response.json(
        { error: "We couldn't read that photo, so we couldn't clear its location." },
        { status: 400, headers },
      );
    }
    body = r.bytes;
  } else if (file.type !== "image/png" && file.type !== "image/webp") {
    return Response.json({ error: "Photos only — JPEG, PNG or WebP." }, { status: 400, headers });
  }

  const admin = createAdminClient(env);
  const ext = isJpeg(bytes) ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = `${user.id}/${Date.now()}-msg.${ext}`;
  const { error } = await admin.storage
    .from("journal-photos")
    .upload(path, body, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) return Response.json({ error: error.message }, { status: 400, headers });

  const { data } = admin.storage.from("journal-photos").getPublicUrl(path);
  return Response.json({ url: data.publicUrl }, { headers });
}
