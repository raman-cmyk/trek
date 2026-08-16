import { useRef, useState } from "react";
import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/g.profile";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { formatUsd } from "~/lib/pricing";
import { fmtDate } from "~/lib/format";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const [{ data: guide }, { data: langs }, { data: photos }] = await Promise.all([
    admin
      .from("guides")
      .select(
        "slug, hook_line, bio, only_with_me, home_district, years_experience, gender, licence_no, licence_expiry, porter_welfare, voice_intro_url, day_rate_usd_cents, payout_method, payout_account, payout_account_name, tier, status",
      )
      .eq("user_id", user.id)
      .single(),
    admin
      .from("guide_languages")
      .select("language, proficiency")
      .eq("guide_id", user.id)
      .order("language"),
    admin
      .from("guide_photos")
      .select("id, url, kind, alt_text, sort")
      .eq("guide_id", user.id)
      .order("sort"),
  ]);
  const { data: canned } = await admin
    .from("canned_replies")
    .select("id, label, body, sort")
    .eq("guide_id", user.id)
    .order("sort");
  return data(
    {
      guide,
      languages: langs ?? [],
      photos: photos ?? [],
      canned: canned ?? [],
    },
    { headers },
  );
}

/**
 * The object path inside a bucket, recovered from its public URL.
 *
 * Deleting the row is not deleting the file: without this, every removed photo
 * and every re-recorded voice note stays in storage for ever, paid for and
 * still reachable by anyone who kept the link. Returns null for anything that
 * is not a public URL for this bucket — seeded photos are served from /img,
 * and those must not be touched.
 */
