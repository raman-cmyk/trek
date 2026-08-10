import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 900, height: 1200 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/treks/ebc-classic-with-pemba", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
// toggle gear + airport add-ons on
for (const label of ["Gear rental", "Airport pickup + first-night hotel"]) {
  try { await p.locator("label", { hasText: label }).locator('input[type=checkbox]').check(); } catch(e){ console.log("toggle fail", label); }
}
await p.waitForTimeout(400);
const total = await p.locator("text=Your total").first().textContent().catch(()=>"?");
console.log("grand total row present:", !!total);
await p.getByText("What you pay").scrollIntoViewIfNeeded().catch(()=>{});
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/shots/addons.png" });
// clip just the pricing section
const box = await p.locator("section", { hasText: "What you pay" }).first().boundingBox().catch(()=>null);
if (box) await p.screenshot({ path: "/tmp/shots/addons-clip.png", clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 900) } });
await b.close();
