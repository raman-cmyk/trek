import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BID = "66666666-6666-6666-6666-000000000016";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });

// 1) Insurance checker (public), mobile + desktop, with a couple toggles on
for (const w of [390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/insurance", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(700);
  await p.getByText("Covers trekking at high altitude").click();
  await p.getByText("Covers emergency helicopter evacuation").click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `/tmp/shots/insurance-${w}.png`, fullPage: w === 1440 });
  await ctx.close();
}

// 2) Trekker trip page with the blue TIMS card (login as liam)
const ctx = await b.newContext({ viewport: { width: 720, height: 1100 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await p.fill('input[name="email"]', "liam@example.com");
await p.fill('input[name="password"]', "TrekDemo2026");
await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForTimeout(1500);
await p.goto("http://localhost:5173/trips/" + BID, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
const hasCard = await p.getByText("Blue TIMS card").count();
console.log("trip TIMS card present:", hasCard > 0);
// scroll to the insurance section
try { await p.getByText("Insurance & TIMS").scrollIntoViewIfNeeded(); } catch {}
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/shots/trip-tims.png", fullPage: true });
await ctx.close();
await b.close();