function storagePath(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "commercial") {
    // Guide may edit only their own commercial fields (guard trigger + this
    // whitelist enforce that status/tier/licence stay ops-controlled).
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
      await admin.from("guides").update(patch).eq("user_id", user.id);
    }
    return data({ ok: "Saved." }, { headers });
  }

  // The guide's own words about themselves. Previously this could only be
  // changed by asking ops in a free-text note and waiting — which is why most
  // profiles carry whatever was typed on the day they applied.
  if (intent === "story") {
    const bio = String(form.get("bio") ?? "").trim().slice(0, 4000);
    const hook = String(form.get("hook_line") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    await admin
      .from("guides")
      .update({ bio: bio || null, hook_line: hook || null })
      .eq("user_id", user.id);
    return data({ ok: "Saved. This is on your profile now." }, { headers });
  }

  // Facts about the guide that are theirs to correct. licence_no, tier, slug
  // and status are guarded in the database and deliberately absent here.
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
    await admin.from("guides").update(patch).eq("user_id", user.id);
    return data({ ok: "Saved." }, { headers });
  }

  // The voice note. The column and the player have both existed since the
  // profile rebuild; nothing ever let a guide record one.
  if (intent === "voice") {
    // Whatever is being replaced or removed, the old file goes too.
    const { data: cur } = await admin
      .from("guides")
      .select("voice_intro_url")
      .eq("user_id", user.id)
      .single();
    const old = storagePath(cur?.voice_intro_url, "guide-audio");

    if (form.get("delete")) {
      await admin.from("guides").update({ voice_intro_url: null }).eq("user_id", user.id);
      if (old) await admin.storage.from("guide-audio").remove([old]);
      return data({ ok: "Recording removed." }, { headers });
    }
    const url = String(form.get("url") ?? "").trim();
    if (!url) {
      return data({ error: "The upload didn't finish. Try again." }, { status: 400, headers });
    }
    await admin.from("guides").update({ voice_intro_url: url }).eq("user_id", user.id);
    if (old && old !== storagePath(url, "guide-audio")) {
      await admin.storage.from("guide-audio").remove([old]);
    }
    return data({ ok: "Saved. Trekkers can hear you now." }, { headers });
  }

  if (intent === "language") {
    const language = String(form.get("language") ?? "").trim().slice(0, 40);
    if (form.get("delete")) {
      await admin
        .from("guide_languages")
        .delete()
        .eq("guide_id", user.id)
        .eq("language", language);
      return data({ ok: `Removed ${language}.` }, { headers });
    }
    if (!language) return data({ error: "Type a language first." }, { status: 400, headers });
    const proficiency = String(form.get("proficiency") ?? "conversational");
    // Upsert, so adding a language you already have changes how well you speak
    // it rather than failing on the primary key.
    await admin.from("guide_languages").upsert(
      {
        guide_id: user.id,
        language: language[0].toUpperCase() + language.slice(1),
        proficiency: ["basic", "conversational", "fluent", "native"].includes(proficiency)
          ? proficiency
          : "conversational",
      },
      { onConflict: "guide_id,language" },
    );
    return data({ ok: `Added ${language}.` }, { headers });
  }

  // Photographs. The upload itself happens at /api/journal-photo (which strips
  // the GPS out of the EXIF first); this only records the row.
  if (intent === "photo") {
    const id = String(form.get("photo_id") ?? "");
    if (form.get("delete")) {
      const { data: row } = await admin
        .from("guide_photos")
        .select("url")
        .eq("id", id)
        .eq("guide_id", user.id)
        .single();
      await admin.from("guide_photos").delete().eq("id", id).eq("guide_id", user.id);
      // The file too, not just the row — a photo a guide took down should
      // stop existing, not merely stop being listed.
      const path = storagePath(row?.url, "journal-photos");
      if (path) await admin.storage.from("journal-photos").remove([path]);
      return data({ ok: "Photo removed." }, { headers });
    }
    if (form.get("make_main")) {
      // Exactly one headshot: the profile portrait reads the first one, so two
      // would make which-photo-shows-first a coin toss.
      await admin
        .from("guide_photos")
        .update({ kind: "trail" })
        .eq("guide_id", user.id)
        .eq("kind", "headshot");
      await admin
        .from("guide_photos")
        .update({ kind: "headshot", sort: 0 })
        .eq("id", id)
        .eq("guide_id", user.id);
      return data({ ok: "That's your main photo now." }, { headers });
    }
    const url = String(form.get("url") ?? "").trim();
    const alt = String(form.get("alt_text") ?? "").trim().slice(0, 160);
    if (!url) return data({ error: "The upload didn't finish. Try again." }, { status: 400, headers });
    if (!alt) {
      return data(
        { error: "Add a few words about the photo — it is what a blind reader and Google get." },
        { status: 400, headers },
      );
    }
    const { count } = await admin
      .from("guide_photos")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", user.id);
    const existing = count ?? 0;
    if (existing >= 24) {
      return data({ error: "That's 24 photos — remove one first." }, { status: 400, headers });
    }
    const { count: heads } = await admin
      .from("guide_photos")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", user.id)
      .eq("kind", "headshot");
    await admin.from("guide_photos").insert({
      guide_id: user.id,
      url,
      alt_text: alt,
      // The first photo a guide ever adds becomes their portrait, so a new
      // guide is never left with a profile that has no face on it.
      kind: (heads ?? 0) === 0 ? "headshot" : "trail",
      sort: existing,
    });
    return data({ ok: "Photo added." }, { headers });
  }

  if (intent === "canned") {
    // Quick answers a guide taps instead of typing on a phone with one bar.
    const id = String(form.get("canned_id") ?? "");
    const label = String(form.get("label") ?? "").trim().slice(0, 40);
    const body = String(form.get("body") ?? "").trim().slice(0, 800);
    if (form.get("delete")) {
      await admin.from("canned_replies").delete().eq("id", id).eq("guide_id", user.id);
      return data({ ok: "Removed." }, { headers });
    }
    if (!label || !body) {
      return data({ error: "Give it a short name and the answer." }, { status: 400, headers });
    }
    if (id) {
      await admin
        .from("canned_replies")
        .update({ label, body })
        .eq("id", id)
        .eq("guide_id", user.id);
    } else {
      await admin.from("canned_replies").insert({ guide_id: user.id, label, body, sort: 99 });
    }
    return data({ ok: "Saved." }, { headers });
  }

  if (intent === "promise") {
    // The guide's own sentence, saved exactly as typed. We check the length
    // (the column has a 90-char constraint that would otherwise throw an
    // unexplained error) and nothing else — no spellcheck, no rewrite, no
    // "improve this with AI" button. Their voice is the product.
    const raw = String(form.get("only_with_me") ?? "").replace(/\s+/g, " ").trim();
    if (!raw) {
      await admin.from("guides").update({ only_with_me: null }).eq("user_id", user.id);
      return data({ ok: "Cleared." }, { headers });
    }
    if (raw.length > 90) {
      return data(
        { error: `Too long by ${raw.length - 90} letters. Say one thing only.` },
        { status: 400, headers },
      );
    }
    await admin.from("guides").update({ only_with_me: raw }).eq("user_id", user.id);
    return data({ ok: "Saved. This shows on your profile now." }, { headers });
  }

  // Change request for bio/photos — ops-edited to keep quality. Persisted to
  // an ops queue (it used to be discarded silently).
  const note = String(form.get("note") ?? "").trim();
  if (!note) {
    return data({ error: "Tell us what you'd like changed." }, { status: 400, headers });
  }
  await admin.from("guide_change_requests").insert({ guide_id: user.id, note });
  return data(
    { ok: "Thanks — our team will action this and reply." },
    { headers },
  );
}

