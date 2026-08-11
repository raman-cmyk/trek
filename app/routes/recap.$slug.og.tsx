import type { Route } from "./+types/recap.$slug.og";
import { ImageResponse } from "workers-og";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { OG_FONT_B64 } from "~/lib/og-font";

function fontData(): ArrayBuffer {
  const bin = atob(OG_FONT_B64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

// Auto-generated OpenGraph image so recaps unfurl beautifully (docs/01, docs/04).
export async function loader({ params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const admin = createAdminClient(env);
  const { data: recap } = await admin
    .from("recaps")
    .select("stats, booking:bookings(offering:offerings(title), guide:guides(users(full_name)))")
    .eq("slug", params.slug)
    .eq("visible", true)
    .maybeSingle();

  const title = (recap as any)?.booking?.offering?.title ?? "A Himalayan trek";
  const guide = (recap as any)?.booking?.guide?.users?.full_name ?? "a Trek guide";
  const stats = (recap as any)?.stats ?? {};
  const meta = [
    stats.days ? `${stats.days} days` : null,
    stats.max_altitude_m ? `${stats.max_altitude_m}m` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const html = `
    <div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;padding:72px;background:linear-gradient(135deg,#1e3a5f,#c2410c);color:white;font-family:Lib;">
      <div style="display:flex;font-size:34px;letter-spacing:2px;opacity:0.85;">TREK · NEPAL</div>
      <div style="display:flex;flex-direction:column;">
        <div style="display:flex;font-size:76px;font-weight:700;line-height:1.05;">${title}</div>
        <div style="display:flex;font-size:40px;margin-top:24px;opacity:0.95;">${meta}</div>
        <div style="display:flex;font-size:40px;margin-top:8px;opacity:0.95;">Guided by ${guide}</div>
      </div>
      <div style="display:flex;font-size:30px;opacity:0.8;">Know who’s walking with you.</div>
    </div>`;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Lib", data: fontData(), weight: 400, style: "normal" }],
  });
}
