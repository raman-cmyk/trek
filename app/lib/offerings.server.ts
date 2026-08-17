import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fromPerPersonUsdCents,
  hasBreakdown,
  type PriceBreakdown,
  type PriceLine,
} from "~/lib/experience-pricing";

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

  // The line-item price, when the builder sent one. Parsed defensively: this
  // arrives as JSON from a form field, so every field is checked rather than
  // trusted, and a line that survives is one we can price.
  let lines: PriceLine[] | null = null;
  const raw = String(form.get("price_lines") ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        lines = parsed
          .map((l: any, i: number): PriceLine => ({
            id: String(l?.id ?? `l${i}`).slice(0, 40),
            label: String(l?.label ?? "").trim().slice(0, 60),
            amountUsdCents: Math.max(0, Math.round((Number(l?.amountUsd) || 0) * 100)),
            basis: l?.basis === "group" ? "group" : "person",
            cadence: l?.cadence === "day" ? "day" : "trip",
            optional: !!l?.optional,
            bucket: ["guide", "permits", "porters", "logistics"].includes(l?.bucket)
              ? l.bucket
              : "logistics",
          }))
          .filter((l) => l.label.length > 0);
      }
    } catch {
      return { error: "The price didn't save. Check the lines and try again." };
    }
  }

  const price_breakdown: PriceBreakdown = lines?.length
    ? {
        // The four slots stay zero on a line-item price; every reader now asks
        // hasBreakdown() rather than testing the guide-fee slot for truthiness.
        guide_fee_total_usd_cents: 0,
        permits_usd_cents: 0,
        porters_usd_cents: 0,
        logistics_usd_cents: 0,
        trek_pct: 0.1,
        fund_pct: 0.03,
        lines,
        days,
      }
    : {
        guide_fee_total_usd_cents: usd("guide_fee_usd"),
        permits_usd_cents: usd("permits_usd"),
        porters_usd_cents: usd("porters_usd"),
        logistics_usd_cents: usd("logistics_usd"),
        trek_pct: 0.1,
        fund_pct: 0.03,
      };

  if (!hasBreakdown(price_breakdown)) {
    return { error: "Put your price in — working free is not the deal here." };
  }
  if (lines?.length && !lines.some((l) => !l.optional && l.amountUsdCents > 0)) {
    return { error: "At least one line has to be part of the price, not an extra." };
  }

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