export default function GuideProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { guide, languages, photos, canned } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink">Your profile</h1>

      {actionData && "ok" in actionData && (
        <p className="rounded-button bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {(actionData as any).ok}
        </p>
      )}
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded-button bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      {/* The one line that sells this guide, written by this guide. Two taps:
          type, save. No approval queue — putting ops between a guide and their
          own sentence would kill the voice we are trying to publish. */}
      <Form method="post" className="space-y-2 rounded-card border border-border bg-card p-4">
        <input type="hidden" name="intent" value="promise" />
        <p className="text-sm font-medium text-ink">Only with me</p>
        <p className="text-sm text-ink-soft">
          One thing a trekker gets with you and with no other guide. Write it
          the way you speak. Short — about ten words.
        </p>
        <textarea
          name="only_with_me"
          rows={2}
          maxLength={90}
          defaultValue={guide?.only_with_me ?? ""}
          placeholder="You sleep at my family house in Ghandruk, not teahouse."
          className="w-full rounded-button border border-border px-3 py-2 text-base"
        />
        <div className="text-xs text-ink-soft">
          <p>Good:</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            <li>I know which teahouse at Lobuche has hot water.</li>
            <li>I carry a real camera. You go home with photos.</li>
          </ul>
          <p className="mt-1.5">
            Not good: “Amazing trek”, “Unforgettable experience”. Say the real
            thing you do.
          </p>
        </div>
        <Button type="submit" size="sm" loading={busy}>
          Save
        </Button>
      </Form>

      {/* ── Your photographs. This is the section whose absence shows: a
           guide could not add a picture of themselves at all, so 47 of 48
           profiles carry one seeded headshot and no gallery. */}
      <GuidePhotos photos={photos} busy={busy} />

      {/* ── The guide's own account of themselves. */}
      <Form method="post" className="space-y-3 rounded-card border border-border bg-card p-4">
        <input type="hidden" name="intent" value="story" />
        <div>
          <p className="text-sm font-medium text-ink">About you</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            This is the longest thing a trekker reads about you. Where you are
            from, how you walk, what you care about. Your words, not ours.
          </p>
        </div>
        <label className="block text-sm text-ink-soft">
          Short line under your name
          <input
            name="hook_line"
            maxLength={120}
            defaultValue={guide?.hook_line ?? ""}
            placeholder="Knows every teahouse from Lukla to Gorak Shep"
            className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink"
          />
        </label>
        <label className="block text-sm text-ink-soft">
          Your story
          <textarea
            name="bio"
            rows={7}
            maxLength={4000}
            defaultValue={guide?.bio ?? ""}
            placeholder="I grew up in Khumjung, an hour below Everest View Hotel…"
            className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink"
          />
        </label>
        <Button type="submit" size="sm" loading={busy}>
          Save
        </Button>
      </Form>

      <GuideVoice url={guide?.voice_intro_url ?? null} busy={busy} />

      {/* ── Languages: add and remove, which nothing offered before. */}
      <section className="space-y-3 rounded-card border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-ink">Languages you speak</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            Trekkers filter by this. Every one you add puts you in another
            search.
          </p>
        </div>
        {languages.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {languages.map((l: any) => (
              <li key={l.language}>
                <Form method="post" className="flex items-center gap-1 rounded-full border border-border bg-paper py-1 pl-3 pr-1 text-sm">
                  <input type="hidden" name="intent" value="language" />
                  <input type="hidden" name="language" value={l.language} />
                  <span className="text-ink">{l.language}</span>
                  <span className="text-xs text-ink-soft">{l.proficiency}</span>
                  <button
                    name="delete"
                    value="1"
                    aria-label={`Remove ${l.language}`}
                    className="ml-0.5 flex size-6 items-center justify-center rounded-full text-ink-soft hover:bg-ember/10 hover:text-ember"
                  >
                    ×
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">None yet.</p>
        )}
        <Form method="post" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="intent" value="language" />
          <label className="flex-1 text-sm text-ink-soft">
            Add a language
            <input
              name="language"
              required
              placeholder="German"
              className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink"
            />
          </label>
          <label className="text-sm text-ink-soft">
            How well
            <select
              name="proficiency"
              defaultValue="conversational"
              className="mt-1 block rounded-button border border-border px-3 py-2 text-base text-ink"
            >
              <option value="basic">A little</option>
              <option value="conversational">Enough to guide</option>
              <option value="fluent">Fluent</option>
              <option value="native">First language</option>
            </select>
          </label>
          <Button type="submit" size="sm" loading={busy}>
            Add
          </Button>
        </Form>
      </section>

      {/* ── The facts. Licence number, tier and status stay ops-controlled and
           are shown read-only so a guide can see what we hold. */}
      <Form method="post" className="space-y-3 rounded-card border border-border bg-card p-4">
        <input type="hidden" name="intent" value="basics" />
        <p className="text-sm font-medium text-ink">Your details</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-ink-soft">
            Home district
            <input
              name="home_district"
              defaultValue={guide?.home_district ?? ""}
              className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink"
            />
          </label>
          <label className="block text-sm text-ink-soft">
            Years guiding
            <input
              name="years_experience"
              type="number"
              min={0}
              max={70}
              defaultValue={guide?.years_experience ?? ""}
              className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink"
            />
          </label>
          {/* A date input prints its boxes in the browser's locale, so a guide
              in Nepal is shown mm/dd/yyyy and has no way to tell whether the
              5 they typed was the day or the month. The widget order is not
              ours to set — so the saved value is echoed back in words, where
              "5 January 2028" cannot be read two ways. */}
          <label className="block text-sm text-ink-soft">
            Licence expires
            <input
              name="licence_expiry"
              type="date"
              defaultValue={guide?.licence_expiry ?? ""}
              className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink"
            />
            {guide?.licence_expiry && (
              <span className="mt-1 block text-xs text-ink-soft">
                Saved as {fmtDate(guide.licence_expiry)}
              </span>
            )}
          </label>
          <label className="block text-sm text-ink-soft">
            We should call you
            <select
              name="gender"
              defaultValue={guide?.gender ?? ""}
              className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink"
            >
              <option value="">Prefer not to say (they)</option>
              <option value="female">She</option>
              <option value="male">He</option>
              <option value="other">They</option>
            </select>
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="porter_welfare"
            defaultChecked={!!guide?.porter_welfare}
            className="mt-0.5 size-4"
          />
          <span>
            I promise fair pay, weight limits, insurance and proper gear for
            every porter on my treks.
            <span className="block text-ink-soft">Shown on your profile.</span>
          </span>
        </label>
        <Button type="submit" size="sm" loading={busy}>
          Save
        </Button>
      </Form>

      <section className="space-y-1 rounded-card border border-border bg-card p-4 text-sm">
        <p className="mb-2 text-sm font-medium text-ink">Held by our team</p>
        <Row label="Licence no." value={guide?.licence_no} />
        <Row label="Status" value={guide?.status} />
        <Row label="Tier" value={`${guide?.tier ?? 0}`} />
        <Row
          label="Current day rate"
          value={guide?.day_rate_usd_cents ? formatUsd(guide.day_rate_usd_cents) : "—"}
        />
        <p className="pt-2 text-ink-soft">
          These we check and set ourselves — ask below if any of it is wrong.
        </p>
      </section>

      {/* Quick answers — tappable in the message composer. Most guides reply
          on a phone, in their second or third language, on patchy signal; a
          tap that inserts a sentence they already wrote beats any amount of
          typing affordance. */}
      <section className="space-y-3 rounded-card border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-ink">Quick answers</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            These appear as buttons above your keyboard when you reply. Tap one
            and it fills the box — you can still change the words before sending.
          </p>
        </div>
        {canned.map((c: any) => (
          <Form key={c.id} method="post" className="space-y-2 rounded-button border border-border p-3">
            <input type="hidden" name="intent" value="canned" />
            <input type="hidden" name="canned_id" value={c.id} />
            <input
              name="label"
              defaultValue={c.label}
              className="w-full rounded-button border border-border px-3 py-2 text-sm font-medium"
            />
            <textarea
              name="body"
              rows={3}
              defaultValue={c.body}
              className="w-full rounded-button border border-border px-3 py-2 text-base"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="secondary">Save</Button>
              <button
                name="delete"
                value="1"
                className="rounded-button px-3 py-2 text-sm text-ember hover:bg-mist"
              >
                Remove
              </button>
            </div>
          </Form>
        ))}
        <Form method="post" className="space-y-2 rounded-button border border-dashed border-border p-3">
          <input type="hidden" name="intent" value="canned" />
          <input
            name="label"
            placeholder="Short name, e.g. Porters"
            className="w-full rounded-button border border-border px-3 py-2 text-sm"
          />
          <textarea
            name="body"
            rows={3}
            placeholder="The answer you keep writing again and again."
            className="w-full rounded-button border border-border px-3 py-2 text-base"
          />
          <Button type="submit" size="sm">Add answer</Button>
        </Form>
      </section>

      {/* Guide-editable commercial fields */}
      <Form method="post" className="space-y-3 rounded-card border border-border bg-card p-4">
        <input type="hidden" name="intent" value="commercial" />
        <p className="text-sm font-medium text-ink">Rate & payout</p>
        <label className="block text-sm">
          <span className="text-ink-soft">Day rate (USD)</span>
          <input
            name="day_rate_usd"
            type="number"
            defaultValue={guide?.day_rate_usd_cents ? guide.day_rate_usd_cents / 100 : ""}
            className="mt-1 w-full rounded-button border border-border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Payout method</span>
          <select
            name="payout_method"
            defaultValue={guide?.payout_method ?? ""}
            className="mt-1 w-full rounded-button border border-border px-3 py-2"
          >
            <option value="esewa">eSewa</option>
            <option value="khalti">Khalti</option>
            <option value="bank">Bank</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Payout account</span>
          <input
            name="payout_account"
            defaultValue={guide?.payout_account ?? ""}
            className="mt-1 w-full rounded-button border border-border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Name on the account</span>
          <input
            name="payout_account_name"
            defaultValue={guide?.payout_account_name ?? ""}
            placeholder="Exactly as your bank has it"
            className="mt-1 w-full rounded-button border border-border px-3 py-2"
          />
        </label>
        <Button type="submit" size="sm" loading={busy}>
          Save
        </Button>
      </Form>

      {/* What is left for ops. Bio and photos used to be asked for here and
          waited on; now only the things a guide genuinely cannot set alone. */}
      <Form method="post" className="space-y-2 rounded-card border border-border bg-card p-4">
        <input type="hidden" name="intent" value="request" />
        <p className="text-sm font-medium text-ink">Ask our team for something else</p>
        <p className="text-sm text-ink-soft">
          Your name, your licence number, or anything above that looks wrong.
        </p>
        <textarea
          name="note"
          rows={3}
          placeholder="e.g. My licence number has a typo — it should end 4471."
          className="w-full rounded-button border border-border px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary">
          Send request
        </Button>
      </Form>
    </div>
  );
}

