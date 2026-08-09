import type { SupabaseClient } from "@supabase/supabase-js";

/** Upload an image to the public 'photos' bucket; returns its public URL. */
export async function uploadPublicPhoto(
  admin: SupabaseClient,
  prefix: string,
  file: File,
): Promise<string | null> {
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
  const path = `${prefix}/${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage
    .from("photos")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) return null;
  return admin.storage.from("photos").getPublicUrl(path).data.publicUrl;
}
