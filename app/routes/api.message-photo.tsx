import type { Route } from "./+types/api.message-photo";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { getSessionUser } from "~/lib/auth.server";
import { sanitizeImage } from "~/lib/exif";

type ThreadType = "booking" | "conversation" | "enquiry" | "group";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isThreadType(value: string): value is ThreadType {
  return value === "booking" || value === "conversation" || value === "enquiry" || value === "group";
}

async function canAccessThread(
  admin: ReturnType<typeof createAdminClient>,
  type: ThreadType,
  id: string,
  userId: string,
): Promise<boolean> {
  if (type === "booking") {
    const { data } = await admin.from("bookings").select("id, trekker_id, guide_id").eq("id", id).maybeSingle();
    return !!data && (data.trekker_id === userId || data.guide_id === userId);
  }
  if (type === "conversation") {
    const { data } = await admin.from("conversations").select("id, trekker_id, guide_id").eq("id", id).maybeSingle();
    return !!data && (data.trekker_id === userId || data.guide_id === userId);
  }
  if (type === "enquiry") {
    const { data } = await admin.from("enquiries").select("id, trekker_id, guide_id").eq("id", id).maybeSingle();
    return !!data && (data.trekker_id === userId || data.guide_id === userId);
  }
  const [{ data: group }, { data: member }] = await Promise.all([
    admin.from("trip_groups").select("id, organiser_id, guide_id").eq("id", id).maybeSingle(),
    admin.from("trip_group_members").select("id").eq("group_id", id).eq("user_id", userId)
      .in("status", ["invited", "joined"]).maybeSingle(),
  ]);
  return !!group && (group.organiser_id === userId || group.guide_id === userId || !!member);
}

function attachmentUrl(request: Request, type: ThreadType, id: string, path: string): string {
  const url = new URL("/api/message-photo", request.url);
  url.searchParams.set("thread_type", type);
  url.searchParams.set("thread_id", id);
  url.searchParams.set("path", path);
  return `${url.pathname}${url.search}`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) throw new Response("Not found", { status: 404, headers });
  const url = new URL(request.url);
  const type = url.searchParams.get("thread_type") ?? "";
  const id = url.searchParams.get("thread_id") ?? "";
  const path = url.searchParams.get("path") ?? "";
  const parts = path.split("/");
  const safeObjectName = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;
  if (
    !isThreadType(type) ||
    !UUID.test(id) ||
    parts.length !== 3 ||
    parts[0] !== type ||
    parts[1] !== id ||
    !safeObjectName.test(parts[2])
  ) {
    throw new Response("Not found", { status: 404, headers });
  }
  const admin = createAdminClient(env);
  if (!(await canAccessThread(admin, type, id, user.id))) {
    throw new Response("Not found", { status: 404, headers });
  }
  const { data, error } = await admin.storage.from("message-photos").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Response("Not found", { status: 404, headers });
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Location", data.signedUrl);
  responseHeaders.set("Cache-Control", "private, no-store");
  return new Response(null, { status: 302, headers: responseHeaders });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401, headers });

  const form = await request.formData();
  const type = String(form.get("thread_type") ?? "");
  const id = String(form.get("thread_id") ?? "");
  const file = form.get("file");
  if (!isThreadType(type) || !UUID.test(id)) {
    return Response.json({ error: "Open the conversation before attaching a photo." }, { status: 400, headers });
  }
  if (!(file instanceof File)) return Response.json({ error: "No file." }, { status: 400, headers });
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "That photo is over 10 MB. Send a smaller one." }, { status: 400, headers });
  }

  const admin = createAdminClient(env);
  if (!(await canAccessThread(admin, type, id, user.id))) {
    return Response.json({ error: "Conversation not found." }, { status: 404, headers });
  }
  const cleaned = sanitizeImage(new Uint8Array((await file.arrayBuffer()) as ArrayBuffer));
  if (!cleaned.understood || !cleaned.contentType || !cleaned.extension) {
    return Response.json(
      { error: "We couldn't safely remove location data from that photo. Try another JPEG, PNG or WebP." },
      { status: 400, headers },
    );
  }

  const path = `${type}/${id}/${crypto.randomUUID()}.${cleaned.extension}`;
  const { error } = await admin.storage.from("message-photos").upload(path, cleaned.bytes, {
    contentType: cleaned.contentType,
    upsert: false,
  });
  if (error) return Response.json({ error: "That photo didn't upload. Try again." }, { status: 400, headers });
  return Response.json({ url: attachmentUrl(request, type, id, path) }, { headers });
}