/**
 * The guide's photographs: see them, add one, remove one, choose which is the
 * portrait.
 *
 * Uploading goes through /api/journal-photo, which strips the GPS out of the
 * EXIF before a byte is stored — a guide uploading off their phone should not
 * publish the coordinates of their own house. The row is only written once the
 * file is up, so a failed upload leaves nothing behind.
 *
 * Alt text is required because the column is NOT NULL and because these end up
 * on indexed public pages; it is asked for in plain words, not as "alt text".
 */
function GuidePhotos({
  photos,
  busy,
}: {
  photos: Array<{ id: string; url: string; kind: string; alt_text: string }>;
  busy: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/journal-photo", { method: "POST", body });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Upload failed.");
      setUrl(json.url);
    } catch (e: any) {
      setErr(e.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="space-y-3 rounded-card border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-ink">Your photographs</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          Your face, and the trail as you see it. The first one is what
          trekkers see beside your name.
        </p>
      </div>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <li key={p.id} className="space-y-1">
              <div className="relative overflow-hidden rounded-button border border-border">
                <img src={p.url} alt={p.alt_text} className="aspect-square w-full object-cover" />
                {p.kind === "headshot" && (
                  <span className="absolute left-1 top-1 rounded-full bg-pine px-1.5 py-0.5 text-[10px] font-semibold text-paper">
                    Main
                  </span>
                )}
              </div>
              <div className="flex gap-2 text-xs">
                {p.kind !== "headshot" && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="photo" />
                    <input type="hidden" name="photo_id" value={p.id} />
                    <button name="make_main" value="1" className="text-moss underline">
                      Make main
                    </button>
                  </Form>
                )}
                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (!confirm("Remove this photo?")) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="photo" />
                  <input type="hidden" name="photo_id" value={p.id} />
                  <button name="delete" value="1" className="text-ember underline">
                    Remove
                  </button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Form method="post" className="space-y-2 border-t border-border pt-3">
        <input type="hidden" name="intent" value="photo" />
        <input type="hidden" name="url" value={url ?? ""} />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-button file:border-0 file:bg-mist file:px-3 file:py-2 file:text-sm file:text-ink"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
          }}
        />
        {uploading && <p className="text-sm text-ink-soft">Sending the photo…</p>}
        {err && <p className="text-sm text-ember">{err}</p>}
        {url && (
          <>
            <img
              src={url}
              alt=""
              className="h-24 w-24 rounded-button border border-border object-cover"
            />
            <label className="block text-sm text-ink-soft">
              What is in this photo?
              <input
                name="alt_text"
                required
                maxLength={160}
                placeholder="Me at Gorak Shep, last April"
                className="mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink"
              />
            </label>
            <Button type="submit" size="sm" loading={busy}>
              Add this photo
            </Button>
          </>
        )}
      </Form>
    </section>
  );
}

