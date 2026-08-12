import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPerPersonUsdCents, type PriceBreakdown } from "~/lib/experience-pricing";

/**
 * Parsing and rules for the experience form — shared by the guide's editor
 * and the office's, so the two can never drift on what a valid trip is.
 */

const KINDS = new Set(["trek", "day_hike", "food_culture", "adventure", "city"]);

export interface OfferingPatch {
  kind: string;
  title: string;
  summary: string;
  route_id: string | null;
  days: number;
  min_party: number;
  max_party: number;
  cover_photo_url: string | null;
  price_breakdown: PriceBreakdown;
  price_usd_cents: number;
}

export function parseExperienceForm(form: FormData): { patch?: OfferingPatch; error?: string } {
  const kind = String(form.get("kind") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const summary = String(form.get("summary") ?? "").trim();
  const routeId = String(form.get("route_id") ?? "").trim() || null;
  const num = (k: string, lo: number, hi: number, fb: number) => {
    const v = Math.round(Number(form.get(k)));
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fb;
  };
  const usd = (k: string) => Math.max(0, Math.round((Number(form.get(k)) || 0) * 100));

  if (!KINDS.has(kind)) return { error: "Pick what kind of trip it is." };
  if (title.length < 4) return { error: "Give it a name people will recognise." };
  if (summary.length < 20) return { error: "Say a little more — two sentences sells better than none." };
  if (kind === "trek" && !routeId) return { error: "A trek needs its route." };

  const days = num("days", 1, 60, 1);
  const min_party = num("min_party", 1, 16, 1);
  const max_party = num("max_party", 1, 16, 6);
  if (min_party > max_party) return { error: "The smallest group cannot be larger than the largest." };

  const guideFee = usd("guide_fee_usd");
  if (guideFee === 0) return { error: "Put your fee in — working free is not the deal here." };

  const price_breakdown: PriceBreakdown = {
    guide_fee_total_usd_cents: guideFee,
    permits_usd_cents: usd("permits_usd"),
    porters_usd_cents: usd("porters_usd"),
    logistics_usd_cents: usd("logistics_usd"),
    trek_pct: 0.1,
    fund_pct: 0.03,
  };

  return {
    patch: {
      kind,
      title,
      summary,
      route_id: kind === "trek" ? routeId : null,
      days,
      min_party,
      max_party,
      cover_photo_url: String(form.get("cover_photo_url") ?? "").trim() || null,
      price_breakdown,
      price_usd_cents: fromPerPersonUsdCents(price_breakdown, max_party),
    },
  };
}

/** A slug from the title, unique-ified with a suffix when taken. */
export async function uniqueOfferingSlug(
  admin: SupabaseClient,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .replace(/-+$/, "") || "experience";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    let q = admin.from("offerings").select("id").eq("slug", slug);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}
