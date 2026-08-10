import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BID = "77777777-0000-0000-0000-0000000000aa";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 480, height: 1100 } });
const p = await ctx.newPage();

// log in as liam (trekker)
await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await p.fill('input[name="email"]', "liam@example.com");
await p.fill('input[name="password"]', "TrekDemo2026");
await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForTimeout(1400);

// checkout — pick a 3× instalment plan
await p.goto(`http://localhost:5173/checkout/${BID}`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
let txt = await p.evaluate(() => document.body.innerText);
console.log("checkout has 'Split the balance':", txt.includes("Split the balance"));
try {
  await p.getByRole("button", { name: "3×" }).click();
  await p.waitForTimeout(300);
  console.log("clicked 3× plan");
} catch (e) { console.log("3x button:", String(e).slice(0, 60)); }
await p.screenshot({ path: "/tmp/shots/checkout-instalments.png", fullPage: true });

// pay the deposit (mock) → generates the schedule for the chosen plan
await p.getByRole("button", { name: /Pay .* deposit/ }).click();
await p.waitForTimeout(1800);
console.log("after pay url:", p.url());

// trips page should now show the payment plan
txt = await p.evaluate(() => document.body.innerText);
console.log("trips has 'Payment plan':", txt.includes("Payment plan"));
console.log("trips has 'interest-free':", txt.includes("interest-free"));
await p.screenshot({ path: "/tmp/shots/trips-instalments.png", fullPage: true });

await b.close();