/**
 * The voice introduction.
 *
 * A file picker rather than an in-browser recorder: `accept="audio/*"` opens
 * the phone's own voice-memo app on both Android and iOS, which is a recorder
 * the guide already knows how to use and which does not need microphone
 * permission inside a web page on a cheap handset.
 */
function GuideVoice({ url, busy }: { url: string | null; busy: boolean }) {
  const [fresh, setFresh] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/guide-voice", { method: "POST", body });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Upload failed.");
      setFresh(json.url);
    } catch (e: any) {
      setErr(e.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="space-y-3 rounded-card border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-ink">Your voice</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          About a minute. Say your name, where you are from, and one thing you
          want a trekker to know. Hearing you is the strongest thing on your
          profile.
        </p>
      </div>

      {url && !fresh && (
        <div className="space-y-2">
          <audio controls src={url} className="w-full" />
          <Form method="post">
            <input type="hidden" name="intent" value="voice" />
            <button name="delete" value="1" className="text-xs text-ember underline">
              Remove recording
            </button>
          </Form>
        </div>
      )}

      <Form method="post" className="space-y-2">
        <input type="hidden" name="intent" value="voice" />
        <input type="hidden" name="url" value={fresh ?? ""} />
        <label className="block text-sm text-ink-soft">
          {url ? "Record a new one" : "Record one"}
          <input
            type="file"
            accept="audio/*"
            className="mt-1 block w-full text-sm text-ink-soft file:mr-3 file:rounded-button file:border-0 file:bg-mist file:px-3 file:py-2 file:text-sm file:text-ink"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) send(f);
            }}
          />
        </label>
        {uploading && <p className="text-sm text-ink-soft">Sending the recording…</p>}
        {err && <p className="text-sm text-ember">{err}</p>}
        {fresh && (
          <>
            <audio controls src={fresh} className="w-full" />
            <p className="text-xs text-ink-soft">Listen back before you save it.</p>
            <Button type="submit" size="sm" loading={busy}>
              Use this recording
            </Button>
          </>
        )}
      </Form>
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right text-ink">{value || "—"}</span>
    </div>
  );
}
