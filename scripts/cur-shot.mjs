import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 1200 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/treks/ebc-classic-with-pemba", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
// switch currency to EUR
await p.selectOption('select[aria-label="Display currency"]', "EUR");
await p.waitForTimeout(500);
const total = await p.locator("text=Your total").first().locator("..").textContent().catch(()=>"?");
console.log("total row (EUR):", (total||"").replace(/\s+/g," ").slice(0,80));
const box = await p.locator("section", { hasText: "What you pay" }).first().boundingBox().catch(()=>null);
if (box) await p.screenshot({ path: "/tmp/shots/currency.png", clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 560) } });
// experiences listing in EUR
await p.goto("http://localhost:5173/experiences", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(700);
const ov = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
console.log("experiences overflow:", ov);
await p.screenshot({ path: "/tmp/shots/currency-cards.png", clip: { x:0, y:180, width:1000, height:520 } });
await b.close();
