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
  if (!d.start_date) return "Add the day you set off.";
  if (!d.booking_id && !d.pre_platform) {
    return "Pick the booking this trek was, or mark it as a trek from before Trek.";
  }
  return null;
}

/**
 * The last day of the trek, counted from the days that were written up.
 *
 * A guide is only ever asked when they set off. They know that without
 * thinking; the finish date they had to work out by counting on their fingers,
 * and it is already implied by the days they are about to write — Day 14 of a
 * trek that started on the 3rd ended on the 16th, and no other answer is
 * possible. Asking was making them do arithmetic to tell us something we could
 * derive.
 *
 * Returns the start date when there are no days yet, so a journal is always a
 * valid one-day span rather than a null the rest of the app has to guard.
 */
export function deriveEndDate(startDate: string, lastDayNo: number): string {
  const days = Math.max(1, Math.min(Number.isFinite(lastDayNo) ? lastDayNo : 1, MAX_TREK_DAYS));
  const d = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return startDate;
  d.setUTCDate(d.getUTCDate() + days - 1);
  return d.toISOString().slice(0, 10);
}

/** A mistyped day number should not turn a two-week trek into a two-year one. */
export const MAX_TREK_DAYS = 60;

/**
 * Settle a journal's dates. Called after every entry save and delete, and
 * after the trek's own details are saved.
 *
 * Two cases, and the difference matters:
 *
 * · **The trek was booked here.** Both dates come from the booking and no
 *   date is asked for at all — we already know when they walked, from the
 *   record the guide was paid against. This also keeps the publish gate
 *   honest: it refuses a journal that skips days, and to notice that only ten
 *   days were written of a fourteen-day trek it needs a length that does not
 *   come from the days themselves. Derived from the entries that check would
 *   be circular — the last day written would define the length, so nothing
 *   could ever be missing.
 *
 * · **A trek from before Trek.** No booking, so the guide gives the day they
 *   set off and the finish is counted from the days they write up. The gate
 *   falls back to "no gaps in what you wrote", which is all that is knowable.
 *
 * Returns what it stored, so a caller can show it back.
 */
export async function syncJournalDates(
  admin: { from: (t: string) => any },
  journalId: string,
  startDateWhenNoBooking: string,
): Promise<{ start_date: string; end_date: string }> {
  const [{ data: journal }, { data: last }] = await Promise.all([
    admin.from("journals").select("booking_id").eq("id", journalId).maybeSingle(),
    admin
      .from("journal_entries")
      .select("day_no")
      .eq("journal_id", journalId)
      .order("day_no", { ascending: false })
      .limit(1),
  ]);

  if (journal?.booking_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("start_date, end_date")
      .eq("id", journal.booking_id)
      .maybeSingle();
    if (booking?.start_date && booking?.end_date) {
      const dates = { start_date: booking.start_date, end_date: booking.end_date };
      await admin.from("journals").update(dates).eq("id", journalId);
      return dates;
    }
  }

  const dates = {
    start_date: startDateWhenNoBooking,
    end_date: deriveEndDate(startDateWhenNoBooking, (last ?? [])[0]?.day_no ?? 1),
  };
  await admin.from("journals").update(dates).eq("id", journalId);
  return dates;
}

/** A journal is a photo album, not an illustrated caption. */
export const MIN_JOURNAL_PHOTOS = 8;

/**
 * Publication gate. Consent is enforced in the public view too, so this cannot
 * leak either way — but refusing the publish is the honest place to say why.
 *
 * The photo and day-coverage rules are what keep a journal an album: eight
 * photos minimum, and an entry for every day of the trek — Days 1–14, not "6"
 * then "9". A rest day with one photo of the teahouse dog is a day; skipping
 * it is what makes a page read like a highlights reel.
 */
