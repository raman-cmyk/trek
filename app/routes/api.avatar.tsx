import type { Route } from "./+types/api.avatar";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { sniffImage, stripGps } from "~/lib/exif";
import {
  AVATAR_BUCKET,
  avatarPath,
  avatarProblem,
  bucketObjectPath,
  storedAs,
} from "~/lib/avatar";

/**
 * Setting your own face.
 *
 * Anyone signed in, always on themselves: a trekker filling in the profile a
 * guide reads before agreeing to take them, a guide, or somebody from the
 * office fixing their own. Uploading on another person's behalf is not a
 * thing this route can do at all — an avatar is not a document the office
 * files for you, and ops already has a field for it on /ops/people/:id.
 *
 * A selfie carries the coordinates of wherever it was taken, which for a
 * profile photo is usually somebody's home. The GPS pointer is stripped
 * before a byte reaches storage (app/lib/exif.ts), and anything we cannot
 * parse is refused rather than stored — "we could not read it, so we could
 * not clean it" is the only safe answer for a file about to be served to
 * strangers.
 *
 * POST with no file means "take my photo down".
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env);

  const form = await request.formData();
  const file = form.get("file");
  const removing = String(form.get("intent") ?? "") === "remove";

  // The photo being replaced, so its bytes do not sit in the bucket for ever.
  const { data: me } = await admin
    .from("users")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const previous = bucketObjectPath(me?.avatar_url, AVATAR_BUCKET);

  if (removing) {
    await admin.from("users").update({ avatar_url: null }).eq("id", user.id);
    if (previous) await admin.storage.from(AVATAR_BUCKET).remove([previous]);
    return Response.json({ url: null }, { headers });
  }

  if (!(file instanceof File)) {
    return Response.json({ error: "No file." }, { status: 400, headers });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // What it is, from the bytes. `file.type` is the operating system's guess
  // and is routinely empty for a photo shared out of another app.
  const kind = sniffImage(bytes);
  const problem = avatarProblem(file.size, kind);
  if (problem) return Response.json({ error: problem }, { status: 400, headers });

  let body: Uint8Array<ArrayBuffer> = bytes;
  let strippedGps = false;
  if (kind === "jpeg") {
    const r = stripGps(bytes);
    if (!r.understood) {
      return Response.json(
        { error: "We couldn't read that photo, so we couldn't clear its location. Try another." },
        { status: 400, headers },
      );
    }
    body = r.bytes;
    strippedGps = r.strippedGps;
  }

  const { ext, contentType } = storedAs(kind as "jpeg" | "png" | "webp");
  const path = avatarPath(user.id, ext, Date.now());

  const { error } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) return Response.json({ error: error.message }, { status: 400, headers });

  const { data: pub } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const { error: saveError } = await admin
    .from("users")
    .update({ avatar_url: pub.publicUrl })
    .eq("id", user.id);
  if (saveError) {
    // Do not leave an orphan in the bucket that nothing points at.
    await admin.storage.from(AVATAR_BUCKET).remove([path]);
    return Response.json({ error: saveError.message }, { status: 400, headers });
  }

  // Only once the new one is safely the live photo.
  if (previous) await admin.storage.from(AVATAR_BUCKET).remove([previous]);

  return Response.json({ url: pub.publicUrl, strippedGps }, { headers });
}
