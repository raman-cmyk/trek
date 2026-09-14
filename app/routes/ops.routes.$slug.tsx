import { useState } from "react";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.routes.$slug";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { Badge } from "~/components/ops/ui";
import { DIFFICULTIES, changedFields, parseRoute } from "~/lib/route-editor";
import { legsOf, totalAscent, totalDescent } from "~/lib/trek-day";

/**
 * The office fixes a route.
 *
 * The founder's ask: "inside the experience section there should be inline
 * editing capabilities to modify route details and itineraries, allowing
 * administrators to directly fix any issues for the guides." A guide proposes
 * a route with a village misspelled or an altitude four hundred metres out,
 * and until now correcting it meant writing a migration.
 *
 * One form, one save, no JavaScript required: the itinerary is a table of
 * plain inputs, and the browser posts the lot. The spare rows at the bottom
 * are how you add days; emptying a row is how you delete one. Days renumber
 * themselves on save.
 *
 * Everything here is shared by every guide who runs this route, which is the
 * point — one correction fixes eleven listings.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const { data: route } = await admin
    .from("routes")
    .select("*, guide:guides!routes_created_by_guide_id_fkey(slug, users(full_name))")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!route) throw new Response("Not found", { status: 404 });

  // Who this correction reaches — the reason to be careful, shown on the page.
  const { count: offerings } = await admin
    .from("offerings")
    .select("id", { count: "exact", head: true })
    .eq("route_id", route.id);

  return data({ route, offerings: offerings ?? 0 }, { headers });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const rows = Number(form.get("rows") ?? 0);

  const { patch, error } = parseRoute(form, rows);
  if (!patch) return data({ error }, { status: 400, headers });

  const { data: before } = await admin
    .from("routes")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  const { error: dbError } = await admin.from("routes").update(patch).eq("slug", params.slug);
  if (dbError) return data({ error: dbError.message }, { status: 400, headers });

  const moved = changedFields(before ?? {}, patch);
  return data(
    {
      ok: moved.length
        ? `Saved — ${moved.length === 1 ? moved[0].replace(/_/g, " ") : `${moved.length} things`} changed.`
        : "Nothing had changed.",
    },
    { headers },
  );
}

const input =
  "w-full rounded-button border border-border bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary";
const area = `${input} leading-relaxed`;

export default function OpsRouteEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { route, offerings } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const existing = (route.day_stops ?? []) as any[];
  // Three spare rows without JavaScript, more on request with it.
  const [rows, setRows] = useState(existing.length + 3);
  const legs = legsOf(existing);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/ops/routes" className="text-sm text-primary hover:underline">
          ← All routes
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl text-ink">{route.name}</h1>
          <Badge tone={route.status === "live" ? "green" : route.status === "pending" ? "amber" : "neutral"}>
            {route.status}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">
          {offerings > 0 ? (
            <>
              <span className="font-mono text-ink">{offerings}</span>{" "}
              {offerings === 1 ? "trip uses" : "trips use"} this route — a correction here fixes
              all of them.
            </>
          ) : (
            "No trips on this route yet."
          )}{" "}
          <Link to={`/routes/${route.slug}`} className="text-primary hover:underline">
            public page →
          </Link>{" "}
          ·{" "}
          <Link to={`/ops/routes/${route.slug}/page`} className="text-primary hover:underline">
            page builder →
          </Link>
        </p>
        {route.guide?.users?.full_name && (
          <p className="mt-0.5 text-caption text-muted">
            Proposed by {route.guide.users.full_name}.
          </p>
        )}
      </div>

      {actionData && "ok" in actionData && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {(actionData as any).ok}
        </p>
      )}
      {actionData && "error" in actionData && (actionData as any).error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">{(actionData as any).error}</p>
      )}

      <Form method="post" className="space-y-8">
        <input type="hidden" name="rows" value={rows} />

        <section className="space-y-3">
          <h2 className="font-display text-lg text-ink">The facts</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Name" name="name" defaultValue={route.name} />
            <Field label="Region" name="region" defaultValue={route.region} />
            <Field label="Start" name="start_point" defaultValue={route.start_point} />
            <Field label="End" name="end_point" defaultValue={route.end_point} />
            <Field label="Days" name="typical_days" defaultValue={route.typical_days} type="number" />
            <label className="block">
              <span className="text-caption text-ink-soft">Highest point (m)</span>
              <input
                name="max_altitude_m"
                type="number"
                defaultValue={route.max_altitude_m ?? ""}
                className={input}
              />
              <span className="mt-0.5 block text-caption text-muted">
                Taken from the itinerary below when there is one.
              </span>
            </label>
            <Field label="Distance (km)" name="distance_km" defaultValue={route.distance_km} type="number" step="0.1" />
            <label className="block">
              <span className="text-caption text-ink-soft">Grade</span>
              <select name="difficulty" defaultValue={route.difficulty ?? ""} className={input}>
                <option value="">—</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-caption text-ink-soft">Best months</span>
              <input
                name="season_months"
                defaultValue={(route.season_months ?? []).join(", ")}
                placeholder="3, 4, 5, 10, 11"
                className={input}
              />
              <span className="mt-0.5 block text-caption text-muted">
                Numbers, 1–12, separated by commas.
              </span>
            </label>
          </div>
        </section>

        {/* ── The itinerary ─────────────────────────────────────────────
             A day per row. Blank rows at the bottom are how you add days;
             emptying a row is how you remove one. */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-lg text-ink">Day by day</h2>
            {legs.length > 0 && (
              <p className="font-mono text-caption text-muted">
                {totalAscent(existing).toLocaleString("en-US")} m up ·{" "}
                {totalDescent(existing).toLocaleString("en-US")} m down · climb and drop are worked
                out from the altitudes, not typed
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-mist text-left text-caption uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-10 px-2 py-2">Day</th>
                  <th className="px-2 py-2">Place</th>
                  <th className="w-24 px-2 py-2">Altitude</th>
                  <th className="w-28 px-2 py-2">Hours</th>
                  <th className="w-20 px-2 py-2">Km</th>
                  <th className="w-32 px-2 py-2">Sleeps in</th>
                  <th className="px-2 py-2">Note on the public page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from({ length: rows }).map((_, i) => {
                  const s = existing[i] ?? {};
                  return (
                    <tr key={i} className={i >= existing.length ? "bg-surface/60" : undefined}>
                      <td className="px-2 py-1.5 font-mono text-caption text-muted">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <input name={`stop.${i}.place`} defaultValue={s.place ?? ""} className={input} />
                        <input type="hidden" name={`stop.${i}.lat`} defaultValue={s.lat ?? ""} />
                        <input type="hidden" name={`stop.${i}.lng`} defaultValue={s.lng ?? ""} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          name={`stop.${i}.altitude_m`}
                          type="number"
                          defaultValue={s.altitude_m ?? ""}
                          className={input}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          name={`stop.${i}.hours`}
                          defaultValue={s.hours ?? ""}
                          placeholder={legs[i]?.hours ?? ""}
                          className={input}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input name={`stop.${i}.km`} type="number" step="0.1" defaultValue={s.km ?? ""} className={input} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          name={`stop.${i}.sleep`}
                          defaultValue={s.sleep ?? ""}
                          placeholder="Teahouse"
                          className={input}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input name={`stop.${i}.note`} defaultValue={s.note ?? ""} className={input} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setRows((r) => r + 3)}
              className="rounded-button border border-border px-3 py-1.5 text-sm text-ink hover:bg-mist"
            >
              Three more rows
            </button>
            <p className="text-caption text-muted">
              Leave Hours blank and the page estimates it from the climb and says it is an estimate.
              Type a real one and it says nothing of the sort.
            </p>
          </div>
        </section>

        {/* ── The words ────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="font-display text-lg text-ink">The words on the page</h2>
          <p className="text-caption text-muted">
            Altitude, insurance, permits, money, power, porters, tipping and etiquette are written
            once for every route and adjust to this one's height — you do not fill those in here.
            What goes below is only what is true of this walk.
          </p>
          <Area label="Summary" name="summary" defaultValue={route.summary} rows={2} hint="One sentence. This is the card, the search result and the meta description." />
          <Area label="Highlights" name="highlights" defaultValue={(route.highlights ?? []).join("\n")} rows={7} hint="One per line. The reasons to pick this walk over another one." />
          <Area label="The walk" name="overview" defaultValue={route.overview} rows={10} hint="Several paragraphs, blank line between them. What somebody reads when they are deciding." />
          <Area label="Getting to the start" name="getting_there" defaultValue={route.getting_there} rows={6} hint="The drive, the flight, the hours, what goes wrong. Most-asked practical question after price." />
          <Area label="Where you sleep on this trail" name="accommodation" defaultValue={route.accommodation} rows={5} hint="Which lodges are good, which night is the rough one." />
          <Area label="Eating on this trail" name="food" defaultValue={route.food} rows={4} />
          <Area label="Water" name="water_note" defaultValue={route.water_note} rows={3} hint="Plastic bans, refill stations, the last shop." />
          <Area label="Extra kit, just for this route" name="packing_extra" defaultValue={(route.packing_extra ?? []).join("\n")} rows={4} hint="One per line. Only what a normal trek would not need." />
        </section>

        <div className="sticky bottom-0 -mx-4 border-t border-border bg-paper/95 px-4 py-3 backdrop-blur">
          <button
            disabled={busy}
            className="rounded-button bg-moss px-5 py-2.5 text-sm font-medium text-white hover:bg-pine disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save the route"}
          </button>
        </div>
      </Form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-caption text-ink-soft">{label}</span>
      <input name={name} type={type} step={step} defaultValue={defaultValue ?? ""} className={input} />
    </label>
  );
}

function Area({
  label,
  name,
  defaultValue,
  rows = 4,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-caption text-ink-soft">{label}</span>
      {hint && <span className="mb-1 block text-caption text-muted">{hint}</span>}
      <textarea name={name} rows={rows} defaultValue={defaultValue ?? ""} className={area} />
    </label>
  );
}
