import type { SupabaseClient } from "@supabase/supabase-js";
import {
  partyAmounts,
  hasBreakdown,
  type PriceBreakdown,
  type PriceLine,
} from "~/lib/experience-pricing";
import { composePackage } from "~/lib/packages";
import { computeDeposit } from "~/lib/pricing";

/**
 * Making a package.
 *
 * Three places send one — the guide's request list, a message thread, and a
 * trip group's chat — and they must produce exactly the same thing: the offering's own breakdown with
 * this trip's changes applied, priced by the same arithmetic the listing uses,
 * snapshotted so a later edit to the listing cannot move a price somebody has
 * already been shown.
 */

export interface ProposalInput {
  guideId: string;
  trekkerId: string;
  offeringId: string;
  /** One of these; a proposal about none of them is about nothing. */
  enquiryId?: string | null;
  conversationId?: string | null;
  /** A package proposed to a whole group, in the group's own chat (0065). */
  groupId?: string | null;
  startDate: string;
  days: number;
  partySize: number;
  includedOptionIds: string[];
  extraLines?: PriceLine[];
  note?: string | null;
}

export interface ProposalResult {
  id?: string;
  totalUsdCents?: number;
  depositUsdCents?: number;
  error?: string;
}

/** Read one number out of a form, clamped, with a fallback. */
export function clamp(v: FormDataEntryValue | null, lo: number, hi: number, fb: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : fb;
}

/**
 * The one line a guide can write for this trip alone — a helicopter out, a
 * night in Kathmandu. Anything they charge for repeatedly belongs in the
 * listing instead, which is why there is one of these and not a builder.
 */
export function extraLineFrom(form: FormData): PriceLine[] {
  const label = String(form.get("extra_label") ?? "").trim().slice(0, 60);
  const usd = Math.max(0, Number(form.get("extra_usd")) || 0);
  if (!label || usd <= 0) return [];
  return [
    {
      id: `extra-${Date.now()}`,
      label,
      amountUsdCents: Math.round(usd * 100),
      basis: "person",
      cadence: "trip",
      optional: false,
      bucket: "logistics",
    },
  ];
}

export async function createProposal(
  admin: SupabaseClient,
  input: ProposalInput,
): Promise<ProposalResult> {
  const { data: offering } = await admin
    .from("offerings")
    .select("id, days, price_breakdown")
    .eq("id", input.offeringId)
    .maybeSingle();
  const base = (offering?.price_breakdown ?? null) as PriceBreakdown | null;
  if (!hasBreakdown(base)) {
    return { error: "This trip has no itemised price yet — price it in Experiences first." };
  }

  const days = Math.max(1, Math.min(60, Math.round(input.days) || offering?.days || 1));
  const partySize = Math.max(1, Math.min(24, Math.round(input.partySize) || 1));
  const composed = composePackage(base, {
    days,
    includedOptionIds: input.includedOptionIds,
    extraLines: input.extraLines,
  });
  const amounts = partyAmounts(composed, partySize, input.startDate);
  const daysUntil = Math.round(
    (Date.parse(input.startDate) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000,
  );
  const deposit = computeDeposit(amounts.totalUsdCents, daysUntil);

  const { data: created, error } = await admin
    .from("package_proposals")
    .insert({
      enquiry_id: input.enquiryId ?? null,
      conversation_id: input.conversationId ?? null,
      group_id: input.groupId ?? null,
      offering_id: input.offeringId,
      guide_id: input.guideId,
      trekker_id: input.trekkerId,
      start_date: input.startDate,
      days,
      party_size: partySize,
      price_breakdown: composed,
      total_usd_cents: amounts.totalUsdCents,
      deposit_usd_cents: deposit,
      note: input.note ?? null,
    })
    .select("id, total_usd_cents, deposit_usd_cents")
    .single();
  if (error || !created) return { error: "That didn't send. Try again." };

  return {
    id: created.id,
    totalUsdCents: created.total_usd_cents,
    depositUsdCents: created.deposit_usd_cents,
  };
}
