import { Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.journals.$id";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { EntryForm, JournalMetaForm } from "~/components/JournalEditor";
import {
  journalableBookings,
  parseEntryForm,
  saveTags,
  uniqueSlug,
  validateDraft,
  validateForPublish,
} from "~/lib/journals.server";
import type { JournalEntry, JournalTag } from "~/lib/journals";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireUser(request, env, "ops");

  const { data: journal } = await admin
    .from("journals")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!journal) throw new Response("Not found", { status: 404 });

  const [{ data: entries }, { data: routes }, { data: tags }, bookings] = await Promise.all([
    admin
      .from("journal_entries")
      .select("*")
      .eq("journal_id", journal.id)
      .order("day_no"),
    admin.from("routes").select("id, name").order("name"),
    admin.from("journal_tags").select("kind, value").eq("journal_id", journal.id),
    journalableBookings(admin, journal.guide_id),
  ]);

  return data(
    {
      journal,
      entries: (entries ?? []) as JournalEntry[],
      routes: routes ?? [],
      tags: (tags ?? []) as JournalTag[],
      bookings,
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireUser(request, env, "ops");
  const form = await request.formData();
  const intent = String(form.get("intent"));

  const { data: journal } = await admin
    .from("journals")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!journal) throw new Response("Not found", { status: 404 });

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

  if (intent === "publish" || intent === "unpublish") {
    if (intent === "unpublish") {
      await admin
        .from("journals")
        .update({ status: "draft", published_at: null })
        .eq("id", journal.id);
      return data({ ok: "Unpublished." }, { headers });
    }
    const { data: entries } = await admin
      .from("journal_entries")
      .select("day_no, photos")
      .eq("journal_id", journal.id);
    const bad = validateForPublish(journal, entries ?? []);
    if (bad) return data({ error: bad }, { status: 400, headers });
    await admin
      .from("journals")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", journal.id);
    return data({ ok: "Published — it is live." }, { headers });
  }

  // meta
  const num = (k: string) => (form.get(k) ? Number(form.get(k)) : null);
  const str = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v || null;
  };
  const patch = {
    title: String(form.get("title") ?? "").trim(),
    start_date: String(form.get("start_date") ?? ""),
    end_date: String(form.get("end_date") ?? ""),
    route_id: str("route_id"),
    booking_id: str("booking_id"),
    pre_platform: form.get("pre_platform") === "on",
    pre_platform_note: str("pre_platform_note"),
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
    guide_id: journal.guide_id,
  };
  const bad = validateDraft(patch);
  if (bad) return data({ error: bad }, { status: 400, headers });

  const slug =
    patch.title !== journal.title || patch.start_date !== journal.start_date
      ? await uniqueSlug(admin, patch.title, patch.start_date, journal.id)
      : journal.slug;

  const { error } = await admin
    .from("journals")
    .update({ ...patch, slug })
    .eq("id", journal.id);
  if (error) return data({ error: error.message }, { status: 400, headers });
  await saveTags(admin, journal.id, form);
  return data({ ok: "Saved." }, { headers });
}

export default function OpsJournalEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { journal, entries, routes, bookings, tags } = loaderData as any;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/ops/journals" className="text-sm text-primary hover:underline">
            ← All journals
          </Link>
          <h1 className="mt-1 font-display text-2xl text-ink">{journal.title}</h1>
        </div>
        {journal.status === "published" && (
          <Link
            to={`/journals/${journal.slug}`}
            className="rounded border border-line px-3 py-1.5 text-sm text-ink hover:bg-mist"
          >
            View live →
          </Link>
        )}
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

      <JournalMetaForm
        journal={journal}
        routes={routes}
        bookings={bookings}
        tags={tags}
        coverChoices={coverChoices}
        canPublish
        busy={nav.state !== "idle"}
      />

      <section className="space-y-4">
        <h2 className="font-display text-xl text-ink">
          The days ({entries.length})
        </h2>
        {entries.map((e: JournalEntry) => (
          <EntryForm key={e.id} entry={e} nextDay={nextDay} guideId={journal.guide_id} />
        ))}
        <EntryForm nextDay={nextDay} guideId={journal.guide_id} />
      </section>
    </div>
  );
}
