import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Journal writes, shared by the ops console (concierge: we interview the guide
 * and type it in) and the guide dashboard (self-serve on a phone).
 *
 * Both surfaces go through here so the rules — real trip, consent, slug
 * uniqueness — have exactly one implementation.
 */

export interface JournalDraft {
  guide_id: string;
  title: string;
  start_date: string;
  end_date: string;
  route_id?: string | null;
  booking_id?: string | null;
  pre_platform?: boolean;
  pre_platform_note?: string | null;
  group_label?: string | null;
  group_anon?: string | null;
  max_altitude_m?: number | null;
  distance_km?: number | null;
  pass_crossed?: string | null;
  weather_note?: string | null;
  cover_photo_url?: string | null;
  guide_note?: string | null;
  client_note?: string | null;
  client_note_author?: string | null;
  client_names_ok?: boolean;
  client_photos_ok?: boolean;
}

export function journalSlug(title: string, startDate: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${base || "trek"}-${startDate.slice(0, 7)}`;
}

/**
 * Validate before touching the database. The DB has the same rules as
 * constraints, but a CHECK violation surfaces to a guide on a phone as an
 * unreadable Postgres string — these messages are the actual UI.
 */
export function validateDraft(d: Partial<JournalDraft>): string | null {
  if (!d.title?.trim()) return "Give the trek a title.";
  if (!d.start_date || !d.end_date) return "Add the start and end dates.";
  if (d.end_date < d.start_date) return "The end date is before the start date.";
  if (!d.booking_id && !d.pre_platform) {
    return "Pick the booking this trek was, or mark it as a trek from before Trek.";
  }
  const days = Math.round(
    (Date.parse(d.end_date) - Date.parse(d.start_date)) / 86400000,
  ) + 1;
  if (days > 60) return "That is more than 60 days — check the dates.";
  return null;
}

/**
 * Publication gate. Consent is enforced in the public view too, so this cannot
 * leak either way — but refusing the publish is the honest place to say why.
 */
export function validateForPublish(
  j: { cover_photo_url: string | null; guide_note: string | null; group_label: string | null; group_anon: string | null; client_names_ok: boolean },
  entryCount: number,
): string | null {
  if (entryCount === 0) return "Add at least one day before publishing.";
  if (!j.cover_photo_url) return "A journal needs a cover photo.";
  if (!j.guide_note?.trim()) return "Add the guide's closing note — it is the point of the page.";
  if (!j.client_names_ok && j.group_label && !j.group_anon) {
    return "Without name consent, write the anonymous version (e.g. “two guests from Belgium”).";
  }
  return null;
}

export async function uniqueSlug(
  admin: SupabaseClient,
  title: string,
  startDate: string,
  ignoreId?: string,
): Promise<string> {
  const base = journalSlug(title, startDate);
  for (let n = 0; n < 40; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    let q = admin.from("journals").select("id").eq("slug", slug);
    if (ignoreId) q = q.neq("id", ignoreId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${Math.floor(Date.now() / 1000)}`;
}

/** Bookings this guide completed that do not have a journal yet. */
export async function journalableBookings(admin: SupabaseClient, guideId: string) {
  const { data } = await admin
    .from("bookings")
    .select("id, start_date, end_date, party_size, status, offering:offerings(title, route_id)")
    .eq("guide_id", guideId)
    .eq("status", "completed")
    .order("start_date", { ascending: false });
  const { data: used } = await admin
    .from("journals")
    .select("booking_id")
    .eq("guide_id", guideId)
    .not("booking_id", "is", null);
  const taken = new Set((used ?? []).map((j) => j.booking_id));
  return (data ?? []).filter((b) => !taken.has(b.id));
}

/** Parse the day-block form fields the editor posts. */
export function parseEntryForm(form: FormData) {
  const photos: { url: string; alt?: string; people?: boolean }[] = [];
  const urls = String(form.get("photo_urls") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const peopleFlags = form.getAll("photo_people").map(String);
  urls.forEach((url, i) => {
    photos.push({
      url,
      alt: String(form.get("title") ?? ""),
      people: peopleFlags.includes(String(i)),
    });
  });
  const layoutRaw = String(form.get("layout") ?? "full");
  return {
    day_no: Math.max(1, Math.min(99, Number(form.get("day_no")) || 1)),
    title: String(form.get("title") ?? "").trim(),
    body: String(form.get("body") ?? "").trim() || null,
    altitude_m: form.get("altitude_m") ? Number(form.get("altitude_m")) : null,
    is_hard_day: form.get("is_hard_day") === "on",
    layout: (["full", "two", "portrait"].includes(layoutRaw) ? layoutRaw : "full") as
      | "full"
      | "two"
      | "portrait",
    photos,
  };
}
