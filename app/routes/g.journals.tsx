import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/g.journals";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Button } from "~/components/Button";
import { journalableBookings, uniqueSlug, validateDraft } from "~/lib/journals.server";
import { fmtDate } from "~/lib/format";

/**
 * A guide's own journals. Plain words, big targets, two taps to start one —
 * this gets used standing in a lodge on a phone, not at a desk.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const [{ data: journals }, bookings] = await Promise.all([
    admin
      .from("journals")
      .select("id, slug, title, status, start_date, end_date")
      .eq("guide_id", user.id)
      .order("start_date", { ascending: false }),
    journalableBookings(admin, user.id),
  ]);
  return data({ journals: journals ?? [], bookings }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();

  const bookingId = String(form.get("booking_id") ?? "");
  if (!bookingId) {
    return data({ error: "Pick which trek this was." }, { status: 400, headers });
  }
  const { data: b } = await admin
    .from("bookings")
    .select("id, start_date, end_date, guide_id, offering:offerings(title, route_id)")
    .eq("id", bookingId)
    .eq("guide_id", user.id)
    .maybeSingle();
  if (!b) return data({ error: "That trek isn't yours." }, { status: 400, headers });

  const draft = {
    guide_id: user.id,
    title: String(form.get("title") ?? "").trim() || (b as any).offering?.title || "A trek",
    start_date: b.start_date,
    end_date: b.end_date,
    route_id: (b as any).offering?.route_id ?? null,
    booking_id: b.id,
  };
  const bad = validateDraft(draft);
  if (bad) return data({ error: bad }, { status: 400, headers });

  const slug = await uniqueSlug(admin, draft.title, draft.start_date);
  const { data: created, error } = await admin
    .from("journals")
    .insert({ ...draft, slug })
    .select("id")
    .single();
  if (error) return data({ error: error.message }, { status: 400, headers });
  return redirect(`/g/journals/${created.id}`, { headers });
}

export default function GuideJournals({ loaderData, actionData }: Route.ComponentProps) {
  const { journals, bookings } = loaderData as any;
  const nav = useNavigation();
  const cls = "mt-1 w-full rounded border border-line px-3 py-2.5 text-base";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Your treks, written up</h1>
        <p className="mt-1 max-w-[46ch] text-sm text-ink-soft">
          Each finished trek can become a page with your photos and your words.
          This is what makes people choose you.
        </p>
      </div>

      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">
          {(actionData as any).error}
        </p>
      )}

      {bookings.length > 0 ? (
        <Form method="post" className="space-y-3 rounded-md border border-line bg-card p-4">
          <p className="text-sm font-medium text-ink">Write up a trek</p>
          <label className="block text-sm text-ink-soft">
            Which one?
            <select name="booking_id" className={cls} required>
              <option value="">— pick a finished trek —</option>
              {bookings.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {fmtDate(b.start_date)} · {b.offering?.title ?? "trek"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-ink-soft">
            Title (you can change it later)
            <input name="title" className={cls} placeholder="Manaslu in late October" />
          </label>
          <Button type="submit" loading={nav.state !== "idle"}>
            Start writing
          </Button>
        </Form>
      ) : (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-ink-soft">
          When you finish a trek it appears here to write up. If you led treks
          before Trek and want those on your page too, message the office — we
          will write them with you.
        </p>
      )}

      <section className="space-y-2">
        {journals.map((j: any) => (
          <Link
            key={j.id}
            to={`/g/journals/${j.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-line bg-card p-3.5 hover:border-sage"
          >
            <span className="min-w-0">
              <span className="block font-medium text-ink">{j.title}</span>
              <span className="block font-mono text-xs text-muted">
                {fmtDate(j.start_date)}
              </span>
            </span>
            <span
              className={
                j.status === "published"
                  ? "shrink-0 rounded-pill bg-mist px-2.5 py-1 text-xs text-moss"
                  : "shrink-0 rounded-pill bg-wheat/40 px-2.5 py-1 text-xs text-ink"
              }
            >
              {j.status === "published" ? "live" : "draft"}
            </span>
          </Link>
        ))}
        {journals.length === 0 && (
          <p className="text-sm text-muted">Nothing written up yet.</p>
        )}
      </section>
    </div>
  );
}
