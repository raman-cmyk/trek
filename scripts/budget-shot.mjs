import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 900, height: 1500 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/treks/ebc-classic-with-pemba", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
const slider = p.locator('input[type=range][aria-label="Budget per person"]');
await slider.focus();
// move a few steps down from max to a mid config (standard/basic)
for (let i=0;i<40;i++) await p.keyboard.press("ArrowLeft");
await p.waitForTimeout(400);
await p.getByText("Set your budget").scrollIntoViewIfNeeded().catch(()=>{});
await p.waitForTimeout(300);
const box = await p.locator("section", { hasText: "What you pay" }).first().boundingBox().catch(()=>null);
if (box) await p.screenshot({ path: "/tmp/shots/budget2.png", clip: { x: box.x, y: Math.max(0, box.y+300), width: box.width, height: 620 } });
await b.close();
