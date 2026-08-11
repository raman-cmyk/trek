import { Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/g.journals.$id";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { EntryForm, JournalMetaForm } from "~/components/JournalEditor";
import {
  parseEntryForm,
  saveTags,
  uniqueSlug,
  validateDraft,
  validateForPublish,
} from "~/lib/journals.server";
import type { JournalEntry, JournalTag } from "~/lib/journals";

/**
 * A guide editing their own journal. Same editor as ops, minus publish: the
 * consent boxes and the real-trip rule get a second pair of eyes before
 * anything with a client's name on it goes public. The database enforces that
 * too (guard_journal_publish), so this is not the only lock.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");

  const { data: journal } = await admin
    .from("journals")
    .select("*")
    .eq("id", params.id)
    .eq("guide_id", user.id)
    .maybeSingle();
  if (!journal) throw new Response("Not found", { status: 404 });

  const [{ data: entries }, { data: routes }, { data: tags }] = await Promise.all([
    admin.from("journal_entries").select("*").eq("journal_id", journal.id).order("day_no"),
    admin.from("routes").select("id, name").order("name"),
    admin.from("journal_tags").select("kind, value").eq("journal_id", journal.id),
  ]);

  return data(
    {
      journal,
      entries: (entries ?? []) as JournalEntry[],
      routes: routes ?? [],
      tags: (tags ?? []) as JournalTag[],
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const intent = String(form.get("intent"));

  const { data: journal } = await admin
    .from("journals")
    .select("*")
    .eq("id", params.id)
    .eq("guide_id", user.id)
    .maybeSingle();
  if (!journal) throw new Response("Not found", { status: 404 });
  if (journal.status === "published" && intent !== "noop") {
    return data(
      { error: "This one is live. Message the office to change it." },
      { status: 400, headers },
    );
  }

  if (intent === "entry") {
    const e = parseEntryForm(form);
    if (!e.title) return data({ error: "Give the day a title." }, { status: 400, headers });
    const entryId = form.get("entry_id");
    const row = { ...e, journal_id: journal.id };
    const { error } = entryId
      ? await admin.from("journal_entries").update(row).eq("id", String(entryId))
      : await admin.from("journal_entries").insert(row);
    if (error) return data({ error: error.message }, { status: 400, headers });
    return data({ ok: "Day saved." }, { headers });
  }

  if (intent === "delete_entry") {
    await admin.from("journal_entries").delete().eq("id", String(form.get("entry_id")));
    return data({ ok: "Day removed." }, { headers });
  }

  if (intent === "submit") {
    // Same album rules ops publishes against, checked here so the guide finds
    // out on their own phone rather than three days later from the office.
    const { data: entries } = await admin
      .from("journal_entries")
      .select("day_no, photos")
      .eq("journal_id", journal.id);
    const bad = validateForPublish(journal, entries ?? []);
    if (bad) return data({ error: bad }, { status: 400, headers });
    // No status change (only ops publishes) — this just tells the office it's
    // ready, via the change-request queue they already watch.
    await admin.from("guide_change_requests").insert({
      guide_id: user.id,
      note: `Journal ready to publish: ${journal.title} (/ops/journals/${journal.id})`,
    });
    return data({ ok: "Sent to the office. They will check it and put it live." }, { headers });
  }

  const num = (k: string) => (form.get(k) ? Number(form.get(k)) : null);
  const str = (k: string) => String(form.get(k) ?? "").trim() || null;
  const patch = {
    title: String(form.get("title") ?? "").trim(),
    start_date: String(form.get("start_date") ?? ""),
    end_date: String(form.get("end_date") ?? ""),
    route_id: str("route_id"),
    group_label: str("group_label"),
    group_anon: str("group_anon"),
    max_altitude_m: num("max_altitude_m"),
    distance_km: num("distance_km"),
    pass_crossed: str("pass_crossed"),
    weather_note: str("weather_note"),
    cover_photo_url: str("cover_photo_url"),
    guide_note: str("guide_note"),
    client_note: str("client_note"),
    client_note_author: str("client_note_author"),
    client_names_ok: form.get("client_names_ok") === "on",
    client_photos_ok: form.get("client_photos_ok") === "on",
    // Not editable by the guide — the proof-of-trip link stays as created.
    guide_id: journal.guide_id,
    booking_id: journal.booking_id,
    pre_platform: journal.pre_platform,
  };
  const bad = validateDraft(patch);
  if (bad) return data({ error: bad }, { status: 400, headers });

  const slug =
    patch.title !== journal.title
      ? await uniqueSlug(admin, patch.title, patch.start_date, journal.id)
      : journal.slug;
  const { error } = await admin.from("journals").update({ ...patch, slug }).eq("id", journal.id);
  if (error) return data({ error: error.message }, { status: 400, headers });
  await saveTags(admin, journal.id, form);
  return data({ ok: "Saved." }, { headers });
}

export default function GuideJournalEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { journal, entries, routes, tags } = loaderData as any;
  // Every frame already uploaded to a day — the cover is nearly always one.
  const coverChoices: string[] = [
    ...new Set(
      (entries as JournalEntry[]).flatMap((e) =>
        (e.photos ?? []).filter((m) => m.kind !== "video").map((m) => m.url),
      ),
    ),
  ];
  const nav = useNavigation();
  const nextDay = entries.length ? Math.max(...entries.map((e: any) => e.day_no)) + 1 : 1;
  const live = journal.status === "published";

  return (
    <div className="space-y-5">
      <div>
        <Link to="/g/journals" className="text-sm text-primary hover:underline">
          ← Your treks
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">{journal.title}</h1>
      </div>

      {actionData && "ok" in actionData && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {(actionData as any).ok}
        </p>
      )}
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      {live ? (
        <div className="rounded-md border border-line bg-card p-4">
          <p className="text-sm text-ink">
            This journal is live on your page.
          </p>
          <Link
            to={`/journals/${journal.slug}`}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            See it →
          </Link>
        </div>
      ) : (
        <>
          <JournalMetaForm
            journal={journal}
            routes={routes}
            tags={tags}
            coverChoices={coverChoices}
            busy={nav.state !== "idle"}
          />

          <section className="space-y-4">
            <h2 className="font-display text-xl text-ink">The days ({entries.length})</h2>
            {entries.map((e: JournalEntry) => (
              <EntryForm key={e.id} entry={e} nextDay={nextDay} guideId={journal.guide_id} />
            ))}
            <EntryForm nextDay={nextDay} guideId={journal.guide_id} />
          </section>

          <form method="post" className="rounded-md border border-line bg-card p-4">
            <input type="hidden" name="intent" value="submit" />
            <p className="text-sm text-ink-soft">
              Finished? Send it to the office. They check the names and photos
              are agreed, then put it on your page.
            </p>
            <button className="mt-3 rounded bg-pine px-5 py-2.5 text-sm font-medium text-paper hover:bg-moss">
              Send to the office
            </button>
          </form>
        </>
      )}
    </div>
  );
}
