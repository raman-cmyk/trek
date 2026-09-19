/** Build a Supabase public image-transform URL, or return null for other hosts/paths. */
export function publicImageTransform(
  src: string,
  width: number,
  height: number,
  quality = 75,
): string | null {
  try {
    const url = new URL(src);
    const marker = "/storage/v1/object/public/";
    if (!url.pathname.includes(marker)) return null;
    url.pathname = url.pathname.replace(marker, "/storage/v1/render/image/public/");
    url.searchParams.set("width", String(Math.max(1, Math.min(2500, Math.round(width)))));
    url.searchParams.set("height", String(Math.max(1, Math.min(2500, Math.round(height)))));
    url.searchParams.set("resize", "cover");
    url.searchParams.set("quality", String(Math.max(20, Math.min(100, Math.round(quality)))));
    return url.toString();
  } catch {
    return null;
  }
}