export function validateForPublish(
  j: {
    cover_photo_url: string | null;
    guide_note: string | null;
    group_label: string | null;
    group_anon: string | null;
    client_names_ok: boolean;
    start_date?: string;
    end_date?: string;
    days?: number | null;
    kind?: "journey" | "post" | "gallery" | null;
  },
  entries: number | { day_no: number; photos?: unknown[] | null }[],
): string | null {
  // Legacy call shape (a bare count) still gets the non-album checks.
  const list = Array.isArray(entries) ? entries : null;
  const entryCount = list ? list.length : entries;

  if (entryCount === 0) return "Add at least one day before publishing.";
  if (!j.cover_photo_url) return "A journal needs a cover photo.";
  if (!j.guide_note?.trim()) return "Add the guide's closing note — it is the point of the page.";
  if (!j.client_names_ok && j.group_label && !j.group_anon) {
    return "Without name consent, write the anonymous version (e.g. “two guests from Belgium”).";
  }

  if (list) {
    const kind = j.kind ?? "journey";
    const photos = list.reduce((n, e) => n + (e.photos?.length ?? 0), 0);
    // A post is one moment — one photo is a complete post. The album minimum
    // is a rule about albums.
    const min = kind === "post" ? 1 : MIN_JOURNAL_PHOTOS;
    if (photos < min) {
      return kind === "post"
        ? "A post needs at least one photo or clip."
        : `A journal is a photo album — add at least ${min} photos across the days (you have ${photos}).`;
    }
    // Only a journey has days to account for.
    const total = kind === "journey" ? tripDays(j) : 0;
    if (total) {
      const have = new Set(list.map((e) => e.day_no));
      const missing = [];
      for (let d = 1; d <= total; d++) if (!have.has(d)) missing.push(d);
      if (missing.length) {
        return `Every day of the trek needs an entry. Missing ${
          missing.length === 1 ? "day" : "days"
        } ${formatRuns(missing)} of ${total} — a short one for a rest day is fine.`;
      }
    }
  }
  return null;
}

function tripDays(j: { start_date?: string; end_date?: string; days?: number | null }): number {
  if (j.days) return j.days;
  if (!j.start_date || !j.end_date) return 0;
  return Math.round((Date.parse(j.end_date) - Date.parse(j.start_date)) / 86400000) + 1;
}

/** [2,3,4,9] → "2–4, 9" so a long gap reads as one thing to fix, not twelve. */
function formatRuns(nums: number[]): string {
  const runs: string[] = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    runs.push(i === j ? String(nums[i]) : `${nums[i]}–${nums[j]}`);
    i = j + 1;
  }
  return runs.join(", ");
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

/**
 * Replace a journal's tags from the editor's `tag` checkboxes ("kind:value").
 *
 * Delete-then-insert rather than a diff: the form always posts the complete
 * set, the table is five rows deep, and a diff here would be the kind of
 * clever that quietly leaves an unticked tag behind.
 */
export async function saveTags(
  admin: SupabaseClient,
  journalId: string,
  form: FormData,
): Promise<void> {
  const kinds = new Set(["season", "difficulty", "group", "conditions", "theme"]);
  const rows = form
    .getAll("tag")
    .map(String)
    .map((s) => {
      const i = s.indexOf(":");
      return { kind: s.slice(0, i), value: s.slice(i + 1).trim() };
    })
    .filter((t) => kinds.has(t.kind) && t.value)
    .map((t) => ({ journal_id: journalId, kind: t.kind, value: t.value }));

  await admin.from("journal_tags").delete().eq("journal_id", journalId);
  if (rows.length) await admin.from("journal_tags").insert(rows);
}

/** Parse the day-block form fields the editor posts. */
export function parseEntryForm(form: FormData) {
  return {
    day_no: Math.max(1, Math.min(99, Number(form.get("day_no")) || 1)),
    title: String(form.get("title") ?? "").trim(),
    body: String(form.get("body") ?? "").trim() || null,
    altitude_m: form.get("altitude_m") ? Number(form.get("altitude_m")) : null,
    is_hard_day: form.get("is_hard_day") === "on",
    photos: parseMedia(form),
  };
}

/**
 * The day's media, in the order the guide arranged it.
 *
 * The editor posts a JSON array from the picker. The old shape — one URL per
 * line in a textarea, plus `photo_people` checkboxes indexed by position — is
 * still read, because an ops tab left open across a deploy would otherwise
 * post the old fields and silently wipe a day's photographs.
 */
export function parseMedia(form: FormData): Array<{
  url: string;
  alt?: string;
  people?: boolean;
  kind?: "photo" | "video";
}> {
  const raw = form.get("media");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((m) => m && typeof m.url === "string" && m.url.trim())
          .slice(0, 40)
          .map((m) => ({
            url: String(m.url).trim(),
            alt: typeof m.alt === "string" ? m.alt : undefined,
            people: !!m.people,
            kind: isVideoUrl(m.url) || m.kind === "video" ? "video" : "photo",
          }));
      }
    } catch {
      // Fall through to the legacy fields rather than losing the day.
    }
  }

  const urls = String(form.get("photo_urls") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const peopleFlags = form.getAll("photo_people").map(String);
  return urls.map((url, i) => ({
    url,
    alt: String(form.get("title") ?? ""),
    people: peopleFlags.includes(String(i)),
    kind: isVideoUrl(url) ? ("video" as const) : ("photo" as const),
  }));
}

const isVideoUrl = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);

