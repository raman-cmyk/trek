import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Parsing and rules for a guide-proposed route, shared by the guide's builder
 * and the office's review screen so the two cannot drift on what a valid route
 * is.
 */

export interface RouteStop {
  day: number;
  place: string;
  altitude_m: number | null;
  note?: string;
}

export interface RoutePatch {
  name: string;
  region: string;
  summary: string;
  difficulty: string;
  start_point: string;
  end_point: string;
  season_months: number[];
  typical_days: number;
  max_altitude_m: number | null;
  day_stops: RouteStop[];
}

export interface ParsedPermit {
  name: string;
  cost_usd_cents: number;
}

const DIFFICULTY = new Set(["easy", "moderate", "hard", "strenuous"]);

export function parseRouteForm(form: FormData): {
  patch?: RoutePatch;
  permits?: ParsedPermit[];
  error?: string;
} {
  const name = String(form.get("name") ?? "").trim();
  const region = String(form.get("region") ?? "").trim();
  const summary = String(form.get("summary") ?? "").trim();
  const start_point = String(form.get("start_point") ?? "").trim();
  const end_point = String(form.get("end_point") ?? "").trim();
  const difficulty = String(form.get("difficulty") ?? "moderate");

  if (name.length < 4) return { error: "Give the route the name people call it." };
  if (!region) return { error: "Pick the region it is in." };
  if (summary.length < 20) return { error: "Say a little more about what it is." };
  if (!start_point || !end_point) return { error: "Where does it start and finish?" };
  if (!DIFFICULTY.has(difficulty)) return { error: "Pick how hard it is." };

  const season_months = form
    .getAll("season_months")
    .map((m) => Number(m))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  if (!season_months.length) return { error: "Pick at least one month it can be walked." };

  // The day list. Each row is a place you sleep and how many nights; the day
  // numbers are derived from that rather than typed, so they cannot disagree
  // with the nights beside them.
  let stops: RouteStop[] = [];
  try {
    const raw = JSON.parse(String(form.get("stops") ?? "[]"));
    if (Array.isArray(raw)) {
      let day = 1;
      for (const s of raw) {
        const place = String(s?.place ?? "").trim().slice(0, 80);
        if (!place) continue;
        const alt = Number(s?.altitude_m);
        const nights = Math.max(1, Math.min(5, Math.round(Number(s?.nights) || 1)));
        stops.push({
          day,
          place,
          altitude_m: Number.isFinite(alt) && alt > 0 ? Math.round(alt) : null,
          ...(String(s?.note ?? "").trim() ? { note: String(s.note).trim().slice(0, 200) } : {}),
        });
        day += nights;
      }
    }
  } catch {
    return { error: "The day list didn't save. Try again." };
  }
  if (stops.length < 2) {
    return { error: "A route needs at least two places — where you sleep, in order." };
  }
  if (stops.length > 40) return { error: "That's more stops than we can take in one route." };

  let permits: ParsedPermit[] = [];
  try {
    const raw = JSON.parse(String(form.get("permits") ?? "[]"));
    if (Array.isArray(raw)) {
      permits = raw
        .map((p: any) => ({
          name: String(p?.name ?? "").trim().slice(0, 80),
          cost_usd_cents: Math.max(0, Math.round((Number(p?.cost_usd) || 0) * 100)),
        }))
        .filter((p) => p.name.length > 0)
        .slice(0, 8);
    }
  } catch {
    return { error: "The permits didn't save. Try again." };
  }

  const typical_days = stops.length
    ? Math.max(...stops.map((s) => s.day))
    : 1;
  const alts = stops.map((s) => s.altitude_m ?? 0);

  return {
    permits,
    patch: {
      name,
      region,
      summary,
      difficulty,
      start_point,
      end_point,
      season_months,
      typical_days,
      max_altitude_m: Math.max(...alts) || null,
      day_stops: stops,
    },
  };
}

/** A slug from the name, unique-ified when taken. */
export async function uniqueRouteSlug(
  admin: SupabaseClient,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .replace(/-+$/, "") || "route";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    let q = admin.from("routes").select("id").eq("slug", slug);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Replace a route's permit rows with exactly what was submitted. */
export async function saveRoutePermits(
  admin: SupabaseClient,
  routeId: string,
  permits: ParsedPermit[],
) {
  await admin.from("permits").delete().eq("route_id", routeId);
  if (!permits.length) return;
  await admin.from("permits").insert(
    permits.map((p) => ({
      route_id: routeId,
      name: p.name,
      cost_usd_cents: p.cost_usd_cents,
      // The office sets the rupee figure against the day's rate when it
      // checks the route; a guide quoting dollars should not be asked to
      // invent an exchange rate too.
      cost_npr_paisa: 0,
      lead_time_days: 3,
    })),
  );
}
