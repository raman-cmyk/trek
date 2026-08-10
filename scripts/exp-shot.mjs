import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SLUG = "ebc-classic-with-pemba";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
for (const w of [420, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1100 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/treks/" + SLUG, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(900);
  // bump group to 3 to show the savings + recompute
  try {
    const plus = p.getByRole("button", { name: "More" }).first();
    await plus.click(); await p.waitForTimeout(200); await plus.click(); await p.waitForTimeout(400);
  } catch (e) { console.log("stepper:", String(e).slice(0,50)); }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  await p.screenshot({ path: `/tmp/shots/exp-${w}.png`, fullPage: true });
  console.log(`w=${w} overflow=${overflow}`);
  await ctx.close();
}
await b.close();
