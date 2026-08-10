import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
for (const w of [390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 860 } });
  const p = await ctx.newPage();
  const shot = (n) => p.screenshot({ path: `/tmp/shots/signup-${n}-${w}.png` });
  await p.goto("http://localhost:5173/signup", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(700);
  await shot("1name");
  await p.fill('input[placeholder="First name"]', "Alex");
  await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForTimeout(600);
  await shot("2country");
  await p.getByRole("button", { name: "Germany" }).click();
  await p.waitForTimeout(700);
  await shot("3email");
  await p.fill('input[type="email"]', "alex.demo@example.com");
  await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForTimeout(1500);
  await shot("4code");
  const body = await p.evaluate(() => document.body.innerText.slice(0, 400));
  console.log(`w=${w} after-email:`, body.replace(/\n+/g, " | ").slice(0, 160));
  await ctx.close();
}
await b.close();
