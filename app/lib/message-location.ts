/**
 * A place, inside a message.
 *
 * "Make it easy for the guide to share location." On a trek that is not a
 * nicety: it is how a trekker finds the guide at six in the morning in
 * Thamel, how the office knows where a group actually is, and how somebody
 * standing at the wrong bridge gets to the right one.
 *
 * A location rides inside the message body, exactly as a photograph does
 * (app/lib/message-photos.ts), which means no new column, no new send path,
 * and both threads render it without being told. Masking already steps over
 * whole URLs, so the link survives the pre-deposit filter intact.
 *
 * Crucially this parses map links people ALREADY send. Guides paste Google
 * Maps links, because that is what their phone gives them when they press
 * share. Those become a proper pin here rather than ninety characters of
 * query string — which is the difference between a feature people use and a
 * button nobody presses.
 */

export interface SharedLocation {
  lat: number;
  lng: number;
  /** Whatever was written beside the link — "the bridge below Jagat". */
  label: string | null;
  /** Metres, when the phone knew. Worth showing on a mountain. */
  altitudeM: number | null;
  /** The link as sent, so "open in maps" goes where the sender meant. */
  url: string;
}

export interface BodyParts {
  /** What is left to read once the locations are lifted out. */
  text: string;
  locations: SharedLocation[];
}

const URL_RE = /(?:https?:\/\/|geo:)\S+/gi;

/** Our own canonical form — OpenStreetMap, which needs no key and no account. */
export function osmUrl(lat: number, lng: number, zoom = 16): string {
  const la = round(lat);
  const ln = round(lng);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=${zoom}/${la}/${ln}`;
}

/**
 * The line the share button writes.
 *
 * Label first, then the link, on one line — so a person reading it without
 * any of our rendering still gets a sentence and a working link, and so the
 * parser can take the label from the words beside the URL.
 */
export function locationLine(loc: {
  lat: number;
  lng: number;
  label?: string | null;
  altitudeM?: number | null;
}): string {
  const bits = [(loc.label ?? "").trim()].filter(Boolean);
  if (loc.altitudeM != null && Number.isFinite(loc.altitudeM)) {
    bits.push(`${Math.round(loc.altitudeM).toLocaleString("en-US")} m`);
  }
  const head = bits.join(" · ");
  return `${head ? `${head} — ` : ""}${osmUrl(loc.lat, loc.lng)}`;
}

/**
 * Coordinates out of a map link, whoever's app made it.
 *
 * Returns null for a link we cannot read — a Google short link, say, which
 * only resolves by following a redirect we are not going to make from a
 * message thread. Those stay ordinary links, which is dull but never wrong.
 */
export function coordsFromUrl(url: string): { lat: number; lng: number } | null {
  const u = url.trim();

  // geo:27.7172,85.3240 — the actual standard, and what Android's share sheet
  // produces for some apps.
  const geo = u.match(/^geo:(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
  if (geo) return check(geo[1], geo[2]);

  // OpenStreetMap's marker form, which is what we write ourselves.
  const mlat = u.match(/[?&]mlat=(-?\d+(?:\.\d+)?)/i);
  const mlon = u.match(/[?&]mlon=(-?\d+(?:\.\d+)?)/i);
  if (mlat && mlon) return check(mlat[1], mlon[1]);

  // Google Maps' @lat,lng,zoom — the commonest paste by a distance.
  const at = u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return check(at[1], at[2]);

  // ?q= / ?ll= / ?daddr= / ?destination= carrying a pair. Google, Apple, Waze.
  const pair = u.match(
    /[?&](?:q|ll|daddr|saddr|destination|center|sll)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i,
  );
  if (pair) return check(pair[1], pair[2]);

  // OSM's hash form: #map=15/27.9881/86.9250.
  const hash = u.match(/#map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i);
  if (hash) return check(hash[1], hash[2]);

  return null;
}

/**
 * Split a body into what to read and where to draw a pin.
 *
 * A line that carries a readable map link becomes a location, and the rest of
 * that line is its label. Everything else is text. A link we cannot read is
 * left exactly where it was — it is still a link, and still works.
 */
export function splitLocations(body: string): BodyParts {
  const locations: SharedLocation[] = [];
  const kept: string[] = [];

  for (const line of (body ?? "").split("\n")) {
    const urls = line.match(URL_RE) ?? [];
    let found: SharedLocation | null = null;

    for (const url of urls) {
      const coords = coordsFromUrl(url);
      if (!coords) continue;
      const rest = line.replace(url, "").trim();
      found = {
        ...coords,
        label: labelOf(rest),
        altitudeM: altitudeOf(rest),
        url,
      };
      break;
    }

    if (found) {
      // The same place twice in one message is a double-send, not two pins.
      if (!locations.some((l) => l.lat === found!.lat && l.lng === found!.lng)) {
        locations.push(found);
      }
    } else {
      kept.push(line);
    }
  }

  return {
    text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    locations,
  };
}

/** Is this message nothing but a place? */
export function isLocationOnly(body: string): boolean {
  const { text, locations } = splitLocations(body);
  return locations.length > 0 && text === "";
}

/** Coordinates as a person reads them, not as a float. */
export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

/** Where "open in maps" goes for somebody who does not use OpenStreetMap. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${round(lat)},${round(lng)}`;
}

function labelOf(rest: string): string | null {
  const cleaned = rest
    // The em dash our own line uses to join the label to the link.
    .replace(/[—–-]\s*$/, "")
    // The altitude, which is pulled out separately rather than left in the words.
    .replace(/(^|·)\s*[\d,]+\s*m\s*(·|—|–|-)?\s*$/i, "")
    .replace(/^[·—–-]+\s*/, "")
    .replace(/\s*[·—–-]+\s*$/, "")
    .trim();
  return cleaned || null;
}

function altitudeOf(rest: string): number | null {
  const m = rest.match(/([\d,]+)\s*m\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  // Nepal's low point is about 60 m and its high point 8,849 m. Anything
  // outside that in a trekking message is somebody's room number.
  return Number.isFinite(n) && n > 0 && n <= 9000 ? n : null;
}

function check(a: string, b: string): { lat: number; lng: number } | null {
  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Null Island is a parsing failure, not a place anybody is standing.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function round(n: number): number {
  // Five decimals is about a metre — finer than any phone, and it keeps the
  // link short enough to read.
  return Math.round(n * 1e5) / 1e5;
}
