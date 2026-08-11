/**
 * Events — the pure part.
 *
 * An event is a trip proposed by a member of the public: a photographer taking
 * eight people to Gokyo, a yoga teacher running a week in Langtang. They bring
 * the group; Trek brings the permits, the guide and the audience.
 *
 * The state machine is small and the transitions are the product decision, so
 * they live here where they can be read and tested rather than being spread
 * across three route files as `if (status === …)`.
 */

export type EventStatus =
  | "draft"
  | "submitted"
  | "accepted"
  | "review"
  | "live"
  | "declined"
  | "cancelled";

export interface TrekEvent {
  id: string;
  slug: string;
  organiser_id: string;
  status: EventStatus;
  title: string;
  pitch: string | null;
  route_id: string | null;
  region: string | null;
  start_date: string | null;
  end_date: string | null;
  max_people: number;
  price_usd_cents: number | null;
  summary: string | null;
  included: string | null;
  excluded: string | null;
  meeting_point: string | null;
  cover_photo_url: string | null;
  guide_id: string | null;
  decline_reason: string | null;
}

/** What the organiser is being asked to do next, in their words. */
export const STATUS_COPY: Record<EventStatus, { label: string; note: string }> = {
  draft: { label: "Draft", note: "Only you can see this. Send it when you are ready." },
  submitted: { label: "With the office", note: "We are reading it. Usually a day or two." },
  accepted: {
    label: "Accepted — fill it in",
    note: "We said yes. Add the detail and send it back to go live.",
  },
  review: { label: "Final check", note: "We are checking the details before it goes live." },
  live: { label: "Live", note: "It is on the site and people can join." },
  declined: { label: "Not this time", note: "" },
  cancelled: { label: "Cancelled", note: "" },
};

/**
 * Can the organiser still edit? Once live the office holds the pen — the page
 * is carrying our name and a guide's calendar by then.
 */
export function organiserCanEdit(status: EventStatus): boolean {
  return status === "draft" || status === "accepted" || status === "review" || status === "submitted";
}

/** What a proposal needs before the office will look at it. */
export function validateProposal(e: Partial<TrekEvent>): string | null {
  if (!e.title?.trim() || e.title.trim().length < 3) {
    return "Give it a name people would recognise.";
  }
  if (!e.pitch?.trim() || e.pitch.trim().length < 40) {
    return "Tell us what it is and who it is for — a few sentences, not one line.";
  }
  const max = e.max_people ?? 0;
  if (max < 2 || max > 40) return "How many people? Between 2 and 40.";
  if (e.start_date && e.end_date && e.end_date < e.start_date) {
    return "The end date is before the start date.";
  }
  return null;
}

/**
 * What an accepted event still needs before it can go live.
 *
 * Returns the list rather than the first problem: the organiser is filling in
 * a page, and a form that reveals one missing field at a time is the reason
 * people abandon them.
 */
export function missingForLive(e: Partial<TrekEvent>): string[] {
  const missing: string[] = [];
  if (!e.start_date || !e.end_date) missing.push("the dates");
  if (!e.summary?.trim()) missing.push("a description");
  if (!e.cover_photo_url) missing.push("a cover photo");
  if (!e.meeting_point?.trim()) missing.push("where it starts");
  if (e.price_usd_cents == null) missing.push("a price per person");
  return missing;
}

/** Only the office moves an event along, and only in these directions. */
export const OPS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ["cancelled"],
  submitted: ["accepted", "declined"],
  accepted: ["review", "cancelled"],
  review: ["live", "accepted", "declined"],
  live: ["cancelled"],
  declined: ["submitted"],
  cancelled: [],
};

export function opsCanMove(from: EventStatus, to: EventStatus): boolean {
  return (OPS_TRANSITIONS[from] ?? []).includes(to);
}

/** Places left, never below zero however the signups add up. */
export function placesLeft(maxPeople: number, taken: number): number {
  return Math.max(0, maxPeople - Math.max(0, taken));
}

export function eventSlug(title: string, random: string): string {
  const stem = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/-+$/, "");
  return `${stem || "event"}-${random}`;
}

/** "12–19 Oct 2026", "28 Sep – 4 Oct 2026". Built in UTC so SSR agrees. */
export function eventDates(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "Dates to be set";
  const s = new Date(startIso + "T00:00:00Z");
  const e = endIso ? new Date(endIso + "T00:00:00Z") : s;
  const mon = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = e.getUTCFullYear();
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === year) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${mon(s)} ${year}`;
  }
  return `${s.getUTCDate()} ${mon(s)} – ${e.getUTCDate()} ${mon(e)} ${year}`;
}
