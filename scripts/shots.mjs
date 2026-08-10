import { chromium } from "playwright-core";
const base = "http://localhost:5173";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const pages = [["home","/"],["guides","/guides"],["experiences","/experiences"],["trust","/trust"],["guide-profile","/guides/pemba-sherpa"]];
const widths = [390, 768, 1440];
const browser = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
for (const [name, path] of pages) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(900);
      // check for horizontal overflow at this width
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      await page.screenshot({ path: `/tmp/shots/${name}-${w}.png`, fullPage: w === 1440 });
      console.log(`ok ${name}-${w}${overflow ? "  ⚠ H-OVERFLOW" : ""}`);
    } catch (e) { console.log(`FAIL ${name}-${w}: ${String(e).slice(0,70)}`); }
    await ctx.close();
  }
}
await browser.close();
