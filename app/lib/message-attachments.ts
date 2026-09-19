export function isPrivateMessagePhotoUrl(value: string): boolean {
  try {
    const url = new URL(value, "https://local.invalid");
    const type = url.searchParams.get("thread_type") ?? "";
    const id = url.searchParams.get("thread_id") ?? "";
    const path = url.searchParams.get("path") ?? "";
    const parts = path.split("/");
    const keys = [...url.searchParams.keys()];
    return url.origin === "https://local.invalid"
      && url.pathname === "/api/message-photo"
      && !url.hash
      && keys.length === 3
      && new Set(keys).size === 3
      && ["booking", "conversation", "enquiry", "group"].includes(type)
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      && parts.length === 3
      && parts[0] === type
      && parts[1] === id
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(parts[2]);
  } catch {
    return false;
  }
}
