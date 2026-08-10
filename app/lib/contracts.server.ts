import type { SupabaseClient } from "@supabase/supabase-js";
import { formatUsd, formatNpr } from "~/lib/pricing";

export const COMPANY_NAME = "Trek — Grey Floor Pvt. Ltd.";

/** Fill {{placeholders}} in a template body. Unknown keys are left blank. Pure. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key) => vars[key] ?? "");
}

/**
 * Auto-generate + auto-sign the Company↔Guide contract for a booking, at the
 * moment the guide accepts it. Idempotent (contracts.booking_id is unique) and
 * best-effort: if no active template exists, it no-ops rather than blocking the
 * booking. The guide's acceptance is their signature; the Company counter-signs.
 */
export async function generateContractForBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ created: boolean; reason?: string }> {
  const { data: existing } = await admin
    .from("contracts")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) return { created: false, reason: "exists" };

  const { data: tpl } = await admin
    .from("contract_templates")
    .select("id, title, body, version")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!tpl) return { created: false, reason: "no_active_template" };

  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, guide_id, start_date, end_date, party_size, guide_fee_usd_cents, commission_usd_cents, guide_payout_npr_paisa, offering:offerings(title), guide:guides(users(full_name))",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return { created: false, reason: "no_booking" };

  const now = new Date().toISOString();
  const vars: Record<string, string> = {
    company_name: COMPANY_NAME,
    guide_name: (b as any).guide?.users?.full_name ?? "the Guide",
    offering_title: (b as any).offering?.title ?? "the trek",
    start_date: b.start_date ?? "",
    end_date: b.end_date ?? "",
    party_size: String(b.party_size ?? ""),
    guide_fee: formatUsd(b.guide_fee_usd_cents ?? 0),
    commission: formatUsd(b.commission_usd_cents ?? 0),
    guide_payout_npr: formatNpr(b.guide_payout_npr_paisa ?? 0),
    signed_date: now.slice(0, 10),
  };

  const terms = {
    guide_fee_usd_cents: b.guide_fee_usd_cents,
    commission_usd_cents: b.commission_usd_cents,
    guide_payout_npr_paisa: b.guide_payout_npr_paisa,
    start_date: b.start_date,
    end_date: b.end_date,
  };

  const { error } = await admin.from("contracts").insert({
    booking_id: bookingId,
    guide_id: b.guide_id,
    template_id: tpl.id,
    template_version: tpl.version,
    title: tpl.title,
    body_rendered: renderTemplate(tpl.body, vars),
    terms,
    company_signatory: COMPANY_NAME,
    // Auto-signed: guide accepted (their signature) + Company counter-signs.
    company_signed_at: now,
    guide_signed_at: now,
    status: "signed",
  });
  if (error) return { created: false, reason: error.message };
  return { created: true };
}
