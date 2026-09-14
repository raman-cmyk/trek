import type { SupabaseClient } from "@supabase/supabase-js";
import { isLanguage, isProficiency, type Proficiency } from "./guide-languages";
import { parseTimesWalked } from "./guide-routes";
import { parseRegions } from "./guide-regions";

/**
 * Everything a guide can change about their own page, in one place.
 *
 * The profile page and the setup steps are two doors into the same rooms:
 * a guide who fixes their day rate from the "Rate & payout" step and one who
 * does it from the long profile page must hit exactly the same code, or the
 * two drift and one of them quietly stops validating. Each intent here
 * returns a sentence for the screen, and the route decides where to send
 * the guide next.
 *
 * Status, tier, slug and licence number are ops-controlled and deliberately
 * absent — the database guards them too.
 */

export type SaveResult = { ok: string; error?: undefined } | { error: string; ok?: undefined };

/**
 * The object path inside a bucket, recovered from its public URL.
 *
 * Deleting the row is not deleting the file: without this, every removed
 * photo and every re-recorded voice note stays in storage for ever, paid for
 * and still reachable by anyone who kept the link. Returns null for anything
 * that is not a public URL for this bucket — seeded photos are served from
 * /img, and those must not be touched.
 */
export function storagePath(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/** Everything the profile and setup screens read, fetched once. */
export async function loadGuideProfile(admin: SupabaseClient, userId: string) {
  const [
    { data: guide },
    { data: langs },
    { data: photos },
    { data: walked },
    { data: routes },
    { data: canned },
    { data: me },
    { count: offeringCount },
  ] = await Promise.all([
    admin
      .from("guides")
      .select(
        "slug, hook_line, bio, only_with_me, home_district, regions, years_experience, gender, licence_no, licence_expiry, porter_welfare, voice_intro_url, day_rate_usd_cents, payout_method, payout_account, payout_account_name, tier, status",
      )
      .eq("user_id", userId)
      .single(),
    admin
      .from("guide_languages")
      .select("language, proficiency")
      .eq("guide_id", userId)
      .order("language"),
    admin
      .from("guide_photos")
      .select("id, url, kind, alt_text, sort")
      .eq("guide_id", userId)
      .order("sort"),
    admin
      .from("guide_route_experience")
      .select("route_id, times_walked, verified_at, route:routes(name, region)")
      .eq("guide_id", userId)
      .order("times_walked", { ascending: false }),
    admin
      .from("routes")
      .select("id, name, region")
      .eq("status", "live")
      .order("sort")
      .order("name"),
    admin.from("canned_replies").select("id, label, body, sort").eq("guide_id", userId).order("sort"),
    admin.from("users").select("full_name, avatar_url").eq("id", userId).single(),
    admin
      .from("offerings")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", userId)
      .neq("status", "removed"),
  ]);
  return {
    guide,
    name: (me?.full_name ?? "") as string,
    avatarUrl: (me?.avatar_url ?? null) as string | null,
    languages: langs ?? [],
    photos: photos ?? [],
    canned: canned ?? [],
    walked: walked ?? [],
    routes: routes ?? [],
    offeringCount: offeringCount ?? 0,
  };
}

/**
 * The public card and the search results read users.avatar_url; the gallery
 * reads guide_photos. Keeping the two in step here means a guide who uploads
 * a face sees it everywhere at once.
 */
async function syncAvatar(admin: SupabaseClient, userId: string) {
  const { data: head } = await admin
    .from("guide_photos")
    .select("url")
    .eq("guide_id", userId)
    .eq("kind", "headshot")
    .order("sort")
    .limit(1)
    .maybeSingle();
  await admin.from("users").update({ avatar_url: head?.url ?? null }).eq("id", userId);
}

export async function saveGuideProfile(
  admin: SupabaseClient,
  userId: string,
  form: FormData,
): Promise<SaveResult> {
  const intent = String(form.get("intent"));

  if (intent === "commercial") {
    const dayRate = Number(form.get("day_rate_usd") ?? 0);
    const patch: Record<string, unknown> = {};
    if (dayRate > 0) patch.day_rate_usd_cents = Math.round(dayRate * 100);
    const method = String(form.get("payout_method") ?? "");
    if (["esewa", "khalti", "bank"].includes(method)) patch.payout_method = method;
    const acct = String(form.get("payout_account") ?? "").trim();
    if (acct) patch.payout_account = acct;
    // The name the account is held in. Payouts are made by hand in NPR, and a
    // number without a name is the single most common reason one bounces.
    const acctName = String(form.get("payout_account_name") ?? "").trim();
    if (acctName) patch.payout_account_name = acctName;
    if (Object.keys(patch).length) {
      await admin.from("guides").update(patch).eq("user_id", userId);
    }
    return { ok: "Saved." };
  }

  // The guide's own words about themselves.
  if (intent === "story") {
    const bio = String(form.get("bio") ?? "").trim().slice(0, 4000);
    const hook = String(form.get("hook_line") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    await admin
      .from("guides")
      .update({ bio: bio || null, hook_line: hook || null })
      .eq("user_id", userId);
    return { ok: "Saved. This is on your profile now." };
  }

  // Facts about the guide that are theirs to correct.
  if (intent === "basics") {
    const patch: Record<string, unknown> = {
      home_district: String(form.get("home_district") ?? "").trim() || null,
      porter_welfare: form.get("porter_welfare") === "on",
    };
    const years = Number(form.get("years_experience"));
    if (Number.isFinite(years) && years >= 0 && years <= 70) patch.years_experience = years;
    const gender = String(form.get("gender") ?? "");
    if (["female", "male", "other"].includes(gender)) patch.gender = gender;
    const exp = String(form.get("licence_expiry") ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(exp)) patch.licence_expiry = exp;
    await admin.from("guides").update(patch).eq("user_id", userId);
    return { ok: "Saved." };
  }

  // The voice note. Whatever is being replaced or removed, the old file goes too.
  if (intent === "voice") {
    const { data: cur } = await admin
      .from("guides")
      .select("voice_intro_url")
      .eq("user_id", userId)
      .single();
    const old = storagePath(cur?.voice_intro_url, "guide-audio");

    if (form.get("delete")) {
      await admin.from("guides").update({ voice_intro_url: null }).eq("user_id", userId);
      if (old) await admin.storage.from("guide-audio").remove([old]);
      return { ok: "Recording removed." };
    }
    const url = String(form.get("url") ?? "").trim();
    if (!url) return { error: "The upload didn't finish. Try again." };
    await admin.from("guides").update({ voice_intro_url: url }).eq("user_id", userId);
    if (old && old !== storagePath(url, "guide-audio")) {
      await admin.storage.from("guide-audio").remove([old]);
    }
    return { ok: "Saved. Trekkers can hear you now." };
  }

  if (intent === "language") {
    const language = String(form.get("language") ?? "").trim().slice(0, 40);
    if (form.get("delete")) {
      await admin
        .from("guide_languages")
        .delete()
        .eq("guide_id", userId)
        .eq("language", language);
      return { ok: `Removed ${language}.` };
    }
    // Only a language we know, spelled the way we spell it — "german" and
    // "German" once became two rows and a duplicate browse filter.
    if (!isLanguage(language)) return { error: "Pick a language from the list." };
    const raw = String(form.get("proficiency") ?? "conversational");
    const proficiency: Proficiency = isProficiency(raw) ? raw : "conversational";
    await admin.from("guide_languages").upsert(
      { guide_id: userId, language, proficiency },
      { onConflict: "guide_id,language" },
    );
    return { ok: `Added ${language}.` };
  }

  // Routes walked. The public profile leads with this number, so it is the
  // guide's to state and the office's to check.
  if (intent === "route") {
    const routeId = String(form.get("route_id") ?? "").trim();
    if (!routeId) return { error: "Pick a route first." };
    if (form.get("delete")) {
      await admin
        .from("guide_route_experience")
        .delete()
        .eq("guide_id", userId)
        .eq("route_id", routeId);
      return { ok: "Removed." };
    }
    const { data: route } = await admin
      .from("routes")
      .select("id, name")
      .eq("id", routeId)
      .eq("status", "live")
      .maybeSingle();
    if (!route) return { error: "That route isn't one of ours." };
    const times = parseTimesWalked(form.get("times_walked"));
    if (times === null) {
      return {
        error: `How many times have you walked ${route.name}? A whole number, 1 or more.`,
      };
    }
    const { data: existing } = await admin
      .from("guide_route_experience")
      .select("times_walked, verified_at")
      .eq("guide_id", userId)
      .eq("route_id", routeId)
      .maybeSingle();
    const wasConfirmed = !!existing?.verified_at && existing.times_walked !== times;
    // Changing a checked number clears the check: a guide must not be able to
    // have 12 confirmed and then quietly make it 200 under the same tick.
    await admin.from("guide_route_experience").upsert(
      {
        guide_id: userId,
        route_id: routeId,
        times_walked: times,
        ...(wasConfirmed ? { verified_by: null, verified_at: null } : {}),
      },
      { onConflict: "guide_id,route_id" },
    );
    return {
      ok: wasConfirmed
        ? `${route.name} updated — our office will check the new number.`
        : `${route.name} saved.`,
    };
  }

  if (intent === "regions") {
    const regions = parseRegions(form.getAll("regions"));
    await admin.from("guides").update({ regions }).eq("user_id", userId);
    return {
      ok: regions.length
        ? `Saved — you work in ${regions.join(", ")}.`
        : "Cleared. Tick the areas you take people to.",
    };
  }

  // Photographs. The upload itself happens at /api/journal-photo (which
  // strips the GPS out of the EXIF first); this only records the row.
  if (intent === "photo") {
    const id = String(form.get("photo_id") ?? "");
    if (form.get("delete")) {
      const { data: row } = await admin
        .from("guide_photos")
        .select("url")
        .eq("id", id)
        .eq("guide_id", userId)
        .single();
      await admin.from("guide_photos").delete().eq("id", id).eq("guide_id", userId);
      const path = storagePath(row?.url, "journal-photos");
      if (path) await admin.storage.from("journal-photos").remove([path]);
      await syncAvatar(admin, userId);
      return { ok: "Photo removed." };
    }
    if (form.get("make_main")) {
      // Exactly one headshot: the portrait reads the first one.
      await admin
        .from("guide_photos")
        .update({ kind: "trail" })
        .eq("guide_id", userId)
        .eq("kind", "headshot");
      await admin
        .from("guide_photos")
        .update({ kind: "headshot", sort: 0 })
        .eq("id", id)
        .eq("guide_id", userId);
      await syncAvatar(admin, userId);
      return { ok: "That's your main photo now." };
    }
    const url = String(form.get("url") ?? "").trim();
    const alt = String(form.get("alt_text") ?? "").trim().slice(0, 160);
    if (!url) return { error: "The upload didn't finish. Try again." };
    if (!alt) {
      return { error: "Add a few words about the photo — it is what a blind reader and Google get." };
    }
    const { count } = await admin
      .from("guide_photos")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", userId);
    const existing = count ?? 0;
    if (existing >= 24) return { error: "That's 24 photos — remove one first." };
    const { count: heads } = await admin
      .from("guide_photos")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", userId)
      .eq("kind", "headshot");
    // The first photo a guide ever adds becomes their portrait, so a new
    // guide is never left with a profile that has no face on it.
    await admin.from("guide_photos").insert({
      guide_id: userId,
      url,
      alt_text: alt,
      kind: (heads ?? 0) === 0 ? "headshot" : "trail",
      sort: existing,
    });
    await syncAvatar(admin, userId);
    return { ok: "Photo added." };
  }

  if (intent === "canned") {
    const id = String(form.get("canned_id") ?? "");
    const label = String(form.get("label") ?? "").trim().slice(0, 40);
    const body = String(form.get("body") ?? "").trim().slice(0, 800);
    if (form.get("delete")) {
      await admin.from("canned_replies").delete().eq("id", id).eq("guide_id", userId);
      return { ok: "Removed." };
    }
    if (!label || !body) return { error: "Give it a short name and the answer." };
    if (id) {
      await admin
        .from("canned_replies")
        .update({ label, body })
        .eq("id", id)
        .eq("guide_id", userId);
    } else {
      await admin.from("canned_replies").insert({ guide_id: userId, label, body, sort: 99 });
    }
    return { ok: "Saved." };
  }

  if (intent === "promise") {
    // The guide's own sentence, saved exactly as typed. Their voice is the
    // product: no spellcheck, no rewrite, no "improve with AI".
    const raw = String(form.get("only_with_me") ?? "").replace(/\s+/g, " ").trim();
    if (!raw) {
      await admin.from("guides").update({ only_with_me: null }).eq("user_id", userId);
      return { ok: "Cleared." };
    }
    if (raw.length > 90) {
      return { error: `Too long by ${raw.length - 90} letters. Say one thing only.` };
    }
    await admin.from("guides").update({ only_with_me: raw }).eq("user_id", userId);
    return { ok: "Saved. This shows on your profile now." };
  }

  if (intent === "request") {
    const note = String(form.get("note") ?? "").trim();
    if (!note) return { error: "Tell us what you'd like changed." };
    await admin.from("guide_change_requests").insert({ guide_id: userId, note });
    return { ok: "Thanks — our team will action this and reply." };
  }

  return { error: "Nothing to save." };
}
