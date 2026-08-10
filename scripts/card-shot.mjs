import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
for (const [name, path, w] of [["guides","/guides",1280],["experiences","/experiences",1280],["guides-m","/guides",390]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173"+path, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(900);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  await p.screenshot({ path: `/tmp/shots/card-${name}.png` });
  console.log(`${name} overflow=${ov}`);
  await ctx.close();
}
await b.close();
