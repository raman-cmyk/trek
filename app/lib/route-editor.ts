/**
 * Reading a route back out of the office's edit form.
 *
 * The founder's ask, in his words: "inside the experience section there should
 * be inline editing capabilities to modify route details and itineraries,
 * allowing administrators to directly fix any issues for the guides." A guide
 * writes a route with a village misspelled or an altitude 400 m out, and until
 * now the only way to correct it was a migration.
 *
 * Parsing lives here rather than in the route module so the rules — what is
 * required, what an empty cell means, what happens to a day somebody blanked
 * — can be tested without a database or a browser.
 */

export interface EditableStop {
  day: number;
  place: string;
  altitude_m: number;
  note?: string | null;
  hours?: string | null;
  km?: number | null;
  sleep?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Just enough of FormData to test against a plain Map. */
export interface Fields {
  get(name: string): FormDataEntryValue | null;
}

const str = (f: Fields, k: string) => String(f.get(k) ?? "").trim();

function num(f: Fields, k: string): number | null {
  const raw = str(f, k);
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** One per line, blanks dropped — the way a person actually types a list. */
export function lines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * The itinerary, row by row.
 *
 * A row with no place and no altitude is an empty row at the bottom of the
 * form and is dropped silently — the form always renders a few spare ones so
 * there is somewhere to type. A row with one but not the other is somebody
 * halfway through a thought, and that is an error rather than a silent loss.
 *
 * Days are renumbered from one on save. Nobody should have to renumber
 * fourteen rows by hand because they inserted an acclimatisation day.
 */
export function parseStops(
  f: Fields,
  count: number,
): { stops: EditableStop[]; error?: string } {
  const stops: EditableStop[] = [];
  for (let i = 0; i < count; i++) {
    const place = str(f, `stop.${i}.place`);
    const altitude = num(f, `stop.${i}.altitude_m`);
    if (!place && altitude == null) continue;
    if (!place) return { stops: [], error: `Row ${i + 1} has an altitude but no place.` };
    if (altitude == null) return { stops: [], error: `${place} needs an altitude.` };
    if (altitude < 0 || altitude > 9000) {
      return { stops: [], error: `${place}: ${altitude} m is not a height in Nepal.` };
    }
    stops.push({
      day: stops.length + 1,
      place,
      altitude_m: Math.round(altitude),
      note: str(f, `stop.${i}.note`) || null,
      hours: str(f, `stop.${i}.hours`) || null,
      km: num(f, `stop.${i}.km`),
      sleep: str(f, `stop.${i}.sleep`) || null,
      // Coordinates are not edited here — they come from the map tool — so they
      // ride along untouched rather than being wiped by a text edit.
      lat: num(f, `stop.${i}.lat`),
      lng: num(f, `stop.${i}.lng`),
    });
  }
  return { stops };
}

export interface RoutePatch {
  name: string;
  region: string;
  typical_days: number | null;
  max_altitude_m: number | null;
  distance_km: number | null;
  difficulty: string | null;
  start_point: string | null;
  end_point: string | null;
  summary: string | null;
  overview: string | null;
  highlights: string[] | null;
  getting_there: string | null;
  accommodation: string | null;
  food: string | null;
  water_note: string | null;
  packing_extra: string[] | null;
  season_months: number[];
  day_stops: EditableStop[];
}

export const DIFFICULTIES = ["easy", "moderate", "hard", "strenuous"] as const;

/**
 * The whole row, ready to write.
 *
 * The height of the route is derived from the itinerary when the itinerary has
 * one, because two places to store the same number is one place to get it
 * wrong — and the office correcting a summit altitude should not have to
 * remember to correct the header too.
 */
export function parseRoute(
  f: Fields,
  stopCount: number,
): { patch?: RoutePatch; error?: string } {
  const name = str(f, "name");
  if (!name) return { error: "A route needs a name." };
  const region = str(f, "region");
  if (!region) return { error: "A route needs a region — it is how people browse." };

  const { stops, error } = parseStops(f, stopCount);
  if (error) return { error };

  const difficulty = str(f, "difficulty");
  if (difficulty && !DIFFICULTIES.includes(difficulty as any)) {
    return { error: `"${difficulty}" is not one of the four grades.` };
  }

  const months = (str(f, "season_months") || "")
    .split(/[,\s]+/)
    .map((m) => Number(m))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);

  const typed = num(f, "max_altitude_m");
  const fromStops = stops.length ? Math.max(...stops.map((s) => s.altitude_m)) : null;

  return {
    patch: {
      name,
      region,
      typical_days: num(f, "typical_days") ?? (stops.length || null),
      max_altitude_m: fromStops ?? typed,
      distance_km: num(f, "distance_km"),
      difficulty: difficulty || null,
      start_point: str(f, "start_point") || null,
      end_point: str(f, "end_point") || null,
      summary: str(f, "summary") || null,
      overview: str(f, "overview") || null,
      highlights: lines(str(f, "highlights")).length ? lines(str(f, "highlights")) : null,
      getting_there: str(f, "getting_there") || null,
      accommodation: str(f, "accommodation") || null,
      food: str(f, "food") || null,
      water_note: str(f, "water_note") || null,
      packing_extra: lines(str(f, "packing_extra")).length ? lines(str(f, "packing_extra")) : null,
      season_months: [...new Set(months)].sort((a, b) => a - b),
      day_stops: stops,
    },
  };
}

/** What changed, for the note the office leaves behind. */
export function changedFields(before: Record<string, any>, patch: Record<string, any>): string[] {
  return Object.keys(patch).filter(
    (k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(patch[k] ?? null),
  );
}
