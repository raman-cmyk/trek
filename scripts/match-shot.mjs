import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
for (const w of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1200 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/match", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(700);
  // pick Khumbu + Oct + budget $1500 + tough, then submit
  await p.getByText("Khumbu", { exact: true }).click();
  await p.getByText("Oct", { exact: true }).click();
  await p.getByText("Under $1,500", { exact: true }).click();
  await p.getByText("Bring it on", { exact: true }).click();
  await p.getByRole("button", { name: "Match me" }).click();
  await p.waitForTimeout(1200);
  const txt = await p.evaluate(() => document.body.innerText);
  if (w === 390) {
    console.log("results:", /guides? fit/.test(txt));
    console.log("reason region:", txt.includes("Khumbu"));
    console.log("reason month:", txt.includes("October"));
    console.log("reason budget:", txt.includes("Fits your budget"));
    console.log("reason rating:", txt.includes("Rated"));
    console.log("cta offering:", txt.includes("from $"));
  }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  console.log(`w=${w} overflow=${overflow}`);
  await p.screenshot({ path: `/tmp/shots/match-${w}.png`, fullPage: true });
  await ctx.close();
}
await b.close();
